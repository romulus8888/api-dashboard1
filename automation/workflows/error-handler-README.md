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
| `Telegram — notify intake failure` | Отправляет короткий алерт в Telegram: имя workflow, execution ID, упавшая нода, обрезанный текст ошибки |

Фильтр PATCH-запроса — `workflow_execution_id=eq.<id упавшего запуска>`,
`step=eq.received`, `outcome=eq.processing`. Тройное условие важно: обработчик
трогает только незакрытый захват именно этого запуска и не может задеть уже
успешные записи или чужие заявки.

В `error_message` попадают только имя упавшей ноды и текст ошибки, склеенные в
одну строку и обрезанные до 300 символов. Email, описание заявки, полный payload
и credentials туда не передаются; запрос идёт с `Prefer: return=minimal`, так
что Supabase не возвращает содержимое строк обратно в историю выполнений.

В Telegram уходит тот же ограниченный набор: имя workflow, execution ID, имя
упавшей ноды и текст ошибки, обрезанный до 200 символов. Email клиента,
описание заявки, payload, ключи Supabase и токен бота в сообщение не попадают.

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

В JSON основного polling workflow **нет** поля `errorWorkflow` — только
`executionOrder`. Импорт JSON **не** включает обработку ошибок; без шагов ниже
падение основного workflow не вызовет этот обработчик.

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

## Настройка Telegram-уведомления

Нода `Telegram — notify intake failure` импортируется без credential и с
заглушкой вместо чата. Пока эти два шага не сделаны, она будет падать.

### 1. Бот и токен

1. Напишите `@BotFather` в Telegram, команда `/newbot`.
2. Задайте имя и username бота (username должен заканчиваться на `bot`).
3. BotFather пришлёт токен вида `123456789:AA...`.

Токен — это полный доступ к боту. Не кладите его в `docker-compose.yml`,
`.env`, JSON workflow или сообщения — только в credential n8n.

### 2. Credential в n8n

1. **Credentials → New → Telegram API**.
2. Поле *Access Token* — токен от BotFather.
3. Сохраните под понятным именем, например `Telegram alerts bot`.

Токен хранится в БД n8n в зашифрованном виде (ключ `N8N_ENCRYPTION_KEY` из
`automation/.env`) и в экспортируемый JSON не попадает — там остаётся только
ссылка на credential.

### 3. Chat ID

1. Напишите `@userinfobot` в Telegram и отправьте любое сообщение — он ответит
   вашим числовым `Id`. Это личный chat ID.
2. Отправьте своему боту `/start`: бот не может писать первым, пока диалог не
   начат вами.

Для группы добавьте бота в неё и возьмите ID группы (отрицательное число) —
например, через того же `@userinfobot`, пересланным из группы сообщением.

### 4. Подстановка в ноду

1. Откройте ноду `Telegram — notify intake failure`.
2. *Credential to connect with* — выберите созданный `Telegram alerts bot`.
3. Поле *Chat ID* — замените `YOUR_TELEGRAM_CHAT_ID` на своё значение.
4. Текст сообщения менять не нужно: выражения сами подставят имя workflow,
   execution ID, упавшую ноду и обрезанную ошибку.
5. Сохраните workflow.

Chat ID и токен остаются только в вашем экземпляре n8n. Если потом решите
выгрузить workflow обратно в репозиторий, проверьте JSON перед коммитом: там не
должно быть ни токена, ни реального chat ID.

### 5. Проверка

Отдельного теста не нужно — воспользуйтесь сценарием из раздела «Ручная
проверка» выше. При падении основного workflow, у которого этот обработчик уже
назначен как **Error Workflow**, в Telegram придёт сообщение вида:

```
n8n automation failure

Workflow: Supabase job intake (polling)
Execution ID: 128
Failed node: Supabase — mark job in progress
Error: The resource you are requesting could not be found
```

Если сообщение не пришло, смотрите **Executions** обработчика: чаще всего это
неверный chat ID или бот, которому вы ещё не отправили `/start`.

## Не держите две активные копии

Активировать основной polling workflow можно **только в одном экземпляре n8n**.
Если та же схема одновременно работает локально и, скажем, на сервере или во
второй импортированной копии, оба экземпляра будут опрашивать Supabase.

Данные при этом не испортятся: `claim_job_for_processing()` отдаст заявку
только одному, второй получит `false` и остановится. Но каждый упавший запуск
породит свой алерт, и в Telegram полетят дубли, а в *Executions* будет вдвое
больше шума.

Перед активацией копии в новом окружении деактивируйте старую.
