# 📝 Notoli  
**A Notion-Inspired To-Do List App**

Notoli is my personalized take on a to-do list application, inspired by the flexibility of Notion databases.

It’s designed to support **multiple views** of the same list, so my wife, Diana, and I can each use the app in the way that works best for us, whether that’s a clean, simple Notes-style interface or a more detailed, database-like workflow.

## ✨ Features
- **Workspaces → TodoLists → Notes** hierarchy
- **JWT auth** (register/login/refresh) with an email-first login flow
- **Sane defaults**: new accounts get a default workspace automatically
- **Fast CRUD UI**: add, edit, and delete items inline
- **Access scoping**: the API limits objects by `owner`/`created_by`/`collaborators`
- **Flexible organization**: notes can appear in multiple todo lists (many-to-many)
- **Path-based hosting**: designed to run under a subpath like `/apps/notoli`
- **Dockerized deployment**: frontend + backend + Nginx reverse proxy

## 🚀 Tech Stack

**Backend:** Django
**Frontend:** React + Material UI
**Environment Management:** Conda
**Deployment:** Docker
**Hosting:** DigitalOcean
**DNS/Proxy:** Cloudflare
**CI/CD & Workflows:** Github Actions

## 🚀 Quick Start
For full, exact instructions (Conda and Docker), see `AGENTS.md`. The short version:

Local dev (Conda):
```bash
conda env create -f backend/environment.yml
conda activate notoli_env
python backend/manage.py migrate
python backend/manage.py runserver 8000

cd frontend
npm install
npm start
```

Docker (all-in-one):
```bash
cd deploy
# create deploy/.env (see deploy/backend.env)
# Linux/macOS:
#   touch db.sqlite3
# Windows PowerShell:
#   New-Item -ItemType File db.sqlite3
docker compose up -d
```

## 🔧 Configuration
Backend env vars (see `AGENTS.md` for the full list and defaults):
- `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_SQLITE_PATH`
- `DJANGO_ALLOWED_HOSTS`, `DJANGO_CORS_ALLOWED_ORIGINS`, `DJANGO_CSRF_TRUSTED_ORIGINS`
- `DJANGO_FORCE_SCRIPT_NAME` (set to `/apps/notoli` for path-based routing)

Frontend env vars:
- `REACT_APP_API_BASE_URL` (defaults to `http://localhost:8000` for local dev)
  - For production builds, set this to `https://<your-domain>/apps/notoli` so `/api` and `/auth` resolve under the same base path.
  - Note: in the Docker image, this is a build-time value (it’s baked into the static build).

## 🧭 App Routes
- `/` shows workspaces
- `/workspace/:workspaceId` shows todo lists for a workspace
- `/workspace/:workspaceId/todolist/:todoListId` shows notes for a todo list
- `/login` and `/register` are public; everything else requires auth

Authentication tokens are stored in `sessionStorage` (`accessToken` and `refreshToken`).
The refresh token is stored for later use, but the frontend currently does not auto-refresh access tokens.

In production, React Router is configured to run under a basename (CRA `PUBLIC_URL`) so the app can be hosted under a subpath like `/apps/notoli`.

## 🧱 Data Model
- **Workspace**: top-level container for organizing lists (with `owner`, `created_by`, and optional `collaborators`)
- **TodoList**: belongs to a workspace; associates notes via a many-to-many relation
- **Note**: a single item (`note` + optional `description`); can be linked into multiple todo lists

## 🔌 API Overview
The backend is a Django REST Framework API with these top-level routes:
- Auth: `/auth/` (register/login/refresh)
- API: `/api/` (workspaces/todolists/notes)
- Admin: `/admin/`

When deployed behind a path prefix (e.g. `/apps/notoli`), these routes are automatically served under that prefix (for example: `/apps/notoli/api/`).

All `/api/*` endpoints require an access token:
- Header: `Authorization: Bearer <accessToken>`

Common endpoints:
- `POST /auth/register/` -> creates a user, returns `access`, `refresh`, and `workspace_id`
- `POST /auth/login/` -> accepts `email` or `username` plus `password`
- `POST /auth/refresh/` -> exchanges `refresh` for a new `access`
- `GET /api/workspaces/`, `POST /api/workspaces/`, `GET/PATCH/DELETE /api/workspaces/<id>/`
- `GET /api/todolists/?workspace=<id>`, `POST /api/todolists/`, `GET/PATCH/DELETE /api/todolists/<id>/`
- `GET /api/notes/?todo_list=<id>`, `POST /api/notes/`, `GET/PATCH/DELETE /api/notes/<id>/`

Example (local dev):
```bash
curl -sS -X POST http://localhost:8000/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"your-password"}'
```

## 🏗️ Architecture
This section is about request flow and hosting topology (Tech Stack above is the quick “what tools” list).

```text
Cloudflare (TLS/DNS)
  -> origin Nginx reverse-proxy (deploy/nginx-proxy.conf)
     -> /apps/notoli/*                               -> frontend (static SPA)
     -> /apps/notoli/{api,auth,admin}                -> backend (API + admin)
     -> /apps/notoli/static/{admin,rest_framework}   -> backend (Django/DRF assets)
```

- The reverse proxy strips the `/apps/notoli` prefix before forwarding requests and sets `X-Forwarded-Prefix: /apps/notoli`.
- The backend uses `DJANGO_FORCE_SCRIPT_NAME=/apps/notoli` so URL generation (notably `/admin/` and static URLs) matches the subpath deployment.
- The frontend uses CRA `PUBLIC_URL`/`homepage` + a React Router basename so client-side routes work under `/apps/notoli`.

## 🚢 Deployment
- Docker Compose lives in `deploy/docker-compose.yml` and runs three services: `proxy` (Nginx), `frontend`, and `backend`.
- The reverse proxy rules live in `deploy/nginx-proxy.conf` and are designed for path-based hosting under `/apps/notoli`.
- The backend uses a bind-mounted SQLite DB file (`deploy/db.sqlite3`). Create the file first so Docker doesn’t accidentally make it a directory.
- GitHub Actions (`.github/workflows/deploy.yml`) builds and pushes the frontend/backend images to GHCR, uploads the deploy files to your server, brings the stack up, and runs migrations.

## 🧪 Quality
- Frontend: Jest + Testing Library, ESLint, Prettier
- Backend: Django tests, Ruff
- CI: GitHub Actions for linting, tests, and deployment automation

Common local commands:
```bash
# Frontend
cd frontend
npm test -- --watchAll=false
npm run lint
npm run format:check

# Backend
cd backend
python manage.py test
```

## 📁 Repo Layout
- `backend/`: Django project (`authentication`, `notes`)
- `frontend/`: React app (`src/pages` for screens, `src/services` for API calls)
- `deploy/`: Docker Compose + reverse proxy config
- `.github/`: CI workflows and helper actions

## 📜 License

This project is licensed under a **Modified MIT License (Non-Commercial Use Only)**.
See the [LICENSE](./LICENSE) file for full details.

## 🙏 Acknowledgments

This project includes code from [`conda_export.py`](https://github.com/andresberejnoi/Conda-Tools) by **Andres Berejnoi**,
used under the terms of the original [MIT License](https://opensource.org/licenses/MIT).
