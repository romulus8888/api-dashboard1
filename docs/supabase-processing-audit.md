# Audit trail обработки заявок (`job_processing_audit`)

SQL-миграция для технического audit trail и RPC `claim_job_for_processing`.
В репозитории также есть **импортируемые** n8n workflow JSON (polling + error
handler + Telegram-нода), но они **не подключены автоматически**: n8n локальный,
workflows неактивны после импорта, Error Workflow назначается вручную в UI.
Frontend и типы TypeScript этой миграцией не меняются.

Миграция: `supabase/migrations/20260814000000_create_job_processing_audit.sql`.

## Назначение

`public.job_processing_audit` — технический журнал того, как входящая заявка
проходит автоматическую обработку. Он решает три задачи:

1. **Атомарный захват заявки.** Первый воркер, вызвавший
   `claim_job_for_processing()`, получает право на обработку; параллельные и
   повторные вызовы получают отказ без гонок и без блокировок на стороне
   приложения.
2. **Защита от повторной обработки.** Уникальный ключ идемпотентности не даёт
   обработать одно и то же событие дважды — при ретраях n8n, дублирующихся
   webhook'ах и ручных перезапусках.
3. **Диагностика.** По каждой заявке видно, какие этапы прошли, чем
   закончились и в рамках какого запуска n8n это происходило.

Таблица **не предназначена для пользователей**: RLS включён, ни одной policy нет,
гранты для `anon` и `authenticated` отозваны. Frontend не может ни прочитать, ни
изменить эти данные.

## Предпосылки о схеме `jobs`

В репозитории **нет SQL-миграций** для `public.jobs`, поэтому реальные типы
колонок по исходникам подтвердить нельзя. В `src/types/job.ts` поле `id`
объявлено как `string`, что в Postgres соответствует и `uuid`, и `text`.

**Миграция исходит из того, что `public.jobs.id` имеет тип `uuid`.**

Чтобы это допущение не превратилось в тихую ошибку, в начале миграции стоит
guard-блок: если таблицы `public.jobs` нет или тип `id` отличается от `uuid`,
миграция прерывается с понятным сообщением. Если в реальной БД используется
другой тип, нужно синхронно поменять тип `job_processing_audit.job_id` и
сигнатуру `claim_job_for_processing(p_job_id ...)`.

## Структура записи

| Поле | Назначение |
| --- | --- |
| `id` | PK, `uuid`, генерируется автоматически |
| `job_id` | FK на `public.jobs(id)`, `ON DELETE CASCADE` |
| `event_type` | Исходное событие, например `job.created` |
| `step` | Этап: `received`, `validated`, `triaged`, `notification_sent`, … |
| `outcome` | `processing`, `succeeded`, `failed`, `skipped` (закрытый список) |
| `idempotency_key` | Ключ дедупликации логического события |
| `workflow_execution_id` | ID запуска n8n, nullable |
| `details` | JSONB-объект с технической метаинформацией, по умолчанию `{}` |
| `error_message` | Текст ошибки, nullable |
| `created_at` / `updated_at` | `updated_at` поддерживается триггером |

Списки `event_type` и `step` намеренно открытые (проверяется только непустота):
новый этап пайплайна не должен требовать миграции. `outcome` — закрытый список,
потому что это полный жизненный цикл этапа.

## Ключ идемпотентности

Формат: `<event_type>:<идентификатор сущности>[:<уточнение>]`.

| Ситуация | Пример ключа |
| --- | --- |
| Первичный приём заявки | `job.created:3f6c1b2a-...-9d4e` |
| Повторная обработка после смены статуса | `job.updated:3f6c1b2a-...-9d4e:v2` |
| Ручной перезапуск инцидента | `job.created:3f6c1b2a-...-9d4e:replay-2026-08-14` |

Для первичного приёма используется именно `job.created:<job_id>` — это
соглашение зашито в `claim_job_for_processing()`.

Уникальность задана парой **`(idempotency_key, step)`**, а не одним
`idempotency_key`. Причина: одно логическое событие законно порождает несколько
записей по мере прохождения пайплайна, и глобальная уникальность уничтожила бы
сам audit trail. В пределах одного этапа дубликат всегда означает повтор.

## Как n8n вызывает RPC

Первым шагом workflow, **до любой полезной работы**, вызывается RPC. Запрос идёт
через PostgREST под ключом `service_role`:

```http
POST {SUPABASE_URL}/rest/v1/rpc/claim_job_for_processing
apikey: {SERVICE_ROLE_KEY}
Authorization: Bearer {SERVICE_ROLE_KEY}
Content-Type: application/json

{
  "p_job_id": "3f6c1b2a-...-9d4e",
  "p_idempotency_key": "job.created:3f6c1b2a-...-9d4e",
  "p_workflow_execution_id": "{{ $execution.id }}"
}
```

Ответ — одно булево значение.

### Как интерпретировать результат

| Ответ | Что произошло | Что делать n8n |
| --- | --- | --- |
| `true` | Заявка захвачена этим запуском; создана запись `received` / `processing` | Продолжать обработку |
| `false` | Событие с этим ключом уже захвачено ранее | **Остановить workflow штатно**, без ошибки и без алерта |

`false` — это не сбой, а нормальный исход при ретрае или дубле. Ошибку RPC
выбрасывает только в реальных дефектах: `p_job_id` не существует (нарушение
внешнего ключа), `p_job_id` равен NULL, ключ идемпотентности пустой.

### Дальнейшие этапы

Захваченную запись завершают обновлением:

```sql
update public.job_processing_audit
set outcome = 'succeeded',
    details = jsonb_build_object('duration_ms', 842)
where idempotency_key = 'job.created:<job_id>'
  and step = 'received';
```

Следующие этапы добавляются отдельными строками с тем же `idempotency_key` и
другим `step` — уникальное ограничение этому не мешает и одновременно защищает
каждый этап от повторного выполнения.

## Безопасное содержимое `details`

`details` — это диагностика, а не копия заявки. Полный payload, email клиента,
токены и ключи туда попадать не должны.

Безопасно:

```json
{ "validation": "passed", "rules_checked": 7, "duration_ms": 842 }
{ "step": "triaged", "assigned_queue": "backend", "priority": "high" }
{ "notification": "telegram", "chat_ref": "ops-alerts", "message_id": 10472 }
{ "retry": 2, "reason_code": "upstream_timeout" }
```

Небезопасно:

```json
{ "client_email": "person@example.com" }          // персональные данные
{ "payload": { "title": "...", "description": "..." } }  // копия заявки
{ "telegram_bot_token": "..." }                    // секрет
{ "authorization": "Bearer ..." }                  // секрет
```

Если для разбора инцидента нужна ссылка на данные заявки — достаточно `job_id`:
сама заявка лежит в `public.jobs`.

## Права доступа

| Роль | Таблица `job_processing_audit` | RPC `claim_job_for_processing` |
| --- | --- | --- |
| `anon` | нет доступа (RLS + REVOKE) | нет `EXECUTE` |
| `authenticated` | нет доступа (RLS + REVOKE) | нет `EXECUTE` |
| `service_role` | `SELECT`, `INSERT`, `UPDATE` | `EXECUTE` |

`DELETE` не выдан никому: журнал только дополняется, а строки исчезают лишь
каскадом при удалении заявки.

Защита двухслойная. RLS с нулём policy уже закрывает таблицу, но Supabase по
умолчанию выдаёт `anon` и `authenticated` гранты на новые таблицы в схеме
`public`, поэтому миграция дополнительно делает явный `REVOKE`.

**Про `service_role`:** ключ используется только на сервере — в n8n
credentials или серверном окружении. Его нельзя класть в `NEXT_PUBLIC_*`
переменные, в Vercel public env, в код frontend или в браузер: он обходит RLS и
даёт полный доступ к базе. Frontend продолжает работать под anon-ключом и о
существовании audit-таблицы не знает.

## Применение миграции

Миграция подготовлена для ручного применения; автоматически она не выполнялась.

- Supabase CLI: `supabase db push`
- Либо вручную: выполнить содержимое файла в SQL Editor проекта Supabase.

Повторное применение на локальной БД безопасно: используются
`create table if not exists`, `create index if not exists`,
`create or replace function` и пересоздание триггера. Guard-блок при этом
намеренно остаётся строгим и падает на несовместимой схеме `jobs`.

## Ручная проверка

Все запросы ниже выполняются в **Supabase SQL Editor** под административной
ролью проекта. Ни один из них не выполнялся автоматически — миграция не
применялась к базе, поведение RPC проверено только по коду.

### 1. Идемпотентность (главный сценарий)

Запускается одним блоком и сам себя проверяет: при отклонении от ожидаемого
поведения он завершится ошибкой, а не тихо вернёт результат.

```sql
do $$
declare
  v_job_id uuid;
  v_key    text;
  v_first  boolean;
  v_second boolean;
  v_rows   integer;
begin
  select id into v_job_id
  from public.jobs
  order by created_at desc
  limit 1;

  if v_job_id is null then
    raise exception 'В public.jobs нет ни одной заявки — создайте тестовую и повторите.';
  end if;

  v_key := 'job.created:' || v_job_id::text;

  -- Первый захват.
  v_first := public.claim_job_for_processing(v_job_id, v_key, 'manual-check-1');

  -- Повторный вызов с тем же ключом: должен вернуть false, а не упасть.
  v_second := public.claim_job_for_processing(v_job_id, v_key, 'manual-check-2');

  select count(*) into v_rows
  from public.job_processing_audit
  where idempotency_key = v_key
    and step = 'received';

  if v_first is not true then
    raise exception 'Ожидался first_claim = true, получено %', v_first;
  end if;

  if v_second is not false then
    raise exception 'Ожидался second_claim = false, получено %', v_second;
  end if;

  if v_rows <> 1 then
    raise exception 'Ожидалась ровно 1 запись received, найдено %', v_rows;
  end if;

  raise notice 'OK: повторный захват вернул false, дублей нет (job_id=%).', v_job_id;
end;
$$;
```

Успех — блок отработал без ошибки. Если SQL Editor не показывает `NOTICE`,
результат видно по итоговой строке:

```sql
select job_id, step, outcome, idempotency_key, workflow_execution_id, created_at
from public.job_processing_audit
where idempotency_key like 'job.created:%'
  and workflow_execution_id in ('manual-check-1', 'manual-check-2');
```

Ожидается **ровно одна** строка с `outcome = 'processing'` и
`workflow_execution_id = 'manual-check-1'`: второй вызов запись не создал.

### 2. RLS и отсутствие policy

```sql
select relrowsecurity
from pg_class
where oid = 'public.job_processing_audit'::regclass;   -- ожидается true

select count(*)
from pg_policies
where schemaname = 'public'
  and tablename = 'job_processing_audit';               -- ожидается 0
```

### 3. Гранты

```sql
select
  has_table_privilege('anon',          'public.job_processing_audit', 'select') as anon_select,
  has_table_privilege('authenticated', 'public.job_processing_audit', 'select') as auth_select,
  has_table_privilege('service_role',  'public.job_processing_audit', 'insert') as sr_insert;
-- ожидается: false, false, true

select
  has_function_privilege('anon',          'public.claim_job_for_processing(uuid, text, text)', 'execute') as anon_exec,
  has_function_privilege('authenticated', 'public.claim_job_for_processing(uuid, text, text)', 'execute') as auth_exec,
  has_function_privilege('service_role',  'public.claim_job_for_processing(uuid, text, text)', 'execute') as sr_exec;
-- ожидается: false, false, true
```

### 4. Внешний ключ и каскад

```sql
select conname, confdeltype
from pg_constraint
where conrelid = 'public.job_processing_audit'::regclass
  and contype = 'f';
-- ожидается confdeltype = 'c' (cascade)
```

### 5. Ошибка на несуществующей заявке

```sql
select public.claim_job_for_processing(
  '00000000-0000-0000-0000-000000000000'::uuid,
  'job.created:00000000-0000-0000-0000-000000000000'
);
-- ожидается ошибка внешнего ключа, а не false
```

### 6. Уборка после проверки

```sql
delete from public.job_processing_audit
where workflow_execution_id in ('manual-check-1', 'manual-check-2');
```

`DELETE` выдан только владельцу БД, поэтому уборку выполняйте в SQL Editor под
административной ролью, а не ключом `service_role`.

## Откат (rollback)

Полный текст отката продублирован закомментированным блоком в конце файла
миграции. Он удаляет **только** объекты, созданные этой миграцией; таблица
`public.jobs` и её данные не затрагиваются.

```sql
begin;

drop function if exists public.claim_job_for_processing(uuid, text, text);

drop table if exists public.job_processing_audit;

drop function if exists public.set_job_processing_audit_updated_at();

commit;
```

Порядок обратен порядку создания. Отдельно удалять индексы, ограничения и
триггер не нужно — они уходят вместе с таблицей. `CASCADE` не используется
намеренно: если на эти объекты неожиданно кто-то ссылается, откат должен
упасть с ошибкой, а не расширять область удаления молча.

Вместе с таблицей удаляется и вся история обработки. Если она ещё нужна,
выгрузите её до отката:

```sql
select * from public.job_processing_audit order by created_at;
```

## Lead automation (Phase 8)

Leads use `public.lead_processing_audit` with versioned idempotency keys:

`lead.created:<lead_id>:attempt:<automation_attempt>`

RPCs (migration `20260911200000_create_lead_automation_rpcs.sql`):

| RPC | Purpose |
| --- | --- |
| `claim_lead_for_processing(lead_id, execution_id)` | Atomic claim; sets `automation_state=processing` |
| `complete_lead_processing(lead_id, execution_id)` | Closes `received` as `succeeded` |
| `fail_lead_processing(execution_id, error, details)` | Marks every open claim `failed`, sets each lead `automation_state=failed`, transitions each lead to `needs_review`; returns affected count |
| `retry_lead_automation(lead_id, changed_by)` | Manual recovery; increments attempt, appends `requeue` audit row |

Verification: `supabase/verify/phase8_lead_automation.sql` (rollback-safe).

n8n workflows: `automation/workflows/supabase-lead-intake-polling.json` and
`supabase-lead-intake-error-handler.json` (import inactive; assign Error Workflow
manually).
