# Workflow: Supabase job intake (polling)

Файл: `supabase-job-intake-polling.json`

Первый рабочий контур автоматизации. Раз в минуту забирает новые заявки из
Supabase, атомарно захватывает каждую через RPC `claim_job_for_processing`,
переводит в `in_progress` и пишет технический аудит.

Workflow импортируется **неактивным** (`active: false`) и ничего не делает,
пока вы не включите его вручную.

## Что делает

| Нода | Действие |
| --- | --- |
| `Schedule Trigger` | Запуск раз в минуту |
| `Supabase — fetch pending jobs` | `GET /rest/v1/jobs`: до 50 строк со `status=eq.pending`, сортировка `created_at.asc` |
| `Supabase — claim job processing` | `POST /rest/v1/rpc/claim_job_for_processing` с ключом `job.created:<job_id>` и `$execution.id` |
| `Claim succeeded?` | Продолжает только при `true` |
| `Supabase — mark job in progress` | `PATCH /rest/v1/jobs?id=eq.<job_id>` → `status = in_progress` |
| `Supabase — audit triaged` | `POST /rest/v1/job_processing_audit`: `step = triaged`, `outcome = succeeded` |
| `Supabase — complete intake claim` | `PATCH /rest/v1/job_processing_audit`: строка `received` переводится из `processing` в `succeeded` |

Из заявки выбираются только `id`, `status` и `created_at`: email, описание и
бюджет в n8n не попадают. Все пишущие запросы идут с `Prefer: return=minimal`,
поэтому Supabase не возвращает содержимое строк обратно в историю выполнений.

Ветка `false` у `Claim succeeded?` намеренно ни к чему не подключена. `false`
означает, что событие уже захвачено раньше, и это штатный исход, а не ошибка —
выполнение просто останавливается.

## Импорт

1. Откройте n8n: <http://localhost:5678>.
2. **Workflows → Import from File** (или меню `…` → *Import from File*).
3. Выберите `automation/workflows/supabase-job-intake-polling.json`.
4. Сохраните workflow. Активировать пока не нужно.

## Замена placeholder URL

Во всех пяти HTTP-нодах стоит адрес-заглушка:

```
https://YOUR_PROJECT_REF.supabase.co/rest/v1/...
```

Заменять нужно **только** `YOUR_PROJECT_REF` — на реф своего проекта Supabase
(Project Settings → Data API → Project URL). Полный путь endpoint сохраняется
как есть:

| Нода | Endpoint |
| --- | --- |
| `Supabase — fetch pending jobs` | `/rest/v1/jobs` |
| `Supabase — claim job processing` | `/rest/v1/rpc/claim_job_for_processing` |
| `Supabase — mark job in progress` | `/rest/v1/jobs` |
| `Supabase — audit triaged` | `/rest/v1/job_processing_audit` |
| `Supabase — complete intake claim` | `/rest/v1/job_processing_audit` |

Реального project ref в репозитории нет и быть не должно — правки делаются
только в вашем локальном n8n.

## Credentials

Ключ `service_role` **не хранится в этом JSON** и не должен туда попадать.
Создайте credential в n8n после импорта:

**Вариант 1 (рекомендуемый) — Supabase API.**
*Credentials → New → Supabase API*: укажите host проекта и `service_role` key.
n8n сам подставит оба обязательных заголовка — `apikey` и
`Authorization: Bearer <key>`. Все пять HTTP-нод уже настроены на этот тип
credential, останется только выбрать созданную запись в каждой ноде.

**Вариант 2 — Header Auth.**
Одна credential типа *Header Auth* задаёт один заголовок, поэтому нужны оба:
`apikey: <service_role key>` и `Authorization: Bearer <service_role key>`.
В этом случае в каждой ноде переключите *Authentication* на
`Generic Credential Type → Header Auth`, а недостающий заголовок добавьте в
секции *Headers* самой ноды.

Почему именно `service_role`: таблица `job_processing_audit` закрыта RLS без
policy, а `EXECUTE` на RPC выдан только этой роли. Ключ живёт исключительно в
n8n credentials — не в `docker-compose.yml`, не в `.env` приложения и никогда в
`NEXT_PUBLIC_*`. Подробности — в `docs/supabase-processing-audit.md`.

Перед первым запуском миграция
`supabase/migrations/20260814000000_create_job_processing_audit.sql` должна быть
применена, иначе RPC и таблица аудита не существуют.

## Тест на одной заявке

1. Создайте одну заявку через форму приложения — она появится со статусом
   `pending`.
2. В n8n откройте workflow и нажмите **Execute workflow** (ручной запуск, без
   активации расписания).
3. Проверьте результат в Supabase SQL Editor:

```sql
select id, status from public.jobs order by created_at desc limit 1;

select step, outcome, workflow_execution_id, details, created_at
from public.job_processing_audit
where job_id = '<job_id>'
order by created_at;
```

Ожидаемый результат:

- `jobs.status` = `in_progress`;
- две audit-записи по заявке: `received` / `succeeded` (создана RPC как
  `processing` и закрыта завершающей нодой) и `triaged` / `succeeded`;
- в обеих `workflow_execution_id` совпадает с ID запуска n8n.

Если выполнение оборвалось раньше завершающей ноды, строка `received` так и
останется в состоянии `processing`. Это не мусор, а намеренный сигнал:
незакрытый `processing` означает начатую, но не доведённую до конца обработку.
Именно по нему будущий error workflow (и запрос из
`docs/supabase-processing-audit.md` по индексу `outcome in ('processing',
'failed')`) сможет находить зависшие заявки.

Повторный запуск на той же заявке проверяет идемпотентность: RPC вернёт
`false`, ветка `true` не выполнится, новых записей не появится. Заявка при этом
уже не в `pending`, поэтому в следующую выборку она не попадёт.

## Чего workflow пока не делает

- Не отправляет уведомления в Telegram и никуда больше.
- Не использует публичный webhook: это polling, Supabase сюда не стучится, а
  n8n сам опрашивает базу. Публичный HTTPS-адрес и Supabase Database Webhook —
  следующий этап.
- Не обрабатывает ошибки отдельной веткой: неуспешный HTTP-запрос завершает
  выполнение ошибкой, которая видна в *Executions*. Запись `failed` в аудит
  пока не пишется, а незакрытый `received` / `processing` остаётся признаком
  оборванной обработки.

## Как отключить

- Активированный workflow выключается тумблером **Active** в правом верхнем
  углу редактора или в списке Workflows. После этого расписание не срабатывает.
- Разовая пауза без изменения статуса: **Deactivate** и повторная активация,
  когда нужно.
- Полностью убрать логику из n8n — удалить workflow из списка; на данные в
  Supabase это не влияет.

Пока workflow неактивен, расписание не работает вообще: ручной запуск через
*Execute workflow* по-прежнему доступен и меняет данные, помните об этом при
тестах на боевом проекте.
