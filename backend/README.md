# 🛠️ Backend (Django)

The Notoli backend is a Django + Django REST Framework API and authenticated MCP server, served by Uvicorn ASGI in production.

## 🧭 What Lives Here
- `backend/app/`: Django project settings/urls (`settings.py`, `urls.py`)
- `backend/authentication/`: custom user model + JWT auth endpoints
- `backend/notes/`: boards, lists, and notes (DRF viewsets)
- `backend/notifications/`: recipient-scoped in-app notifications, API endpoints, and notification helper services
- `backend/integrations/`: OAuth policy/pages/client registration and MCP tools
- `backend/manage.py`: Django management entrypoint

## 🗺️ API Routes
Top-level routes (without any path prefix):
- Auth: `/auth/` (register/login/refresh)
- API: `/api/` (boards/lists/notes/notifications)
- Admin: `/admin/`
- MCP: `/mcp` (Streamable HTTP, exact path without trailing slash)
- OAuth for MCP: `/auth/mcp/` and discovery at `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource/mcp`

Production serves these routes from the subdomain root at `https://notoli.judeandrewalaba.com`.

## ChatGPT MCP authentication and tools

The official Python MCP SDK serves a stateless JSON Streamable HTTP endpoint
at `/mcp`. Django OAuth Toolkit supplies migrations and the authorization-code
flow. Run the ASGI entrypoint, not WSGI or Django `runserver`, to expose MCP.
`DJANGO_MCP_BASE_URL` is the issuer origin (no path); the exact token audience
is `<origin>/mcp`. Production must use HTTPS. The origin must also be in
`DJANGO_ALLOWED_HOSTS` and, for browser consent, `DJANGO_CSRF_TRUSTED_ORIGINS`.

Users sign in at `/auth/mcp/login/` with email or username and approve scopes
at `/auth/mcp/authorize/`. These pages use Django session cookies and CSRF
protection, separate from frontend JWT authentication. Session and CSRF cookies
are secure when debug is disabled. `/auth/mcp/connections/` lists their connected
applications and revokes their access tokens, refresh tokens, and pending
authorization codes. The RFC 7009 token revocation endpoint is
`POST /auth/mcp/revoke/`; token exchange/refresh is `POST /auth/mcp/token/`
with a form-encoded body.

Register a public client after migrations:

```bash
python manage.py register_mcp_client --redirect-uri "<exact callback URI shown by ChatGPT>"
```

The default client ID is `notoli-chatgpt`; token authentication is `none` and
S256 PKCE is mandatory. Repeat `--redirect-uri` for multiple exact HTTPS
callbacks. Review changes to existing registrations in Django admin; the command
does not silently replace them. Client registration is operator controlled;
there is no dynamic registration endpoint or OIDC email verification claim.

The issuer is included as `iss` in OAuth callback responses. Authorization
requires `state`, S256, and the exact MCP `resource`. The server validates
resource binding, expiry, active user, scopes, and revocation on each HTTP
request and rechecks them inside each tool. JWTs are not accepted by MCP and
OAuth MCP tokens are not accepted by the REST API. Access tokens expire after
one hour; refresh tokens rotate with reuse protection and a 30-day idle limit.
The toolkit stores token checksums rather than bearer tokens. Run
`python manage.py cleartokens` periodically; do not log token bodies or headers.

`notoli:read` grants discovery/read tools; `notoli:write` additionally grants
`add_item` and `update_item`. Read pagination defaults to 50 and is capped at
100. Write titles are capped at 255 characters, descriptions at 10,000. Tool
schemas and annotations include each tool's OAuth scopes. Missing write scope
returns an MCP authentication challenge so ChatGPT can request reauthorization.
Board/list permission failures return ordinary tool errors without data.

Tools reuse the REST querysets, note serializer, and `perform_create`/
`perform_update` services inside a transaction, preserving validation, ordering,
and notifications. MCP also rechecks board membership even for an item's original
creator after collaboration is removed. No deletion or sharing tools are exposed.
See [plugin tools and evaluation prompts](../plugins/notoli/README.md).

Run the OAuth and HTTP protocol tests with `python manage.py test integrations`.

## 🔐 Authentication
JWT auth is provided by `djangorestframework-simplejwt`.

Common endpoints:
- `POST /auth/register/` -> creates a user; returns `access`, `refresh`, `username`, `email`, and `board_id`
- `POST /auth/login/` -> accepts `email` (preferred) or `username`, plus `password`; returns `access`, `refresh`, `username`, and `email`
- `POST /auth/refresh/` -> exchanges `refresh` for a new `access`
- `POST /auth/forgot-password/` -> accepts `email`; sends a reset link if the account exists and returns a generic success message
- `POST /auth/reset-password/` -> accepts `uid`, `token`, and `password`; sets a new password when the token is valid

New users get a default board named after their username, such as `"andrew's Board"`, created automatically via a post-save signal in `notes/signals.py`. If the username is auto-derived from the email prefix, the board name uses that prefix with its first letter capitalized, such as `"Example_02's Board"` for `example_02@gmail.com`. The default personal board is also bootstrapped with ordered starter lists: `Grocery List`, `Chores List`, and `Todo List`, each with starter notes.

All `/api/*` endpoints require:
- Header: `Authorization: Bearer <accessToken>`

## 🧱 Data Model (High Level)
- Board: top-level container for organizing lists
- List: belongs to a board; associates notes via a many-to-many relation
- Note: a single checklist item (`note` + optional `description` + `status`); can be linked into multiple lists
- Notification: recipient-scoped in-app activity item with persistent read/unread state, board-name snapshots, optional board/list/note context, and frontend navigation targets, owned by the `notifications` app

Access scoping:
- Board membership is the source of truth for access. `Board.owner` and `Board.collaborators` control access to child lists and notes.
- Lists and notes keep `created_by` metadata, but do not have separate owner or collaborator fields.
- Board owners can update board metadata and delete boards; collaborators receive a 403 response for board `PATCH`/`DELETE` attempts while retaining read access to shared boards.
- Board owners can manage board collaborators with `POST /api/boards/<id>/collaborators/` using `{ "identifier": "<username-or-email>" }` and `DELETE /api/boards/<id>/collaborators/<user_id>/`.
- Board responses include `owner_details` and `collaborators_details` summaries for sharing/access UI.
- Lists are returned in their saved board order. Persist a new board order with `PATCH /api/lists/reorder/` and `{ "board": <id>, "ordered_ids": [<list-id>, ...] }`.
- Notes inside a list are returned in their saved list-membership order. Persist a new note order with `PATCH /api/notes/reorder/` and `{ "list": <id>, "ordered_ids": [<note-id>, ...] }`.
- Note order is stored on the `ListNote` membership table so the same note can appear in multiple lists with different positions.
- Notifications are only visible to their recipient. Clients can list them with `GET /api/notifications/`, mark one read with `PATCH /api/notifications/<id>/`, clear one with `DELETE /api/notifications/<id>/`, mark all read with `PATCH /api/notifications/mark-all-read/`, and clear all with `DELETE /api/notifications/clear-all/`.
- Notification responses include board/list/note context plus `target_path` so the frontend can route users to the relevant board or list.
- Shared board activity creates notifications for other board members when a collaborator is added or removed, when a board is renamed, when a list is created or updated, when a note is created, updated, or transitions to `Complete`, and when boards/lists/notes are deleted. Added and removed collaborators also receive direct access-change notifications.

## 💻 Local Development
Full setup (Conda, env vars) lives in [`AGENTS.md`](../AGENTS.md). Common commands:

```bash
python backend/manage.py migrate
cd backend
python -m uvicorn app.asgi:application --port 8000 --reload
```

For local non-Docker runs, Django auto-loads `backend/.env` (via `python-dotenv`) before reading `DJANGO_*` settings.

## Docker hot reload

The development Compose workflow builds `backend/Dockerfile.dev`, mounts the
backend source, and runs Uvicorn with source reload:

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml up --build -d backend
docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml exec -T backend python manage.py migrate
```

The development backend listens on `http://notoli.localhost:8000` by default.
Use the production Dockerfile and Compose file when testing Uvicorn, Nginx,
HTTPS, or deployment-shaped behavior.

The development Compose configuration supplies a local-only fallback when
`DJANGO_SECRET_KEY` is blank, so a freshly copied `deploy/.env` can issue JWTs
without manual configuration. Provide a unique `DJANGO_SECRET_KEY` before
using the production-shaped stack. `backend/Dockerfile.dev` pins Miniforge
24.04 to a reviewed digest; update that digest only through an explicit
image-version and security review.

Run tests:

```bash
cd backend
python manage.py test
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
- `DJANGO_MCP_BASE_URL` (OAuth issuer origin; exact MCP resource is `<origin>/mcp`)
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
