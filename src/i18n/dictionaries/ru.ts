import type { Dictionary } from "@/i18n/dictionaries/types";

export const ru: Dictionary = {
  locale: "ru",
  metadata: {
    siteName: "Northwind Jobs",
    homeTitle: "Northwind Jobs",
    homeDescription:
      "Отправляйте заявки на инженерные проекты и отслеживайте их от ожидания до завершения.",
    dashboardTitle: "Панель",
    dashboardDescription:
      "Просматривайте, фильтруйте и обновляйте статус входящих заявок.",
    titleTemplate: "%s · Northwind Jobs",
  },
  common: {
    brand: "Northwind Jobs",
    dashboard: "Панель",
    backToSite: "На сайт",
    adminDashboard: "Панель администратора",
    copyright: "Все права защищены.",
    localeSwitcherLabel: "Язык",
    localeEn: "EN",
    localeRu: "RU",
  },
  prototype: {
    bannerStrong: "Прототип — не готов к продакшену.",
    banner:
      "В панели нет входа. Создавайте только вымышленные демо-лиды из предустановленных пресетов. Автоматизация n8n локальна, неактивна после импорта и не подключена к этому развёртыванию Vercel.",
  },
  landing: {
    badge: "Принимаем заявки на III квартал",
    title: "Закройте бэклог без найма новой команды.",
    description:
      "Изучите двуязычный прототип приёма лидов с синтетическими персонами и проектами. Сгенерированные данные вымышленные и безопасны для публичных демо.",
    generateCta: "Создать демо-лид",
    viewDashboardCta: "Открыть панель",
    features: {
      synthetic: {
        title: "Синтетический демо-приём",
        description:
          "Сервер создаёт вымышленные лиды через защищённый API. Посетители не передают контактные данные.",
      },
      claim: {
        title: "Атомарный захват",
        description:
          "Опциональный workflow n8n использует RPC Postgres для единственного победителя и подавления дубликатов по ключу идемпотентности.",
      },
      tracking: {
        title: "Отслеживание статуса",
        description:
          "Простая панель показывает заявки и позволяет вручную менять статус. Аутентификация пока не реализована.",
      },
    },
  },
  demo: {
    title: "Создать демо-лид",
    description:
      "Создаёт вымышленный контакт и проект из предустановленных синтетических пресетов. Имена, email и детали проекта посетителей не сохраняются.",
    note: "Все сгенерированные данные вымышленные и предназначены только для оценки.",
    errorTitle: "Не удалось создать демо-лид.",
    latestLeadTitle: "Последний синтетический лид",
    persona: "Персона",
    project: "Проект",
    priority: "Приоритет",
    locale: "Локаль",
    demoLocaleLabel: "Локаль демо",
    localeEnglish: "Английский",
    localeRussian: "Русский",
    verification: "Проверка",
    turnstileMissing:
      "Turnstile не настроен в этой среде. Генерация будет работать только при доступной серверной проверке.",
    verificationRequired: "Пройдите проверку перед созданием демо-лида.",
    generating: "Создание…",
    generateButton: "Создать демо-лид",
    footerNote:
      "Только синтетическое демо. На этом этапе панель по-прежнему читает данные из legacy jobs.",
    toastSuccessTitle: "Демо-лид создан",
    toastSuccessDescription: "Вымышленный лид создан из предустановленных синтетических пресетов.",
    toastErrorTitle: "Не удалось создать демо-лид",
    retryAfterSeconds: "Повторите через {seconds} с.",
  },
  dashboard: {
    title: "Заявки",
    subtitle: "Все заявки с лендинга с возможностью смены статуса прямо в таблице.",
    showingCount: "Показано {visible} из {total} {unit}",
    showingCountSingular: "заявка",
    showingCountPlural: "заявок",
  },
  jobs: {
    stats: {
      total: "Всего заявок",
      pending: "Ожидают",
      inProgress: "В работе",
      completed: "Завершены",
    },
    table: {
      job: "Заявка",
      client: "Клиент",
      priority: "Приоритет",
      budget: "Бюджет",
      created: "Создана",
      status: "Статус",
      viewDetails: "Подробнее",
      savingStatus: "Сохранение статуса",
      statusFor: "Статус для «{title}»",
    },
    filters: {
      searchPlaceholder: "Поиск по названию или email клиента…",
      searchLabel: "Поиск заявок по названию или email",
      clearSearch: "Очистить поиск",
      allStatuses: "Все статусы",
      allPriorities: "Все приоритеты",
      reset: "Сбросить",
      refresh: "Обновить",
      statusFilter: "Фильтр по статусу",
      priorityFilter: "Фильтр по приоритету",
    },
    empty: {
      noneTitle: "Заявок пока нет",
      noneDescription: "Заявки с лендинга появятся здесь.",
      filteredTitle: "Заявки не найдены",
      filteredDescription:
        "Ни одна заявка не соответствует текущему поиску и фильтрам. Измените запрос или расширьте фильтры.",
      clearFilters: "Сбросить фильтры",
    },
    error: {
      title: "Не удалось загрузить заявки",
      tryAgain: "Повторить",
      loadFailed: "Не удалось загрузить заявки.",
      updateFailed: "Не удалось обновить статус заявки.",
      refreshFailed: "Не удалось обновить список заявок.",
    },
    detail: {
      submittedBy: "Отправитель: {email}",
      close: "Закрыть",
      description: "Описание",
      status: "Статус",
      saving: "Сохранение…",
      changesSaveImmediately: "Изменения сохраняются сразу.",
      details: "Детали",
      clientEmail: "Email клиента",
      budget: "Бюджет",
      created: "Создана",
      requestId: "ID заявки",
      startProgress: "Начать работу",
      markCompleted: "Отметить завершённой",
    },
    toasts: {
      statusUpdatedTitle: "Статус обновлён",
      statusUpdatedDescription: "«{title}» теперь: {status}.",
      statusUpdateFailedTitle: "Не удалось обновить статус",
      refreshFailedTitle: "Не удалось обновить",
    },
    status: {
      pending: "Ожидает",
      in_progress: "В работе",
      completed: "Завершена",
    },
    priority: {
      low: "Низкий",
      medium: "Средний",
      high: "Высокий",
    },
  },
  errors: {
    api: {
      demo_not_configured: "Генерация демо-лидов не настроена.",
      rate_limited: "Слишком много запросов на демо-лиды. Повторите позже.",
      invalid_payload: "Некорректные данные запроса.",
      turnstile_failed: "Проверка Turnstile не пройдена.",
      body_too_large: "Тело запроса превышает лимит 1 КБ.",
      invalid_json: "Тело запроса должно быть корректным JSON.",
      generation_failed: "Не удалось создать демо-лид.",
      verification_required: "Пройдите проверку перед созданием демо-лида.",
    },
  },
  accessibility: {
    loadingJobRequests: "Загрузка заявок…",
    closePanel: "Закрыть панель",
    notifications: "Уведомления",
    dismissNotification: "Закрыть уведомление",
  },
};
