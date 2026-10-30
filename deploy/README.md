# Local Docker development

Local development defaults to `DJANGO_MCP_AUTH_MODE=legacy`. Central MCP mode
requires the fixed production resource origin and an introspection-only secret
in the existing private backend environment. Follow the separate
[central migration/cutover plan](production/central-mcp.md); do not change local
Compose networks or use local/legacy deployment commands for that production switch.

For shared-host configuration, deployment and recovery, use the
[canonical production guide](production/README.md). The commands below are for
local development only. Host-owned gateway and certificate operations belong to
the infrastructure repository.

## Local Docker with `notoli.localhost`

From the repository root, initialize only missing local files:

```powershell
if (-not (Test-Path deploy/.env)) { Copy-Item deploy/backend.env deploy/.env }
if (-not (Test-Path deploy/db.sqlite3)) { New-Item -ItemType File -Path deploy/db.sqlite3 }
docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml up --build -d
docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml exec -T backend python manage.py migrate
```

Open `http://notoli.localhost:3000`; the backend is
`http://notoli.localhost:8000`. Both ports bind to loopback. Override them with
`NOTOLI_DEV_FRONTEND_PORT` and `NOTOLI_DEV_BACKEND_PORT` in `deploy/.env`.
The stack mounts both source trees, runs Vite and Uvicorn autoreload, and needs
no certificate or Nginx. Its blank-secret fallback is development-only.

The frontend keeps a `node_modules` volume and refreshes it with `npm ci` after
dependency-file changes when restarted:

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml restart frontend
```

Local MCP discovery uses the backend origin and no trusted proxy. ChatGPT
connection testing requires a reachable HTTPS origin or secure tunnel with
consistent issuer, allowed host and CSRF origin. See the
[connection walkthrough](../plugins/notoli/README.md).

## Standalone HTTPS and image checks

Use `deploy/docker-compose.yml` only on your workstation. It starts its own
Nginx on 80/443, private backend and frontend on port 3000. Do not run this local
stack on the shared production host. Prepare a nonempty local secret and local
origins in `deploy/.env`, for example:

```env
DJANGO_DEBUG=1
DJANGO_SECRET_KEY=local-development-only-change-me
DJANGO_SQLITE_PATH=/backend/db.sqlite3
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,notoli.judeandrewalaba.com
DJANGO_CORS_ALLOWED_ORIGINS=https://localhost,http://localhost:3000,https://notoli.judeandrewalaba.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://localhost,http://localhost:3000,https://notoli.judeandrewalaba.com
DJANGO_FRONTEND_BASE_URL=https://notoli.judeandrewalaba.com
DJANGO_MCP_BASE_URL=https://notoli.judeandrewalaba.com
```

Create local self-signed certificates in ignored `certs/` using OpenSSL (Git Bash
on Windows). Map `notoli.judeandrewalaba.com` to `127.0.0.1` locally or use curl's
`--resolve` option to avoid contacting the public service:

```sh
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout certs/origin.key -out certs/origin.pem -days 365 \
  -subj "/CN=notoli.judeandrewalaba.com" \
  -addext "subjectAltName=DNS:notoli.judeandrewalaba.com,DNS:localhost,IP:127.0.0.1"
docker build -t ghcr.io/vanillaicecube/notoli-backend:latest ./backend
docker build --build-arg REACT_APP_API_BASE_URL= -t ghcr.io/vanillaicecube/notoli-frontend:latest ./frontend
docker compose -f deploy/docker-compose.yml up -d
docker compose -f deploy/docker-compose.yml exec -T backend python manage.py migrate
curl -k -I --resolve notoli.judeandrewalaba.com:443:127.0.0.1 https://notoli.judeandrewalaba.com/
```

These mutable tags are local build names; production selects immutable digests.
The browser warning for a self-signed local certificate is expected. Leave the
frontend build argument empty for same-origin API calls through local Nginx.
Local password-reset testing uses `DJANGO_EMAIL_HOST_KEY`, not the obsolete
`DJANGO_EMAIL_HOST_PASSWORD`; choose explicit test credentials if enabling mail.

## Local persistence and troubleshooting

Keep `deploy/db.sqlite3` when restarting either local stack. Never overwrite an
existing database with an empty file. If Docker created a directory there,
stop the local stack and inspect/back up its contents before correcting the bind.

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml ps
docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml logs --tail 100 backend frontend
docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml down
```

A missing route in standalone HTTPS can indicate an old local image; rebuild
from the current checkout. For occupied development ports, change the
`NOTOLI_DEV_*_PORT` settings; standalone HTTPS requires free 80/443/3000 ports.
Rebuild after dependency/Dockerfile changes; ordinary source edits hot reload.
If `notoli.localhost` does not resolve, add `127.0.0.1 notoli.localhost` to your
local hosts file.


## 🔌 Shared MCP framework

The [MCP framework guide](../docs/MCP-FRAMEWORK.md) defines opt-in ASGI/proxy/readiness requirements. Local development can call the backend directly; do not treat a local/legacy proxy as production MCP onboarding.
