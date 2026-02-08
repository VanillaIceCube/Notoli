# Deploy (Docker + Nginx)

This repo deploys Notoli as a path-based app under a prefix like `/apps/notoli`, with the frontend and backend served from the same domain.

## What Runs
Docker Compose (`deploy/docker-compose.yml`) starts:
- `proxy`: Nginx reverse proxy (ports 80 and 443)
- `backend`: Django/Gunicorn (port 8000)
- `frontend`: Nginx serving the built SPA (port 3000)

## TLS Certificates (Required For The Proxy)
The reverse proxy expects these files to exist on the host:
- `certs/origin.pem`
- `certs/origin.key`

In `deploy/docker-compose.yml`, this host directory is mounted into the proxy container as `/etc/nginx/certs` via:
- `${NOTOLI_CERTS_DIR:-../certs}:/etc/nginx/certs:ro`

Notes:
- Local dev default: run from `deploy/` and keep certs in `<repo>/certs` (so `../certs` works).
- Production deploy: the deploy workflow sets `NOTOLI_CERTS_DIR=./certs` and writes certs to `<DEPLOY_PATH>/certs`.

Production (recommended): generate a Cloudflare Origin Certificate for `judeandrewalaba.com` and `*.judeandrewalaba.com`, then save the cert and key as:
- `/root/apps/notoli/certs/origin.pem`
- `/root/apps/notoli/certs/origin.key`

Optional: provision via GitHub Actions Secrets (recommended for repeatable deploys)
- Create GitHub Secrets:
  - `CLOUDFLARE_ORIGIN_CERT_PEM_B64` (raw PEM or base64-encoded `origin.pem`)
  - `CLOUDFLARE_ORIGIN_KEY_PEM_B64` (raw PEM or base64-encoded `origin.key`)

Base64 helpers:
- Linux/macOS: `base64 -w0 certs/origin.pem` and `base64 -w0 certs/origin.key`
- Windows PowerShell:
  - ` [Convert]::ToBase64String([IO.File]::ReadAllBytes('certs\\origin.pem')) `
  - ` [Convert]::ToBase64String([IO.File]::ReadAllBytes('certs\\origin.key')) `

Local dev (optional): you can generate a self-signed cert for `localhost` and place it in `certs/`.

## Local Docker Setup
1. Create `deploy/.env` (see `deploy/backend.env` for keys).
2. Ensure the SQLite file exists (important when bind mounting):

```bash
cd deploy
# Linux/macOS:
#   touch db.sqlite3
# Windows PowerShell:
#   New-Item -ItemType File db.sqlite3
```

3. Ensure cert files exist:

```bash
# from repo root
mkdir -p certs

# If you have openssl available (example self-signed cert for local-only use):
# openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes \
#   -keyout certs/origin.key -out certs/origin.pem \
#   -subj "/CN=localhost"
```

4. Start:

```bash
cd deploy
docker compose up -d
```

Local URLs:
- Frontend (reverse-proxy path): `https://localhost/apps/notoli` (HTTP redirects to HTTPS)
- Backend (direct): `http://localhost:8000`
- Frontend (direct): `http://localhost:3000`

## Nginx Path Routing
Routing rules live in `deploy/nginx-proxy.conf` and are ordered so backend routes win before the SPA catch-all.

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

## Backend Path Prefix
When running behind `/apps/notoli`, Django needs:
- `DJANGO_FORCE_SCRIPT_NAME=/apps/notoli`

Also set the usual origin/host allowlists:
- `DJANGO_ALLOWED_HOSTS`
- `DJANGO_CORS_ALLOWED_ORIGINS`
- `DJANGO_CSRF_TRUSTED_ORIGINS`

## Frontend API Base URL
The frontend is static, so its backend URL is baked at build time:
- `REACT_APP_API_BASE_URL` should be `https://<your-domain>/apps/notoli` in production.

## Cloudflare Notes (Full Strict)
- Set Cloudflare SSL/TLS mode to `Full (strict)`.
- Ensure the origin is reachable on port `443` and is serving the Cloudflare Origin Certificate.
- Ensure the origin forwards `X-Forwarded-Proto` so Django can correctly treat requests as HTTPS (`SECURE_PROXY_SSL_HEADER`).
- Avoid caching `/apps/notoli/api/*` and `/apps/notoli/auth/*` at the edge.

## Common Operations
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
