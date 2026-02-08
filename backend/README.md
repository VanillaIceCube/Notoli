# 🛠️ Backend (Django)

The Notoli backend is a Django + Django REST Framework API, served by Gunicorn in production.

## 🧭 What Lives Here
- `backend/backend/`: Django project settings/urls (`settings.py`, `urls.py`)
- `backend/authentication/`: custom user model + JWT auth endpoints
- `backend/notes/`: workspaces, todo lists, and notes (DRF viewsets)
- `backend/manage.py`: Django management entrypoint

## 🗺️ API Routes
Top-level routes (without any path prefix):
- Auth: `/auth/` (register/login/refresh)
- API: `/api/` (workspaces/todolists/notes)
- Admin: `/admin/`

If you deploy behind a path prefix like `/apps/notoli`, these become:
- `/apps/notoli/auth/`
- `/apps/notoli/api/`
- `/apps/notoli/admin/`

## 🔐 Authentication
JWT auth is provided by `djangorestframework-simplejwt`.

Common endpoints:
- `POST /auth/register/` -> creates a user; returns `access`, `refresh`, and `workspace_id`
- `POST /auth/login/` -> accepts `email` (preferred) or `username`, plus `password`
- `POST /auth/refresh/` -> exchanges `refresh` for a new `access`

New users get a default workspace (`"My Workspace"`) created automatically via a post-save signal in `notes/signals.py`.

All `/api/*` endpoints require:
- Header: `Authorization: Bearer <accessToken>`

## 🧱 Data Model (High Level)
- Workspace: top-level container for organizing todo lists
- TodoList: belongs to a workspace; associates notes via a many-to-many relation
- Note: a single item (`note` + optional `description`); can be linked into multiple todo lists

Access scoping:
- The API filters objects by `owner`/`created_by`/`collaborators` so users only see what they have access to.

## 💻 Local Development
Full setup (Conda, env vars) lives in [`AGENTS.md`](../AGENTS.md). Common commands:

```bash
python backend/manage.py migrate
python backend/manage.py runserver 8000
```

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
Key environment variables (see `backend/backend/settings.py` for defaults):
- `DJANGO_SECRET_KEY`
- `DJANGO_DEBUG` (`1`/`0`)
- `DJANGO_SQLITE_PATH`
- `DJANGO_ALLOWED_HOSTS` (comma-separated)
- `DJANGO_CORS_ALLOWED_ORIGINS` (comma-separated)
- `DJANGO_CSRF_TRUSTED_ORIGINS` (comma-separated)
- `DJANGO_FORCE_SCRIPT_NAME` (set to `/apps/notoli` for path-based hosting)

Proxy / HTTPS:
- Django trusts `X-Forwarded-Proto` (`SECURE_PROXY_SSL_HEADER`) and uses forwarded hosts (`USE_X_FORWARDED_HOST=True`).

Static files:
- Collected during the Docker build (`python manage.py collectstatic --noinput`)
- When `DJANGO_FORCE_SCRIPT_NAME` is set, `STATIC_URL` is generated under `<prefix>/static/` (required for admin assets under a subpath).
