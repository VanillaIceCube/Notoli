# 🛠️ Backend (Django)

The Notoli backend is a Django + Django REST Framework API, served by Gunicorn in production.

## 🧭 What Lives Here
- `backend/app/`: Django project settings/urls (`settings.py`, `urls.py`)
- `backend/authentication/`: custom user model + JWT auth endpoints
- `backend/notes/`: boards, lists, and notes (DRF viewsets)
- `backend/notifications/`: recipient-scoped in-app notifications, API endpoints, and notification helper services
- `backend/manage.py`: Django management entrypoint

## 🗺️ API Routes
Top-level routes (without any path prefix):
- Auth: `/auth/` (register/login/refresh)
- API: `/api/` (boards/lists/notes/notifications)
- Admin: `/admin/`

Production serves these routes from the subdomain root at `https://notoli.judeandrewalaba.com`.

## 🔐 Authentication
JWT auth is provided by `djangorestframework-simplejwt`.

Common endpoints:
- `POST /auth/register/` -> creates a user; returns `access`, `refresh`, `username`, `email`, and `board_id`
- `POST /auth/login/` -> accepts `email` (preferred) or `username`, plus `password`; returns `access`, `refresh`, `username`, and `email`
- `POST /auth/refresh/` -> exchanges `refresh` for a new `access`
- `POST /auth/forgot-password/` -> accepts `email`; sends a reset link if the account exists and returns a generic success message
- `POST /auth/reset-password/` -> accepts `uid`, `token`, and `password`; sets a new password when the token is valid

New users get a default board named after their username, such as `"andrew's board"`, created automatically via a post-save signal in `notes/signals.py`. If a username is unavailable, the name falls back to the email prefix.

All `/api/*` endpoints require:
- Header: `Authorization: Bearer <accessToken>`

## 🧱 Data Model (High Level)
- Board: top-level container for organizing lists
- List: belongs to a board; associates notes via a many-to-many relation
- Note: a single checklist item (`note` + optional `description` + `status`); can be linked into multiple lists
- Notification: recipient-scoped in-app activity item with persistent read/unread state, board-name snapshots, optional board/list/note context, and frontend navigation targets, owned by the `notifications` app

Access scoping:
- Board membership is the source of truth for access. `Board.owner` and `Board.collaborators` control access to child lists and notes.
- Lists and notes keep `created_by` metadata, but do not have separate owner or collaborator fields.
- Board owners can update board metadata and delete boards; collaborators receive a 403 response for board `PATCH`/`DELETE` attempts while retaining read access to shared boards.
- Board owners can manage board collaborators with `POST /api/boards/<id>/collaborators/` using `{ "identifier": "<username-or-email>" }` and `DELETE /api/boards/<id>/collaborators/<user_id>/`.
- Board responses include `owner_details` and `collaborators_details` summaries for sharing/access UI.
- Lists are returned in their saved board order. Persist a new board order with `PATCH /api/lists/reorder/` and `{ "board": <id>, "ordered_ids": [<list-id>, ...] }`.
- Notes inside a list are returned in their saved list-membership order. Persist a new note order with `PATCH /api/notes/reorder/` and `{ "list": <id>, "ordered_ids": [<note-id>, ...] }`.
- Note order is stored on the `ListNote` membership table so the same note can appear in multiple lists with different positions.
- Notifications are only visible to their recipient. Clients can list them with `GET /api/notifications/`, mark one read with `PATCH /api/notifications/<id>/`, and mark all read with `PATCH /api/notifications/mark-all-read/`.
- Notification responses include board/list/note context plus `target_path` so the frontend can route users to the relevant board or list.
- Shared board activity creates notifications for other board members when a collaborator is added or removed, when a board is renamed, when a list is created or updated, when a note is created, updated, or transitions to `Complete`, and when boards/lists/notes are deleted. Added and removed collaborators also receive direct access-change notifications.

## 💻 Local Development
Full setup (Conda, env vars) lives in [`AGENTS.md`](../AGENTS.md). Common commands:

```bash
python backend/manage.py migrate
python backend/manage.py runserver 8000
```

For local non-Docker runs, Django auto-loads `backend/.env` (via `python-dotenv`) before reading `DJANGO_*` settings.

Run tests:

```bash
python backend/manage.py test
```

Migrations:

```bash
python backend/manage.py makemigrations
python backend/manage.py migrate
```

Linting (CI uses Ruff):

```bash
cd backend
pip install ruff
ruff check .
ruff format --check .
```

## ⚙️ Configuration
Key environment variables (see `backend/app/settings.py` for defaults):
- `DJANGO_SECRET_KEY`
- `DJANGO_DEBUG` (`1`/`0`)
- `DJANGO_SQLITE_PATH`
- `DJANGO_ALLOWED_HOSTS` (comma-separated)
- `DJANGO_CORS_ALLOWED_ORIGINS` (comma-separated)
- `DJANGO_CSRF_TRUSTED_ORIGINS` (comma-separated)
- `DJANGO_FORCE_SCRIPT_NAME` (leave unset/blank for subdomain-root hosting)
- `DJANGO_FRONTEND_BASE_URL` (base URL used in password-reset links, for example `https://notoli.judeandrewalaba.com`)
- `DJANGO_EMAIL_BACKEND` (default `django.core.mail.backends.console.EmailBackend`)
- `DJANGO_EMAIL_HOST` / `DJANGO_EMAIL_PORT` / `DJANGO_EMAIL_USE_TLS`
- `DJANGO_EMAIL_HOST_USER` / `DJANGO_EMAIL_HOST_KEY`
- `DJANGO_EMAIL_TIMEOUT` (default `10`)
- `DJANGO_DEFAULT_FROM_EMAIL`

Production email recommendation:
- Use `DJANGO_EMAIL_BACKEND=authentication.email_backends.ResendApiEmailBackend` to send through Resend's HTTPS API on port `443`.
- Keep `DJANGO_EMAIL_HOST_KEY=<RESEND_API_KEY>` and `DJANGO_DEFAULT_FROM_EMAIL=<verified-from-address>`.

SMTP alternative:
- `DJANGO_EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend`
- `DJANGO_EMAIL_HOST=smtp.resend.com`
- `DJANGO_EMAIL_PORT=587`
- `DJANGO_EMAIL_USE_TLS=1`
- `DJANGO_EMAIL_HOST_USER=resend`
- `DJANGO_EMAIL_HOST_KEY=<RESEND_API_KEY>`

Proxy / HTTPS:
- Django trusts `X-Forwarded-Proto` (`SECURE_PROXY_SSL_HEADER`) and uses forwarded hosts (`USE_X_FORWARDED_HOST=True`).

Static files:
- Collected during the Docker build (`python manage.py collectstatic --noinput`)
- With subdomain-root hosting, `DJANGO_FORCE_SCRIPT_NAME` should stay blank so `STATIC_URL` remains `/static/`. If a future deployment uses a path prefix, `STATIC_URL` is generated under `<prefix>/static/`.
