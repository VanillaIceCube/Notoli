# 🛠️ Notoli backend

The Django REST Framework backend owns application data, authentication,
permissions, notifications, and application integrations.

## 🧭 Structure

- `app/`: settings and server entry points.
- `notes/`: boards, lists, and notes.
- `authentication/`, `notifications/`: accounts and notifications.
- `integrations/`, `app_mcp/`: application tools and shared MCP.

## 💻 Local development

Use Python 3.12 in an isolated environment. From the repository root:

```powershell
python -m pip install -r backend/requirements.txt
python backend/manage.py migrate
Set-Location backend
python -m uvicorn app.asgi:application --port 8000 --reload --no-proxy-headers
```

Local settings can be supplied in ignored `backend/.env`.
For Docker hot reload, follow the [deployment guide](../deploy/README.md).

Uvicorn serves both REST and MCP. Django `runserver` serves REST/auth only.

## ⚙️ Configuration

Local runs load ignored `backend/.env`. The database defaults to
`backend/db.sqlite3`; set `DJANGO_SQLITE_PATH` to use another local database.
Use `app/settings.py` for current defaults.

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

New users get a default board named after their username, such as `"andrew's Board"`, created automatically via a post-save signal in `notes/signals.py`. If the username is auto-derived from the email prefix, the board name uses that prefix with its first letter capitalized, such as `"Example_02's Board"` for `example_02@gmail.com`. The default personal board is also bootstrapped with ordered starter lists: `Grocery List`, `Chores List`, and `Todo List`, each with starter notes.

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

Local development uses Django's console email backend. The included
Resend HTTPS backend is configured with:

```env
DJANGO_EMAIL_BACKEND=authentication.email_backends.ResendApiEmailBackend
DJANGO_EMAIL_HOST_KEY=<resend-api-key>
DJANGO_EMAIL_TIMEOUT=10
DJANGO_DEFAULT_FROM_EMAIL=<sender-on-a-verified-domain>
```

Keep `.localhost` senders with console delivery. Live delivery uses an approved
sender domain and private credentials configured through the production guide.
Plain text, HTML, multipart alternatives, `cc`, `bcc`, and `reply_to` are supported.

The socket-operation timeout defaults to 10 seconds and supports `0 < seconds <= 30`.
The environment value is parsed as an integer. Invalid runtime timeout values fall
back safely; malformed startup configuration fails visibly. A successful provider
response means acceptance, not confirmed inbox delivery.

Failures preserve `fail_silently`: false re-raises, while true skips failures and
returns the number sent. Password reset returns a generic response for known and
unknown accounts, including delivery failures. Logger `authentication.email_backends`
records safe category/status fields: `configuration`, `request`, `rate_limit`,
`provider`, `timeout`, `network`, or `unexpected`. Never log provider response
bodies, recipient details, reset tokens, message contents, or credentials.

Diagnose failures using those categories and the existing provider dashboard.
There is no automatic retry or resend: a timeout may occur after acceptance.
Use mocked delivery tests; production email receipt requires separate verification.

## 🔌 MCP integration

The shared-framework checker lives at `backend/check_app_mcp.py`, beside the backend
and outside the hash-verified package. Run `python backend/check_app_mcp.py` from
the repository root; use `--source-root <canonical-checkout>` for local offline
verification. See the [framework guide](app_mcp/README.md) for source ownership.

The [MCP README](app_mcp/README.md) explains shared transport,
OAuth, configuration, and verification.

Notoli tools and permissions live in the [integration README](integrations/README.md),
which links to the [ChatGPT plugin guide](../backend/app_mcp/chatgpt/README.md).

Connection manifests, artwork, and package builders live in
[chatgpt/](app_mcp/chatgpt/README.md).

## 🧪 Checks

From the repository root:

```powershell
python backend/manage.py test
ruff check backend
ruff format backend --check
python backend/manage.py makemigrations --check --dry-run
```

## 🛠️ Maintenance

Keep registration and reset validation against the prospective/existing user,
preserve password whitespace, and retain generic account-recovery responses.
Notification operations remain recipient-scoped; bulk mutations are atomic.
Preserve pending/error handling through response parsing in the frontend.

Maintain the Python version in `environment.yml` and pip dependencies in
`requirements.txt` together with CI and Docker. The test runner's fast password
hasher applies only during tests; normal settings retain secure hashing.
See [Docker dependency maintenance](../deploy/README.md#development-dependency-reproducibility).

## 🚀 Production

Use the [production release and recovery guide](../deploy/production/README.md)
for private configuration, exact proxy trust, migrations, static files and readiness.
Production sessions/CSRF cookies require HTTPS with debug disabled; backend ports
remain private. Local Docker files are development tools, not production release inputs.
