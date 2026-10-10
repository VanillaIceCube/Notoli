# Deploy (Docker + Nginx)

This repo deploys Notoli at the subdomain root `https://notoli.judeandrewalaba.com`.

## What Runs
Docker Compose (`deploy/docker-compose.yml`) starts:
- `proxy`: Nginx reverse proxy (ports 80 and 443)
- `backend`: Django + MCP through Uvicorn ASGI (port 8000 on private container networks; no published host port)
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

## Docker hot-reload development

Use the development Compose file for fast source iteration. It mounts both
source trees, runs React's hot-reload server and Uvicorn's autoreloading
ASGI server, and does not start the production Nginx proxy or require a
certificate:

```powershell
Copy-Item deploy/backend.env deploy/.env
New-Item -ItemType File -Path deploy/db.sqlite3 -Force
docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml up --build -d
docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml exec -T backend python manage.py migrate
```

Open `http://notoli.localhost:3000`; the frontend calls Django at
`http://notoli.localhost:8000`. Both host ports bind to localhost only. Set
`NOTOLI_DEV_FRONTEND_PORT` or `NOTOLI_DEV_BACKEND_PORT` in `deploy/.env` to
override the default ports. Stop the development stack with:

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml down
```

`deploy/backend.env` leaves `DJANGO_SECRET_KEY` blank because the
production-shaped stack requires a unique deployment secret. The development
Compose file supplies a local-only fallback for a blank value, allowing the
fresh setup above to register and log in. Do not use that fallback outside
local development.

The frontend's persistent `node_modules` volume is checked against
`package.json` and `package-lock.json` whenever the container starts. After
changing either dependency file, restart the frontend so it runs `npm ci` and
refreshes that volume:

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml restart frontend
```

Use the production-shaped workflow below when testing Nginx, HTTPS, or the
deployment images.

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

The development backend image builds from the reviewed,
digest-pinned `condaforge/miniforge3` 24.04 base image. Update its digest only
through an explicit image-version and security review.
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
- Backend: through the reverse proxy's `/api/`, `/auth/`, and `/mcp` routes
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

## ChatGPT MCP deployment

ChatGPT listing metadata is published separately from the backend. A deploy
does not import `plugins/notoli/plugin.json` into an existing personal cloud
plugin. Follow the [listing update workflow](../plugins/notoli/README.md#listing-metadata-and-updates)
to upload its branding update while retaining the exported app mapping.
Tool refresh and public directory submission are separate steps described there.

MCP runs inside the existing backend process at
`https://notoli.judeandrewalaba.com/mcp`. No new service, DNS record, or port is
required. `backend/Dockerfile` uses Uvicorn ASGI with one worker for SQLite.
Production publishes no backend port. Nginx alone shares its internal
`backend_private` network and has the fixed IP `172.30.88.2` in `172.30.88.0/29`.
The backend has the distinct fixed IP `172.30.88.3` on that network. Both addresses
must remain fixed: the backend starts first and automatic allocation could take
the proxy's address, preventing Nginx from starting with `Address already in use`.
Compose supplies that exact IP as `DJANGO_TRUSTED_PROXY_IPS`; the frontend uses
the default network and cannot join the backend network. A separate backend-only
`backend_egress` bridge preserves outbound SMTP/HTTPS email access. Restrict VM
access and Docker/network administration to trusted operators.

Uvicorn starts with `--no-proxy-headers`; Notoli's ASGI middleware checks the
original peer before accepting forwarded scheme/client. Django itself ignores
forwarded host/proto headers. Nginx replaces client-supplied forwarding values
with `$scheme` and `$remote_addr`, so Cloudflare Full (strict) TLS supplies HTTPS
without trusting an incoming header. Local development trusts no proxy. If the
private subnet conflicts with an existing network, change the IPAM subnet,
both services' fixed addresses, and the backend's trusted IP together in Compose.
Do not use a wildcard or trust the whole bridge. Keep backend ports unpublished.

1. Back up the production SQLite database, deploy both frontend and backend
   images, the updated Compose file, and `nginx-proxy.conf`. Recreate the services
   with `docker compose up -d --force-recreate --remove-orphans` to apply network
   isolation and release any old backend assignment at `172.30.88.2`, then
   apply migrations:

   ```bash
   docker compose exec -T backend python manage.py migrate
   docker compose exec -T backend python manage.py check --deploy
   docker compose exec -T proxy nginx -t
   ```

   Verify all three services are running with `docker compose ps`, and inspect
   the private addresses with:

   ```bash
   docker inspect --format '{{json .NetworkSettings.Networks}}' notoli-backend notoli-proxy
   ```

   On `backend_private`, expect backend `172.30.88.3` and proxy `172.30.88.2`.
   Repeat `docker compose up -d --remove-orphans` and confirm the services still
   run. Check the public HTTPS frontend and an API request through Nginx after
   redeployment; also verify outbound email still works via `backend_egress`.

2. Use production settings:

   ```env
   DJANGO_DEBUG=0
   DJANGO_MCP_BASE_URL=https://notoli.judeandrewalaba.com
   DJANGO_FRONTEND_BASE_URL=https://notoli.judeandrewalaba.com
   DJANGO_ALLOWED_HOSTS=notoli.judeandrewalaba.com
   DJANGO_CSRF_TRUSTED_ORIGINS=https://notoli.judeandrewalaba.com
   DJANGO_CORS_ALLOWED_ORIGINS=https://notoli.judeandrewalaba.com
   ```

   Keep a unique `DJANGO_SECRET_KEY`. The deploy workflow carries optional repo
   variable `DJANGO_MCP_BASE_URL` into `.env`; leaving it blank uses the production
   domain above. Changing the issuer invalidates old resource-bound grants, so
   reconnect clients and update `plugins/notoli/mcp.json` when changing domains.

3. In Cloudflare, reuse the existing proxied DNS record and Full (strict) TLS.
   Review Redirect, WAF, Bot, Access, and Caching rules: preserve `/mcp` and
   discovery paths without slash redirects or interactive challenges, and bypass
   cache for `/mcp` and `/auth/mcp/*`. Keep metadata publicly readable. Set
   appropriate login/token rate limits. These are operator changes; repository
   configuration does not change Cloudflare automatically.

4. Register the exact OAuth callback shown in ChatGPT's connection page:

   ```bash
   docker compose exec -T backend python manage.py register_mcp_client \
     --redirect-uri "<exact ChatGPT callback URI>"
   ```

   Use client ID `notoli-chatgpt`, token authentication method `none`, and scopes
   `notoli:read notoli:write notoli:share notoli:organize notoli:notifications notoli:delete`
   for complete coverage, or request a subset. No client secret is needed. Existing
   connections must reconnect and approve new permissions. Sharing affects all
   lists/items in the selected board and remains owner-only. Delete tools require
   explicit confirmation of their impact: board deletion removes all lists/items,
   item deletion removes every occurrence, and list deletion preserves items. See the
   [personal connection walkthrough](../plugins/notoli/README.md).

5. Verify discovery and an unauthenticated challenge before linking:

   ```bash
   curl -i https://notoli.judeandrewalaba.com/.well-known/oauth-authorization-server
   curl -i https://notoli.judeandrewalaba.com/.well-known/oauth-protected-resource/mcp
   curl -i https://notoli.judeandrewalaba.com/mcp
   ```

   Metadata returns JSON; `/mcp` returns `401` with a `WWW-Authenticate` resource
   metadata URL. After linking, try discovery, add one item, mark it complete,
   and revoke the connection in React's `/connections` (**Connected Apps** in the
   profile menu). Verify already-signed-in consent, signed-out login → consent →
   callback, Cancel returning `access_denied` with the original state/issuer, and
   revocation preventing access and refresh. Also approve consent without exchanging
   the code: the app must appear in Connected Apps, and revoking it must block exchange.
   Verify read consent discloses collaborator IDs/usernames/emails, and ambiguous
   username/email values cannot share with either matching account. Test reading board collaborators,
   owner-only add/remove with notifications, and rejection of sharing when
   `notoli:share` is missing. On disposable data, test board/list creation and edits,
   complete-set reordering, same-board membership changes, board-wide orphan items,
   deletion cascades/confirmation, and recipient-only notification management.
   Verify missing organize/notifications/delete permissions prompt reauthorization
   and refresh cannot escalate any scope. Check ordinary REST/JWT
   login, list ordering, and collaborator notifications as well. MCP Inspector
   can exercise the protocol before testing ChatGPT. Register its exact HTTPS
   callback as a separate public client if needed.

Nginx passes `/mcp` with buffering disabled, a 120-second read timeout, and
`Cache-Control: no-store`; `/.well-known/*` goes to Django. OAuth JSON endpoints use
the existing `/auth/` proxy location with caching disabled; React's `/connections`
and `/connections/authorize` use the SPA catch-all. `DJANGO_FRONTEND_BASE_URL`
must point to that frontend origin for the browser authorization redirect. Never
cache authenticated consent or connection responses. `/mcp/` is not the
canonical endpoint. The development Compose stack overrides the issuer to
`http://notoli.localhost:8000` (or the selected backend port); ChatGPT testing
requires a reachable HTTPS origin or an appropriate secure tunnel. Set the
issuer, allowed host, and trusted CSRF origin consistently when using a tunnel.

Run `docker compose exec -T backend python manage.py cleartokens` periodically
to remove expired OAuth rows. Never put access/refresh tokens or codes into
deployment logs. Rolling back the code does not require removing OAuth tables;
restore a database backup only if a migration rollback is specifically needed.

High level behavior on `notoli.judeandrewalaba.com`:
- `/` and frontend SPA routes -> `frontend`
- `/api/*` -> `backend`
- `/mcp` and `/.well-known/*` -> `backend` (MCP and OAuth discovery)
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
Notoli serves backend routes at the subdomain root and static assets at `/static/`.
No deployment path-prefix variable is needed.

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
