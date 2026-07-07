# 🛠️ Backend (Django)

The Notoli backend is a Django + Django REST Framework API, served by Gunicorn in production.

## 🧭 What Lives Here
- `backend/app/`: Django project settings/urls (`settings.py`, `urls.py`)
- `backend/authentication/`: custom user model + JWT auth endpoints
- `backend/notes/`: workspaces, todo lists, and notes (DRF viewsets)
- `backend/manage.py`: Django management entrypoint

## 🗺️ API Routes
Top-level routes (without any path prefix):
- Auth: `/auth/` (register/login/refresh)
- API: `/api/` (workspaces/todolists/notes)
- Admin: `/admin/`

Production serves these routes from the subdomain root at `https://notoli.judeandrewalaba.com`.

## 🔐 Authentication
JWT auth is provided by `djangorestframework-simplejwt`.

Common endpoints:
- `POST /auth/register/` -> creates a user; returns `access`, `refresh`, `username`, `email`, and `workspace_id`
- `POST /auth/login/` -> accepts `email` (preferred) or `username`, plus `password`; returns `access`, `refresh`, `username`, and `email`
- `POST /auth/refresh/` -> exchanges `refresh` for a new `access`
- `POST /auth/forgot-password/` -> accepts `email`; sends a reset link if the account exists and returns a generic success message
- `POST /auth/reset-password/` -> accepts `uid`, `token`, and `password`; sets a new password when the token is valid

New users get a default workspace named after their username, such as `"andrew's workspace"`, created automatically via a post-save signal in `notes/signals.py`. If a username is unavailable, the name falls back to the email prefix.

All `/api/*` endpoints require:
- Header: `Authorization: Bearer <accessToken>`

## 🧱 Data Model (High Level)
- Workspace: top-level container for organizing todo lists
- TodoList: belongs to a workspace; associates notes via a many-to-many relation
- Note: a single checklist item (`note` + optional `description` + `status`); can be linked into multiple todo lists

Access scoping:
- Workspace membership is the source of truth for access. `Workspace.owner` and `Workspace.collaborators` control access to child todo lists and notes.
- Todo lists and notes keep `created_by` metadata, but do not have separate owner or collaborator fields.
- Workspace owners can manage workspace collaborators with `POST /api/workspaces/<id>/collaborators/` using `{ "identifier": "<username-or-email>" }` and `DELETE /api/workspaces/<id>/collaborators/<user_id>/`.
- Workspace responses include `owner_details` and `collaborators_details` summaries for sharing/access UI.
- Todo lists are returned in their saved workspace order. Persist a new workspace order with `PATCH /api/todolists/reorder/` and `{ "workspace": <id>, "ordered_ids": [<todo-list-id>, ...] }`.
- Notes inside a todo list are returned in their saved list-membership order. Persist a new note order with `PATCH /api/notes/reorder/` and `{ "todo_list": <id>, "ordered_ids": [<note-id>, ...] }`.
- Note order is stored on the `TodoListNote` membership table so the same note can appear in multiple todo lists with different positions.

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
