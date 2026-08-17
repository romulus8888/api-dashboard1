# Workflow: Supabase job intake — error handler

Файл: `supabase-job-intake-error-handler.json`

Аварийный обработчик для `Supabase job intake (polling)`
(`supabase-job-intake-polling.json`). Когда основной workflow падает, этот
закрывает зависший захват: строка аудита `received` / `processing` переводится в
`failed` с коротким техническим описанием причины.

Без него оборванный запуск оставляет заявку в состоянии «взята в работу, но
ничем не завершилась», и отличить её от нормально идущей обработки нельзя.

## Что делает

| Нода | Действие |
| --- | --- |
| `Error Trigger` | Получает данные упавшего запуска: `execution.id`, имя ноды, текст ошибки |
| `Supabase — mark intake claim failed` | `PATCH /rest/v1/job_processing_audit`: строка `received` / `processing` этого запуска → `outcome = failed` + `error_message` |
| `Telegram notification (later)` | Sticky note: место для будущего уведомления, ноды пока нет |

Фильтр PATCH-запроса — `workflow_execution_id=eq.<id упавшего запуска>`,
`step=eq.received`, `outcome=eq.processing`. Тройное условие важно: обработчик
трогает только незакрытый захват именно этого запуска и не может задеть уже
успешные записи или чужие заявки.

В `error_message` попадают только имя упавшей ноды и текст ошибки, склеенные в
одну строку и обрезанные до 300 символов. Email, описание заявки, полный payload
и credentials туда не передаются; запрос идёт с `Prefer: return=minimal`, так
что Supabase не возвращает содержимое строк обратно в историю выполнений.

## Импорт

1. Откройте n8n: <http://localhost:5678>.
2. **Workflows → Import from File**.
3. Выберите `automation/workflows/supabase-job-intake-error-handler.json`.
4. Сохраните workflow.

Активировать его **не нужно**: error workflow вызывается n8n напрямую, тумблер
`Active` на это не влияет. Он относится только к триггерам по расписанию и
webhook, которых здесь нет.

## Замена placeholder URL

В единственной HTTP-ноде стоит адрес-заглушка:

```
https://YOUR_PROJECT_REF.supabase.co/rest/v1/job_processing_audit
```

Заменяется **только** `YOUR_PROJECT_REF` — на реф вашего проекта Supabase
(Project Settings → Data API → Project URL). Путь `/rest/v1/job_processing_audit`
и query-параметры остаются как есть.

Credential — тот же **Supabase API** с ключом `service_role`, что и в основном
workflow: таблица аудита закрыта RLS без policy, другие роли писать в неё не
могут. Ключ остаётся в n8n credentials и в репозиторий не попадает
(см. `docs/supabase-processing-audit.md`).

## Назначение как Error Workflow

Обработчик не подключается к основному workflow связями — он указывается в
настройках:

1. Откройте `Supabase job intake (polling)`.
2. Меню `…` в правом верхнем углу → **Settings**.
3. Поле **Error Workflow** → выберите `Supabase job intake — error handler`.
4. Сохраните workflow.

С этого момента любое падение основного workflow запускает обработчик и передаёт
ему данные упавшего запуска.

## Почему при ранней ошибке audit-записи не появится

Обработчик ничего не создаёт — он только **обновляет** уже существующую строку.
Это осознанное решение, а не упущение.

Строку `received` / `processing` создаёт исключительно
`claim_job_for_processing()`. Если запуск упал раньше успешного захвата —
например, на выборке заявок или на самом RPC-вызове, — этой строки просто нет:
PATCH отработает, но не найдёт ни одной подходящей записи и обновит ноль строк.
Ошибкой это не считается.

Так и должно быть. Без успешного захвата обработка заявки не начиналась,
писать `failed` не о чем, а вставка строки «на всякий случай» заняла бы ключ
идемпотентности `('job.created:<job_id>', 'received')` и заблокировала бы
законный повторный захват той же заявки следующим запуском. Ранние ошибки видны
в **Executions** n8n, и заявка остаётся в `pending` — её подберёт следующий
опрос.

## Ручная проверка

Error workflow вызывается для **production-запусков** (активное расписание).
Ручной `Execute workflow` в текущих версиях n8n его не запускает, поэтому тест
делается на активированном основном workflow.

1. Создайте одну заявку через форму приложения — она появится в `pending`.
2. В основном workflow откройте ноду **после** захвата — например
   `Supabase — mark job in progress` — и испортите URL: допишите к нему
   `-broken`, чтобы получилось
   `https://YOUR_PROJECT_REF.supabase.co/rest/v1/jobs-broken`. Важно ломать
   именно ноду после `Supabase — claim job processing`, иначе захват не
   произойдёт и проверять будет нечего.
3. Сохраните и активируйте основной workflow. Дождитесь срабатывания
   расписания (до минуты).
4. Убедитесь в **Executions**, что основной запуск завершился ошибкой, а
   обработчик отработал успешно.
5. Проверьте аудит в Supabase SQL Editor:

```sql
select step, outcome, error_message, details, workflow_execution_id, updated_at
from public.job_processing_audit
where job_id = '<job_id>'
order by created_at;
```

Ожидаемый результат: строка `received` имеет `outcome = failed`, заполненный
`error_message` с именем упавшей ноды и `details.source = error_handler`.
Записи `triaged` при этом нет — до неё выполнение не дошло.

### Возврат корректного URL

1. Деактивируйте основной workflow (тумблер `Active`), чтобы расписание не
   срабатывало во время правки.
2. Уберите из URL `-broken`, вернув
   `https://YOUR_PROJECT_REF.supabase.co/rest/v1/jobs` с вашим project ref.
3. Сохраните workflow и активируйте его снова, если нужно.
4. Тестовая заявка осталась в `pending` со строкой `received` / `failed`.
   Повторно её workflow не подберёт: ключ `('job.created:<job_id>', 'received')`
   уже занят, и захват вернёт `false`. Для чистого повторного теста создайте
   новую заявку или удалите тестовую строку аудита в SQL Editor:

```sql
delete from public.job_processing_audit where job_id = '<job_id>';
```

## Подключение Telegram в будущем

Sticky note в workflow отмечает место, куда встанет нода уведомления — после
`Supabase — mark intake claim failed`.

Когда дойдёт до этого:

1. Создайте Telegram-бота через `@BotFather` и получите токен.
2. В n8n: **Credentials → New → Telegram API**, вставьте токен туда. Токен
   хранится в зашифрованном виде в БД n8n (шифруется значением
   `N8N_ENCRYPTION_KEY` из `automation/.env`) и в экспортируемый JSON не
   попадает.
3. Chat ID держите вне JSON. Варианты: поле в самой ноде уже после импорта, или
   переменная окружения контейнера n8n со ссылкой
   `{{ $env.TELEGRAM_ALERT_CHAT_ID }}` в выражении ноды.
4. В текст сообщения кладите только техническое: `job_id`, имя упавшей ноды,
   execution ID, ссылку на запуск. Email клиента, описание заявки и любые ключи
   в уведомление не попадают.
5. Если workflow позже понадобится экспортировать в репозиторий, проверьте
   выгруженный JSON перед коммитом: в нём не должно быть ни токена, ни chat ID —
   только ссылка на credential по имени.
