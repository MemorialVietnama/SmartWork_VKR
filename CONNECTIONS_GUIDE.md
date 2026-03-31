# SmartWork: URL и подключения

Короткая памятка по адресам сервисов и основным переменным окружения.

## Локальные URL (через docker compose)

- Frontend (web): `http://localhost` (порт из `WEB_PORT`, по умолчанию `80`)
- API: `http://localhost:8000` (порт из `API_PORT`, по умолчанию `8000`)
- Swagger: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- Health: `http://localhost:8000/health`
- MailHog UI: `http://localhost:8025` (порт из `MAILHOG_WEB_PORT`)

## Подключения сервисов

- PostgreSQL (с хоста): `postgresql://smartwork:smartwork_secret@localhost:5432/smartwork`
- PostgreSQL (внутри Docker-сети): `postgresql+asyncpg://smartwork:smartwork_secret@db:5432/smartwork`
- Redis (с хоста): `redis://localhost:6379/0`
- Redis (внутри Docker-сети): `redis://redis:6379/0`
- SMTP (MailHog, с хоста): `localhost:1025`
- SMTP (MailHog, внутри Docker-сети): `mail:1025`

## Где это настроено

- `docker-compose.yml`
  - порты сервисов (`WEB_PORT`, `API_PORT`, `POSTGRES_PORT`, `REDIS_PORT`, `MAILHOG_WEB_PORT`, `MAILHOG_SMTP_PORT`)
  - backend переменные (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET_KEY`, `CORS_ORIGINS`)
- `.env.example`
  - пример значений всех ключевых переменных
- `backend/app/core/config.py`
  - дефолты backend (`DATABASE_URL`, `REDIS_URL`, `SMTP_HOST`, `SMTP_PORT`, и т.д.)
- `frontend/src/environments/environment.ts`
  - `apiUrl` (в Docker сейчас используется прокси через Nginx и `apiUrl: ''`)

## Часто используемые переменные

- `DATABASE_URL` - строка подключения к PostgreSQL для API
- `REDIS_URL` - Redis для кодов/токенов/временных данных
- `SMTP_HOST`, `SMTP_PORT`, `EMAIL_FROM` - отправка email
- `API_V1_PREFIX` - префикс API (по умолчанию `/api/v1`)
- `API_PUBLIC_URL` - URL API для сборки web-контейнера
- `CORS_ORIGINS` - разрешенные origin для браузера

## Быстрая проверка после запуска

1. `docker compose up -d --build`
2. Открыть `http://localhost` (web)
3. Открыть `http://localhost:8000/docs` (API)
4. Открыть `http://localhost:8025` (входящие письма MailHog)

## Важно для продакшена

- Обязательно сменить `JWT_SECRET_KEY`
- Не использовать дефолтный пароль БД
- Ограничить `CORS_ORIGINS` только нужными доменами
