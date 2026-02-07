# 🚢 Deploy (Docker + Nginx)
This repo deploys Notoli as a path-based app under a prefix like `/apps/notoli`, with the frontend and backend served from the same domain.

## 🧱 What Runs
Docker Compose ([`deploy/docker-compose.yml`](docker-compose.yml)) starts:
- `proxy`: Nginx reverse proxy (exposes port 80)
- `backend`: Django/Gunicorn (exposes port 8000)
- `frontend`: Nginx serving the built SPA (exposes port 3000)

## 🐳 Local Docker Setup
1. Create `deploy/.env` (see [`deploy/backend.env`](backend.env) for the keys).
2. Ensure the SQLite file exists (important when bind mounting):

```bash
cd deploy
# Linux/macOS:
#   touch db.sqlite3
# Windows PowerShell:
#   New-Item -ItemType File db.sqlite3
```

3. Start:

```bash
cd deploy
docker compose up -d
```

Local URLs:
- Frontend (reverse-proxy path): `http://localhost/apps/notoli`
- Backend (direct): `http://localhost:8000`
- Frontend (direct): `http://localhost:3000`

## 🛣️ Nginx Path Routing
Routing rules live in [`deploy/nginx-proxy.conf`](nginx-proxy.conf) and are ordered so backend routes win before the SPA catch-all.

High level behavior:
- `/apps/notoli` and `/apps/notoli/*` -> `frontend`
- `/apps/notoli/api/*` -> `backend`
- `/apps/notoli/auth/*` -> `backend`
- `/apps/notoli/admin/*` -> `backend`
- `/apps/notoli/static/admin/*` and `/apps/notoli/static/rest_framework/*` -> `backend` (admin/DRF assets)

The proxy strips the `/apps/notoli` prefix before forwarding to Django and sets:
- `X-Forwarded-Prefix: /apps/notoli`

Request flow (typical production setup):

```text
Cloudflare (TLS/DNS)
  -> origin Nginx reverse-proxy (deploy/nginx-proxy.conf)
     -> /apps/notoli/*                               -> frontend (static SPA)
     -> /apps/notoli/{api,auth,admin}                -> backend (API + admin)
     -> /apps/notoli/static/{admin,rest_framework}   -> backend (Django/DRF assets)
```

## 🧩 Backend Path Prefix
When running behind `/apps/notoli`, Django needs:
- `DJANGO_FORCE_SCRIPT_NAME=/apps/notoli`

This ensures URL generation (notably `/admin/` and static URLs) matches the deployed subpath.

Also set the usual origin/host allowlists:
- `DJANGO_ALLOWED_HOSTS`
- `DJANGO_CORS_ALLOWED_ORIGINS`
- `DJANGO_CSRF_TRUSTED_ORIGINS`

## 🔌 Frontend API Base URL
The frontend is static, so its backend URL is baked at build time:
- `REACT_APP_API_BASE_URL` should be `https://<your-domain>/apps/notoli` in production.

## ☁️ Cloudflare Notes
- Cloudflare terminates TLS; your origin typically serves plain HTTP.
- Ensure the origin forwards `X-Forwarded-Proto` so Django can correctly treat requests as HTTPS (`SECURE_PROXY_SSL_HEADER`).
- Avoid caching `/apps/notoli/api/*` and `/apps/notoli/auth/*` at the edge.

## 🧰 Common Operations
Run backend migrations:

```bash
cd deploy
docker compose exec -T backend python manage.py migrate
```

Recreate the reverse proxy after changing `deploy/nginx-proxy.conf`:

```bash
cd deploy
docker compose up -d --force-recreate proxy
```
