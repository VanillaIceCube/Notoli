# Deploy (Docker + Nginx)

This repo deploys Notoli at the subdomain root `https://notoli.judeandrewalaba.com`.

## What Runs
Docker Compose (`deploy/docker-compose.yml`) starts:
- `proxy`: Nginx reverse proxy (ports 80 and 443)
- `backend`: Django/Gunicorn (port 8000)
- `frontend`: Nginx serving the built SPA (port 3000)

The compose file uses the current Compose Specification syntax without a top-level
`version` field.

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
  - `CLOUDFLARE_ORIGIN_CERT_PEM` (raw PEM of `origin.pem`)
  - `CLOUDFLARE_ORIGIN_KEY_PEM` (raw PEM of `origin.key`)

Local dev (optional): you can generate a self-signed cert for `localhost` and place it in `certs/`.

## Local Docker Setup
These steps run the production-style Docker stack locally: frontend, backend, and the Nginx reverse proxy. For local subdomain testing, add `127.0.0.1 notoli.judeandrewalaba.com` to your hosts file or use `curl --resolve`.

1. Create `deploy/.env` from `deploy/backend.env`.

For local Docker, use values like:

```env
DJANGO_DEBUG=1
DJANGO_SECRET_KEY=local-dev-key
DJANGO_SQLITE_PATH=/backend/db.sqlite3
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,notoli.judeandrewalaba.com
DJANGO_CORS_ALLOWED_ORIGINS=https://localhost,http://localhost:3000,https://notoli.judeandrewalaba.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://localhost,http://localhost:3000,https://notoli.judeandrewalaba.com
DJANGO_FORCE_SCRIPT_NAME=
DJANGO_FRONTEND_BASE_URL=https://notoli.judeandrewalaba.com
```

If testing real SMTP locally, use `DJANGO_EMAIL_HOST_KEY` for the API key. Older local files may still have `DJANGO_EMAIL_HOST_PASSWORD`; Django does not read that key.

2. Ensure the SQLite bind mount is a file, not a directory:

```bash
cd deploy
# Linux/macOS:
#   touch db.sqlite3
# Windows PowerShell:
#   New-Item -ItemType File db.sqlite3
```

If Docker already created `deploy/db.sqlite3` as a directory, stop the stack and replace it with a file.

3. Ensure local TLS cert files exist in `<repo>/certs`.

```bash
# from repo root
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout certs/origin.key -out certs/origin.pem \
  -days 365 \
  -subj "/CN=notoli.judeandrewalaba.com" \
  -addext "subjectAltName=DNS:notoli.judeandrewalaba.com,DNS:localhost,IP:127.0.0.1"
```

4. If you need the containers to use your current local code instead of the latest published GHCR images, rebuild first:

```bash
# from repo root
docker build -t ghcr.io/vanillaicecube/notoli-backend:latest ./backend
docker build --build-arg REACT_APP_API_BASE_URL= \
  -t ghcr.io/vanillaicecube/notoli-frontend:latest ./frontend
```

The backend image builds from the maintained `condaforge/miniforge3` base image.
The frontend image uses `npm ci`, so `frontend/package-lock.json` must stay in sync
with `frontend/package.json`.

5. Start the stack:

```bash
cd deploy
docker compose up -d
```

6. Run migrations:

```bash
docker compose exec -T backend python manage.py migrate
```

Local URLs:
- Frontend (reverse-proxy subdomain): `https://notoli.judeandrewalaba.com`
- Backend (direct): `http://localhost:8000`
- Frontend (direct): `http://localhost:3000`

The browser will warn about a local self-signed certificate. That is expected for local dev.

Quick checks:

```bash
docker ps
curl -k -I --resolve notoli.judeandrewalaba.com:443:127.0.0.1 https://notoli.judeandrewalaba.com/
curl -k -i -X POST --resolve notoli.judeandrewalaba.com:443:127.0.0.1 https://notoli.judeandrewalaba.com/auth/forgot-password/ \
  -H "Content-Type: application/json" \
  -d "{}"
```

The forgot-password check should return `{"error":"Email is required."}`. If it returns a Django 404, the running backend image is stale; rebuild the backend image from the local checkout.

## Nginx Host Routing
Routing rules live in `deploy/nginx-proxy.conf` and are ordered so backend routes win before the SPA catch-all.

High level behavior on `notoli.judeandrewalaba.com`:
- `/` and frontend SPA routes -> `frontend`
- `/api/*` -> `backend`
- `/auth/*` -> `backend`
- `/admin/*` -> `backend`
- `/static/admin/*` and `/static/rest_framework/*` -> `backend` (admin/DRF assets)

Request flow (typical production setup):

```text
Cloudflare (TLS/DNS)
  -> origin Nginx reverse-proxy (deploy/nginx-proxy.conf)
     -> Host: notoli.judeandrewalaba.com, /                 -> frontend (static SPA)
     -> Host: notoli.judeandrewalaba.com, /{api,auth,admin} -> backend (API + admin)
```

## Backend Subdomain Settings
When running at the subdomain root, Django should not use a script-name prefix:
- `DJANGO_FORCE_SCRIPT_NAME=`

Production allowlists should include the Notoli subdomain:
- `DJANGO_ALLOWED_HOSTS=notoli.judeandrewalaba.com`
- `DJANGO_CORS_ALLOWED_ORIGINS=https://notoli.judeandrewalaba.com`
- `DJANGO_CSRF_TRUSTED_ORIGINS=https://notoli.judeandrewalaba.com`

Password reset email settings (Resend HTTPS API example):
- `DJANGO_FRONTEND_BASE_URL=https://notoli.judeandrewalaba.com`
- `DJANGO_EMAIL_BACKEND=authentication.email_backends.ResendApiEmailBackend`
- `DJANGO_EMAIL_HOST_KEY=<your_resend_api_key>`
- `DJANGO_EMAIL_TIMEOUT=10`
- `DJANGO_DEFAULT_FROM_EMAIL=<from-address-on-your-domain>`

## Frontend API Base URL
The frontend is static, so its backend URL is baked at build time:
- Prefer leaving `REACT_APP_API_BASE_URL` blank/unset in production so client calls use relative URLs like `/api/...`.
- If an absolute URL is required, use `REACT_APP_API_BASE_URL=https://notoli.judeandrewalaba.com`.

## Cloudflare Notes (Full Strict)
- Add/verify a DNS record for `notoli.judeandrewalaba.com` pointing to the same origin as the base site.
- Set Cloudflare SSL/TLS mode to `Full (strict)`.
- Ensure the origin certificate covers `*.judeandrewalaba.com`.
- Avoid caching `/api/*` and `/auth/*` at the edge for the Notoli subdomain.

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
