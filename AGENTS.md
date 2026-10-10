# AGENTS.md

This repo uses manual setup steps so Codex does not assume Django or Node are installed.
Follow one of the setup paths below before running the app.

Documentation: When you change setup, routing, env vars, or deploy steps, update `AGENTS.md`.
Also update the relevant README(s):
- Root overview: `README.md`
- Backend/API/auth: `backend/README.md`
- Frontend/routing/API base URL: `frontend/README.md`
- Deployment/Docker/Nginx: `deploy/README.md`
- CI/CD, Dependabot, workflows: `.github/README-WORKFLOWS.md`
Also update `CHANGELOG.md`.

GitHub security-alert aggregation: The daily/manual CodeQL and Dependabot aggregation workflows require the `OPENAI_API_KEY`, `ROBOCOP_PRIVATE_KEY`, and `SECURITY_ALERTS_TOKEN` secrets; the `ROBOCOP_APP_ID`, `OPENAI_PROJECT_ID`, and `SECURITY_ALERTS_PROJECT_ID` repository variables; and a RoboCop installation with `Issues: write`, `Code scanning alerts: read`, and `Dependabot alerts: read`. RoboCop's short-lived token reads alerts and authors every issue mutation, while `SECURITY_ALERTS_TOKEN` is isolated to personal GitHub Project v2 synchronization. Keep their field/permission setup and fail-closed credential separation documented in `.github/README-WORKFLOWS.md` when changing these workflows.

GitHub AI PR reviews: The three persona workflows require `OPENAI_API_KEY`, `OPENAI_PROJECT_ID`, and separate GitHub App credentials for RoboCop, Lint Eastwood, and Obi-Wan Code-nobi. Keep the app IDs, private-key secrets, permissions, trigger policy, and failure behavior documented in `.github/README-WORKFLOWS.md` when changing these workflows.

GitHub branch protection: Require `CodeQL / Detect CodeQL Scope` and the three `CodeQL / Analyze ...` jobs listed in `.github/README-WORKFLOWS.md`. Do not require the standalone `CodeQL` Code Scanning results context: documentation-only PRs skip all analyzers and never emit it. Preserve the scope and analyzer requirements when editing or recreating the main ruleset; skipped analyzer jobs satisfy required checks, while detector or analyzer failures block merging.

## Changelog format
When updating `CHANGELOG.md`, add a new dated section at the top and group entries under:
- `### Added`
- `### Fixed`
- `### Changed`
- `### Removed`
Omit any empty groups (do not include a heading if there are no entries for it).
Keep headings in that order and ensure each entry is filed under the correct group.

Template:

```md
## YYYY-MM-DD
### Added
- ...
### Fixed
- ...
### Changed
- ...
### Removed
- ...
```

Infra: Production runs behind Cloudflare (DNS/proxy) on a DigitalOcean VM. If you change domains, paths, or add new backend routes, also review:
- Cloudflare DNS/proxy settings and any Redirect/WAF/Caching rules
- Origin reverse-proxy config: `deploy/nginx-proxy.conf`
- Deploy-time env/vars: `DJANGO_ALLOWED_HOSTS`, `DJANGO_CORS_ALLOWED_ORIGINS`, `DJANGO_CSRF_TRUSTED_ORIGINS`, `REACT_APP_API_BASE_URL`
  - Password reset mail vars: `DJANGO_FRONTEND_BASE_URL`, `DJANGO_EMAIL_BACKEND`, `DJANGO_EMAIL_HOST`, `DJANGO_EMAIL_PORT`, `DJANGO_EMAIL_USE_TLS`, `DJANGO_EMAIL_HOST_USER`, `DJANGO_EMAIL_HOST_KEY`, `DJANGO_EMAIL_TIMEOUT`, `DJANGO_DEFAULT_FROM_EMAIL`

## Codex cloud environment
Use this description in the Codex environment settings:

```text
Notoli
A Notion-inspired list app with a Django REST backend and React frontend. Includes JWT auth, subdomain production routing at notoli.judeandrewalaba.com, Docker/Nginx deployment support, and local setup via Python requirements plus npm.
```

Use this setup script in Codex cloud environments:

```bash
set -euo pipefail

cd /board/Notoli

python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt

cd frontend
npm ci
```

Use the same script as the Codex maintenance script so cached containers refresh backend and frontend dependencies after checkout.

## Setup (local dev with Conda)
1) Create or update the Conda environment:
   - create: `conda env create -f backend/environment.yml`
   - update: `conda env update --file backend/environment.yml --prune`
2) Activate: `conda activate notoli_env`
3) Optional backend `.env` for local non-Docker runs:
   - `backend/.env` is auto-loaded by Django settings (`python-dotenv`).
   - Add `DJANGO_*` keys there if you don't want to set shell vars manually.
4) Optional env vars (defaults are used if unset):
   - `DJANGO_SECRET_KEY` (default: `default-key`)
   - `DJANGO_DEBUG` (default: `1`)
   - `DJANGO_SQLITE_PATH` (default: `backend/db.sqlite3`)
   - `DJANGO_ALLOWED_HOSTS` (comma-separated)
   - `DJANGO_CORS_ALLOWED_ORIGINS` (comma-separated)
   - `DJANGO_CSRF_TRUSTED_ORIGINS` (comma-separated)
   - `DJANGO_FRONTEND_BASE_URL` (default: `http://localhost:3000`; used in password-reset email links)
   - `DJANGO_MCP_BASE_URL` (origin only, no path; defaults to `http://localhost:8000` in debug or `https://notoli.judeandrewalaba.com` in production; OAuth issuer and MCP resource base)
   - `DJANGO_TRUSTED_PROXY_IPS` (individual proxy IPs only; default empty; production Compose sets Nginx's private address `172.30.88.2`; never use wildcards or CIDRs)
   - `DJANGO_EMAIL_BACKEND` (default: `django.core.mail.backends.console.EmailBackend`)
   - `DJANGO_EMAIL_HOST` (default: `smtp.resend.com`)
   - `DJANGO_EMAIL_PORT` (default: `587`)
   - `DJANGO_EMAIL_USE_TLS` (default: `1`)
   - `DJANGO_EMAIL_HOST_USER` (default: `resend`)
   - `DJANGO_EMAIL_HOST_KEY` (Resend API key)
   - `DJANGO_EMAIL_TIMEOUT` (default: `10`)
   - `DJANGO_DEFAULT_FROM_EMAIL` (default: `notoli@example.com`)
5) Run backend migrations: `python backend/manage.py migrate`
6) Start backend including MCP: `cd backend` then `python -m uvicorn app.asgi:application --port 8000 --reload --no-proxy-headers` (Django `runserver` serves only REST/auth, not `/mcp`). Return to the repo root for the frontend steps.
7) Frontend setup:
   - `cd frontend`
   - `npm install`
   - Optional: set `REACT_APP_API_BASE_URL` (default: `http://localhost:8000`)
     - For production builds, leave this blank/unset for relative `/api/...` calls on `https://notoli.judeandrewalaba.com`
   - `npm start`

## Setup (Docker)
1) For source iteration without the production proxy, use the hot-reload development stack:
   - Create a `.env` in `deploy/` from `deploy/backend.env`.
   - Create the SQLite bind-mount file with `New-Item -ItemType File -Path deploy/db.sqlite3 -Force`.
   - Start with `docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml up --build -d`.
   - Run migrations with `docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml exec -T backend python manage.py migrate`.
   - Open `http://notoli.localhost:3000`; Django is available at `http://notoli.localhost:8000`.
   - Both ports bind to localhost only. Override them with `NOTOLI_DEV_FRONTEND_PORT` and `NOTOLI_DEV_BACKEND_PORT` in `deploy/.env`.
   - The backend runs Uvicorn with reload so `/mcp` is available; Compose sets `DJANGO_MCP_BASE_URL` to the development backend origin.
   - A blank `DJANGO_SECRET_KEY` receives a Compose-only development fallback so the fresh stack can authenticate locally. Set a unique secret before using the production-shaped stack.
   - The frontend checks `package.json` and `package-lock.json` at each container start and runs `npm ci` when they change. After changing either file, restart the frontend service.
   - Stop with `docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml down`.
2) The production-shaped Docker stack needs a `.env` in `deploy/` (see `deploy/backend.env` for keys).
   - On servers, ensure the `.env` lives next to `docker-compose.yml` (it is hidden).
3) Ensure the TLS cert files exist for the reverse proxy:
   - Production (Cloudflare Origin Certificate):
     - `/root/apps/notoli/certs/origin.pem`
     - `/root/apps/notoli/certs/origin.key`
   - Optional (automated deploy): store raw PEM values in GitHub Secrets:
     - `CLOUDFLARE_ORIGIN_CERT_PEM` (raw PEM of `origin.pem`)
     - `CLOUDFLARE_ORIGIN_KEY_PEM` (raw PEM of `origin.key`)
   - These are mounted into the proxy container as `/etc/nginx/certs` (see `deploy/docker-compose.yml`).
4) Ensure the SQLite file exists when using the bind mount:
   - `cd deploy`
   - `touch db.sqlite3` (prevents Docker from creating a directory named `db.sqlite3`).
   - If Docker already created `deploy/db.sqlite3` as a directory, stop the stack, remove the empty directory, and recreate it as a file.
5) Start:
   - `cd deploy`
   - `docker compose up -d`
6) For local Docker runs that should use the current checkout rather than published GHCR images, rebuild first:
   - `docker build -t ghcr.io/vanillaicecube/notoli-backend:latest ./backend`
   - `docker build --build-arg REACT_APP_API_BASE_URL= -t ghcr.io/vanillaicecube/notoli-frontend:latest ./frontend`
   - The development backend image is pinned to the reviewed `condaforge/miniforge3` 24.04 digest. Update that digest only through an explicit image-version and security review.
   - The frontend image uses `npm ci`, so keep `frontend/package-lock.json` in sync with `frontend/package.json`.
7) The included reverse proxy serves the production frontend at `https://notoli.judeandrewalaba.com/` when local DNS/hosts point that name at your machine. HTTP redirects to HTTPS.
   Backend routes are available through the reverse proxy; production-shaped Compose publishes no direct backend port.
   Frontend is still available at `http://localhost:3000`.

## Production Routing Notes
Notoli runs at the subdomain root. Backend URLs use no configurable path prefix,
and Django static assets use `/static/`.

- Public URLs (subdomain-root):
  - Frontend: `https://notoli.judeandrewalaba.com`
  - Backend:
    - `https://notoli.judeandrewalaba.com/mcp` (exact path, no trailing slash; Streamable HTTP)
    - `https://notoli.judeandrewalaba.com/.well-known/oauth-protected-resource/mcp`
    - `https://notoli.judeandrewalaba.com/.well-known/oauth-authorization-server`
    - `https://notoli.judeandrewalaba.com/api`
      - Board sharing uses `POST /api/boards/<id>/collaborators/` and `DELETE /api/boards/<id>/collaborators/<user_id>/`.
      - Notifications use `GET /api/notifications/`, `PATCH` or `DELETE /api/notifications/<id>/`, `PATCH /api/notifications/mark-all-read/`, and `DELETE /api/notifications/clear-all/`.
    - `https://notoli.judeandrewalaba.com/auth`
    - `https://notoli.judeandrewalaba.com/admin`
  - Frontend public auth routes:
    - `https://notoli.judeandrewalaba.com/login`
    - `https://notoli.judeandrewalaba.com/register`
    - `https://notoli.judeandrewalaba.com/forgot-password`
    - `https://notoli.judeandrewalaba.com/reset-password`
  - Authenticated React integration routes: `/connections/authorize` (OAuth consent) and `/connections` (Connected Apps; also in the profile menu).
- Cloudflare -> origin TLS (Full strict):
  - Add/verify DNS for `notoli.judeandrewalaba.com` pointing to the same origin as the base site.
  - Generate a Cloudflare Origin Certificate for `judeandrewalaba.com` and `*.judeandrewalaba.com`.
  - Save it on the droplet at:
    - `/root/apps/notoli/certs/origin.pem`
    - `/root/apps/notoli/certs/origin.key`
  - Set Cloudflare SSL/TLS mode to `Full (strict)`.
- Required env vars for the subdomain backend:
  - `DJANGO_ALLOWED_HOSTS=notoli.judeandrewalaba.com`
  - `DJANGO_CORS_ALLOWED_ORIGINS=https://notoli.judeandrewalaba.com`
  - `DJANGO_CSRF_TRUSTED_ORIGINS=https://notoli.judeandrewalaba.com`
  - `DJANGO_FRONTEND_BASE_URL=https://notoli.judeandrewalaba.com`
  - `DJANGO_MCP_BASE_URL=https://notoli.judeandrewalaba.com`
- Frontend API base for production builds:
  - Prefer `REACT_APP_API_BASE_URL=` (blank/unset) so requests resolve to same-origin `/api/...`.
  - If blank handling is not possible in a deploy environment, use `REACT_APP_API_BASE_URL=https://notoli.judeandrewalaba.com`.
- Frontend auth behavior:
  - Tokens live in `sessionStorage` (`accessToken`/`refreshToken`).
  - Backend `401` from non-auth endpoints attempts one JWT refresh/retry. Invalid refresh credentials clear tokens, redirect to `/login`, and show an error snackbar. Connection requests preserve a validated local `next` path/query through login; ordinary login retains the preferred-board landing.
  - Forgot/reset password endpoints:
    - `POST /auth/forgot-password/` accepts `email` and always returns a generic success message.
    - `POST /auth/reset-password/` accepts `uid`, `token`, and `password`.

## Maintenance
- MCP review regressions: Connected Apps must include the current user's unexpired grants before token exchange, exclude expired/foreign grants, and deduplicate apps across grants/tokens. Read consent must explicitly disclose owner/collaborator IDs, usernames, and emails. The shared REST/MCP collaborator resolver must reject multiple matching identities before membership or notification writes; never choose a recipient with `.first()`.
- MCP deployment: install requirements, apply Django OAuth Toolkit's supplied migrations with `migrate`, and run `python manage.py check --deploy` under production settings. Serve `app.asgi:application` using Uvicorn with `--no-proxy-headers` (one worker for SQLite); WSGI does not serve MCP. Production publishes no backend port. Only Nginx shares `backend_private` (`172.30.88.0/29`, Nginx `172.30.88.2`); `backend_egress` is backend-only for outbound email. ASGI accepts forwarded scheme/client only from the configured exact proxy IP, strips all other forwarded metadata, and Django ignores forwarded host/proto headers. If changing the subnet, update IPAM, proxy fixed IP, and trusted IP together, then recreate services.
- Register the predefined public ChatGPT OAuth client once: `python manage.py register_mcp_client --redirect-uri "<exact ChatGPT callback URI>"`. Copy the callback from ChatGPT's management page; use S256 PKCE and token auth method `none`. No client secret, password grant, dynamic registration, or unverified OIDC email claims are exposed. Existing registrations must be edited explicitly in Django admin.
- MCP product coverage: 31 explicit tools cover boards, lists, items (including board-only items), ordering, membership, sharing, and notifications. `notoli:read` includes board-scoped owner/collaborator discovery; `notoli:write` permits item creation/edits; `notoli:share` permits owner-only collaborator add/remove; `notoli:organize` permits board/list creation/edits, order, and list membership; `notoli:notifications` permits recipient-only activity reads/read flags; `notoli:delete` permits permanent deletion (notification deletion also needs notifications). Sharing covers all lists/items in a board. Delete tools require `confirm: true` after explaining cascade impact; this is a caller assertion, not independent human verification. Arrays are capped at 1000 IDs, and reordering requires the complete current set. Preserve REST validation, owner checks, live membership checks, immutable boards, and notifications via shared services. Existing connections must reconnect for new scopes; refresh cannot escalate. Keep metadata/challenges aligned. No raw HTTP, global user directory, ownership transfer, or credential/admin tools are exposed. Full catalog/evaluations: `plugins/notoli/README.md`.
- Browser `GET /auth/mcp/authorize/` redirects to React `/connections/authorize` using `DJANGO_FRONTEND_BASE_URL` and the original query. React reuses the existing JWT login (no second Django session). JSON GET consent and POST ticket/decision require a verified JWT header; signed tickets bind the displayed request to the account for 10 minutes. Allow/Cancel returns Django's validated callback URL. React `/connections` calls JWT-only `GET/POST /auth/mcp/connections/` to list/revoke the current user's tokens and pending grants. Cookies and posted user IDs cannot authorize these endpoints. Keep JWTs out of URLs and retain PKCE/resource/scope checks in Django. Run `python manage.py cleartokens` periodically; keep access/refresh tokens, consent tickets, and authorization codes out of logs.
- When changing MCP routes or the issuer, review Cloudflare Redirect/WAF/Caching rules for `/mcp`, `/.well-known/*`, and `/auth/mcp/*`: no interactive challenges or path rewriting for MCP/discovery, no caching of authenticated responses, and rate limits for login/token endpoints. Existing DNS and Full (strict) TLS are reused. Details and connection steps: `deploy/README.md` and `plugins/notoli/README.md`.
- Backend migrations: `python backend/manage.py makemigrations` then `python backend/manage.py migrate`
- Update Conda env: `conda env update --file backend/environment.yml --prune`
- Regenerate Conda env + requirements:
  - `python backend/environment_manager.py export -o backend/environment.yml`
- Frontend deps: `cd frontend` then `npm install`
- Note: pip dependencies are installed via the `pip:` section in `environment.yml`
  and resolved from `requirements.txt` (never via conda).
- MCP HTTP protocol tests use the directly pinned `httpx2` client in `backend/requirements.txt`; keep its pin compatible with the MCP SDK and update the Conda environment through the existing pip requirements path.
