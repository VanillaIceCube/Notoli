# 🛠️ Notoli backend

The Django REST Framework backend owns application data, authentication,
permissions, notifications, and application integrations.

## 🧭 Structure

- `config/`: Django settings, URL configuration, and ASGI/WSGI entry points.
- `docker/`: production/development Dockerfiles and their adjacent Dockerfile-specific ignore files; keep `backend/` as the build context.
- `apps/notes/`: boards, lists, and notes.
- `apps/authentication/`, `apps/notifications/`: accounts and notifications.
- `apps/mcp/`: shared framework, Notoli tools and ChatGPT packaging in `framework/`, `tools/` and `chatgpt/`.

## 💻 Local development

Install uv 0.13.8 using the [official installation guide](https://docs.astral.sh/uv/getting-started/installation/).
uv manages Python 3.12 and the ignored `backend/.venv/`; Conda is not required.
From the repository root:

```powershell
uv sync --locked --project backend
uv run --locked --project backend python backend/manage.py migrate
Set-Location backend
uv run --locked uvicorn config.asgi:application --port 8000 --reload --no-proxy-headers
```

Local settings can be supplied in ignored `backend/.env`.
For Docker hot reload, follow the [deployment guide](../deploy/README.md).

Uvicorn serves both REST and MCP. Django `runserver` serves REST/auth only.

## ⚙️ Configuration

Local runs load ignored `backend/.env`. The database defaults to
`backend/db.sqlite3`; set `DJANGO_SQLITE_PATH` to use another local database.
Use `config/settings.py` for current defaults.

| Setting | Purpose |
| --- | --- |
| `DJANGO_SECRET_KEY`, `DJANGO_DEBUG` | Stable local signing key and debug mode; use a private key and disable debug in production. |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated accepted hosts. |
| `DJANGO_CORS_ALLOWED_ORIGINS`, `DJANGO_CSRF_TRUSTED_ORIGINS` | Explicit frontend origins, including the port during development. |
| `DJANGO_FRONTEND_BASE_URL` | Browser redirects and password-reset links. |
| `DJANGO_EMAIL_BACKEND`, `DJANGO_DEFAULT_FROM_EMAIL` | Delivery backend and sender. |
| `DJANGO_EMAIL_HOST`, `DJANGO_EMAIL_PORT`, `DJANGO_EMAIL_USE_TLS` | SMTP configuration when using an SMTP backend. |
| `DJANGO_EMAIL_HOST_USER`, `DJANGO_EMAIL_HOST_KEY`, `DJANGO_EMAIL_TIMEOUT` | Delivery credentials and timeout; keep credentials out of source control. |

For Docker hot reload and dependency volumes, use the
[deployment README](../deploy/README.md).

With `DJANGO_DEBUG=0`, startup requires a nonblank secret. A stable local key
keeps sessions valid across restarts. `DJANGO_MCP_BASE_URL` is the OAuth issuer
origin; its exact resource is `<origin>/mcp`. Run Uvicorn with `--no-proxy-headers`.
Only exact IPs in `DJANGO_TRUSTED_PROXY_IPS` may supply forwarded scheme/client
metadata; other forwarded headers are stripped. Local development trusts none.
Production supplies Nginx's exact private IP and exposes no backend host port.
See the [production network contract](../deploy/production/README.md).

## 🗺️ API routes

Top-level routes (without any path prefix):

- Auth: `/auth/` (register/login/refresh)
- API: `/api/` (boards/lists/notes/notifications)
- Admin: `/admin/`
- MCP: `/mcp` (Streamable HTTP, exact path without trailing slash)
- OAuth for MCP: `/auth/mcp/` and discovery at `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource/mcp`

Production serves these routes from the subdomain root at `https://notoli.judeandrewalaba.com`.

## 🔐 Authentication API

JWT auth is provided by `djangorestframework-simplejwt`.

Common endpoints:

- `POST /auth/register/` -> creates a user; returns `access`, `refresh`, `username`, `email`, and `board_id`
- `POST /auth/login/` -> accepts `email` (preferred) or `username`, plus `password`; returns `access`, `refresh`, `username`, and `email`
- `POST /auth/refresh/` -> exchanges `refresh` for a new `access`
- `POST /auth/forgot-password/` -> accepts `email`; sends a reset link if the account exists and returns a generic success message
- `POST /auth/reset-password/` -> accepts `uid`, `token`, and `password`; sets a new password when the token is valid

New users get a default board named after their username, such as `"andrew's Board"`, created automatically via a post-save signal in `apps/notes/signals.py`. If the username is auto-derived from the email prefix, the board name uses that prefix with its first letter capitalized, such as `"Example_02's Board"` for `example_02@gmail.com`. The default personal board is also bootstrapped with ordered starter lists: `Grocery List`, `Chores List`, and `Todo List`, each with starter notes.

All `/api/*` endpoints require:

- Header: `Authorization: Bearer <accessToken>`

## 🧱 Data model and access

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

## ✉️ Email

Local development uses Django's console email backend. Resend delivery uses
Django-Anymail's maintained backend directly, with no application-owned email
backend package. Configure it through the existing variables:

```env
DJANGO_EMAIL_BACKEND=anymail.backends.resend.EmailBackend
DJANGO_EMAIL_HOST_KEY=<resend-api-key>
DJANGO_EMAIL_TIMEOUT=10
DJANGO_DEFAULT_FROM_EMAIL=<sender-on-a-verified-domain>
```

The existing host key maps to `ANYMAIL.RESEND_API_KEY`; blank values are omitted
so Anymail reports a configuration error before attempting provider HTTP. The
three retired custom Resend backend paths are normalized to the maintained
backend at startup. Console, SMTP and other explicitly configured backends retain
their existing selection and variables. Keep `.localhost` senders with console
delivery; live delivery requires an approved sender domain and private credentials.

`ANYMAIL.REQUESTS_TIMEOUT` defaults to 10 seconds. Integer environment values
outside `0 < seconds <= 30` fall back to 10; malformed integer startup values
continue to fail visibly. API request debugging is explicitly disabled to avoid
printing keys, recipients, reset links or provider payloads. There are no inbound
routes, webhook dependencies or automatic retries in this integration.

Operational delivery failures respect `fail_silently`: false raises an Anymail
exception, while true skips the failed message and returns the number sent.
Configuration errors, including an absent API key, are raised during backend
construction even when `fail_silently=True`; the project does not wrap or override
that maintained behavior. Password reset catches failures and retains the same
generic response for known and unknown accounts. Its application logger records
only a fixed failure message without exception text or tracebacks. Never log an
Anymail exception's text/repr, provider body, recipients, reset tokens or secrets.

Plain text, HTML alternatives, `cc`, `bcc` and `reply_to` pass through Django's
email API. A successful provider response means acceptance, not inbox delivery.
Use the provider dashboard for delivery diagnosis and mocked request-boundary
tests for local verification; production receipt requires separate acceptance.

## 🔌 MCP integration

The [MCP README](apps/mcp/README.md#framework) explains shared transport,
OAuth, configuration, and verification.

Notoli tools and permissions live in the [integration README](apps/mcp/README.md#application-tools),
which links to the [ChatGPT plugin guide](apps/mcp/README.md#chatgpt).

Connection manifests and artwork live in
[chatgpt/](apps/mcp/README.md#chatgpt).

## 🧪 Checks

From the repository root:

```powershell
uv run --locked --project backend python backend/manage.py test
uv run --locked --project backend ruff check backend
uv run --locked --project backend ruff format backend --check
uv run --locked --project backend python backend/manage.py makemigrations --check --dry-run
```

## 🛠️ Maintenance

Keep registration and reset validation against the prospective/existing user,
preserve password whitespace, and retain generic account-recovery responses.
Notification operations remain recipient-scoped; bulk mutations are atomic.
Preserve pending/error handling through response parsing in the frontend.

Declare runtime dependencies in `pyproject.toml` and test/lint tools in its
`dev` group. Commit the generated `uv.lock`; `uv sync --locked` rejects stale
locks. Add/remove dependencies with `uv add` / `uv remove` from `backend/`,
and use `uv lock --upgrade-package <name>` for a deliberate upgrade. Keep
`project.requires-python` aligned with Python 3.12 in CI and Docker.
The test runner's fast password
hasher applies only during tests; normal settings retain secure hashing.
See [Docker dependency maintenance](../deploy/README.md#development-dependency-reproducibility).

## 🚀 Production

Use the [production release and recovery guide](../deploy/production/README.md)
for private configuration, exact proxy trust, migrations, static files and readiness.
Production sessions/CSRF cookies require HTTPS with debug disabled; backend ports
remain private. Local Docker files are development tools, not production release inputs.
