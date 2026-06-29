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
  - `CLOUDFLARE_ORIGIN_CERT_PEM` (raw PEM of `origin.pem`)
  - `CLOUDFLARE_ORIGIN_KEY_PEM` (raw PEM of `origin.key`)

Local dev (optional): you can generate a self-signed cert for `localhost` and place it in `certs/`.

## Local Docker Setup
These steps run the production-style Docker stack locally: frontend, backend, and the Nginx path proxy.

1. Create `deploy/.env` from `deploy/backend.env`.

For local Docker, use values like:

```env
DJANGO_DEBUG=1
DJANGO_SECRET_KEY=local-dev-key
DJANGO_SQLITE_PATH=/backend/db.sqlite3
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DJANGO_CORS_ALLOWED_ORIGINS=https://localhost,http://localhost:3000
DJANGO_CSRF_TRUSTED_ORIGINS=https://localhost,http://localhost:3000
DJANGO_FORCE_SCRIPT_NAME=/apps/notoli
DJANGO_FRONTEND_BASE_URL=https://localhost/apps/notoli
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

If Docker already created `deploy/db.sqlite3` as a directory, stop the stack and replace it with a file:

```powershell
cd deploy
docker compose down
Remove-Item .\db.sqlite3
New-Item -ItemType File .\db.sqlite3
```

3. Ensure local TLS cert files exist in `<repo>/certs`.

```bash
# from repo root
mkdir -p certs

# If you have openssl available:
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout certs/origin.key -out certs/origin.pem \
  -days 365 \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

On Windows with Anaconda OpenSSL, you may need to point OpenSSL at its config first:

```powershell
$env:OPENSSL_CONF = "C:\Users\judea\anaconda3\Library\ssl\openssl.cnf"
openssl req -x509 -newkey rsa:2048 -nodes `
  -keyout certs/origin.key -out certs/origin.pem `
  -days 365 `
  -subj "/CN=localhost" `
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

4. If you need the containers to use your current local code instead of the latest published GHCR images, rebuild first:

```bash
# from repo root
docker build -t ghcr.io/vanillaicecube/notoli-backend:latest ./backend
docker build --build-arg REACT_APP_API_BASE_URL=https://localhost/apps/notoli \
  -t ghcr.io/vanillaicecube/notoli-frontend:latest ./frontend
```

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
- Frontend (reverse-proxy path): `https://localhost/apps/notoli`
- Backend (direct): `http://localhost:8000`
- Frontend (direct): `http://localhost:3000`

The browser will warn about the local self-signed certificate. That is expected for local dev.

Quick checks:

```bash
docker ps
curl -k -I https://localhost/apps/notoli/
curl -k -i -X POST https://localhost/apps/notoli/auth/forgot-password/ \
  -H "Content-Type: application/json" \
  -d "{}"
```

The forgot-password check should return `{"error":"Email is required."}`. If it returns a Django 404, the running backend image is stale; rebuild the backend image from the local checkout.

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

Password reset email settings (Resend HTTPS API example):
- `DJANGO_FRONTEND_BASE_URL=https://<your-domain>/apps/notoli`
- `DJANGO_EMAIL_BACKEND=authentication.email_backends.ResendApiEmailBackend`
- `DJANGO_EMAIL_HOST_KEY=<your_resend_api_key>`
- `DJANGO_EMAIL_TIMEOUT=10`
- `DJANGO_DEFAULT_FROM_EMAIL=<from-address-on-your-domain>`

The Resend API backend sends over HTTPS (`api.resend.com:443`), which avoids common cloud-provider outbound SMTP blocks.

SMTP alternative:
- `DJANGO_EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend`
- `DJANGO_EMAIL_HOST=smtp.resend.com`
- `DJANGO_EMAIL_PORT=587`
- `DJANGO_EMAIL_USE_TLS=1`
- `DJANGO_EMAIL_HOST_USER=resend`
- `DJANGO_EMAIL_HOST_KEY=<your_resend_api_key>`
- `DJANGO_EMAIL_TIMEOUT=10`
- `DJANGO_DEFAULT_FROM_EMAIL=<from-address-on-your-domain>`

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
