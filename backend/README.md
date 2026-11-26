# 🛠️ Notoli backend

The Django REST Framework backend owns application data, authentication,
permissions, notifications, and application integrations.

## 🧭 Structure

- `config/`: Django settings, URL configuration, and ASGI/WSGI entry points.
- `docker/`: production/development Dockerfiles and their adjacent Dockerfile-specific ignore files; keep `backend/` as the build context.
- `apps/tasks/`: boards, lists, and tasks; `services.py` owns actor-scoped queries, mutations, membership, ordering and activity events shared by REST and MCP.
- `apps/authentication/`, `apps/notifications/`: accounts and notifications; recipient-scoped notification operations live in `apps/notifications/services.py`.
- `apps/mcp/`: shared framework, Notoli tools and ChatGPT packaging in `framework/`, `tools/` and `chatgpt/`.

REST views own HTTP authentication, serializer validation and responses. MCP tools
retain OAuth scope checks, bounded results and durable request-UUID receipts. Routine
changes and collaborator additions execute directly; only deletion, collaborator
removal and omitted list memberships require
separate signed-in app approval. Tools validate
with the same serializers using an actor context, and call domain services
directly. Domain writes recheck live board membership and ownership under a
transaction; caller-provided or previously fetched objects do not authorize a
write. Removing a collaborator also removes access to lists and tasks they
created on that board. List creation retains its existing successful-write
behavior if activity delivery fails; other domain writes and their activity
records roll back together.

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

Uvicorn serves REST and, when `DJANGO_MCP_ENABLED=1`, MCP. Django `runserver` serves REST/auth only.

## ⚙️ Configuration

Production (`DJANGO_DEBUG=0`) requires an explicit nonblank `DJANGO_SECRET_KEY`.
Static files use Django's default storage and the retained WhiteNoise middleware.

Local runs load ignored `backend/.env`. The database defaults to
`backend/db.sqlite3`; set `DJANGO_SQLITE_PATH` to use another local database.
Use `config/settings.py` for current defaults.

| Setting | Purpose |
| --- | --- |
| `DJANGO_SECRET_KEY`, `DJANGO_DEBUG` | Stable local signing key and debug mode; use a private key and disable debug in production. |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated accepted hosts. |
| `DJANGO_CORS_ALLOWED_ORIGINS`, `DJANGO_CSRF_TRUSTED_ORIGINS` | Explicit frontend origins, including the port during development. |
| `DJANGO_FRONTEND_BASE_URL` | Browser redirects and password-reset links. |
| `DJANGO_MCP_ENABLED` | Only `1` enables MCP; backend and local Docker example default off. Production policy explicitly enables it. |
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
- API: `/api/` (boards/lists/tasks/notifications)
- Admin: `/admin/`
- MCP: `/mcp` (Streamable HTTP, exact path without trailing slash)
- OAuth for MCP: `/auth/mcp/` and discovery at `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource/mcp`

Production serves these routes from the subdomain root at `https://notoli.judeandrewalaba.com`.

## 🔐 Authentication API

Registration, login and reset preserve passwords exactly, including leading and
trailing spaces. Request serializers reject malformed credential/link types with
HTTP 400; email addresses are trimmed and normalized. Registration returns an
explicit client error for duplicate identities and rolls back account creation,
required onboarding and session creation together if any step fails. Recovery
responses remain generic for valid email-shaped input.

JWT auth is provided by `djangorestframework-simplejwt`.

Common endpoints:

- `POST /auth/register/` -> creates a user; returns `access`, `refresh`, `username`, `email`, and `board_id`
- `POST /auth/login/` -> accepts `email` (preferred) or `username`, plus `password`; returns `access`, `refresh`, `username`, and `email`
- `POST /auth/refresh/` -> exchanges `refresh` for a new `access`
- `POST /auth/forgot-password/` -> accepts `email`; sends a reset link if the account exists and returns a generic success message
- `POST /auth/reset-password/` -> accepts `uid`, `token`, and `password`; sets a new password when the token is valid

Signup explicitly saves the account and creates its starter board before issuing
session tokens. Registration returns the ID of that board. Django admin and
ordinary new-user saves use the same account setup. The starter board is named
after the username, such as `"andrew's Board"`. An email-derived name capitalizes
the first letter of the prefix, such as `"Example_02's Board"` for
`example_02@gmail.com`. The lists `Grocery List`, `Chores List`, and `Todo List`
contain sample tasks defined in [task services](apps/tasks/services.py).

All `/api/*` endpoints require:

- Header: `Authorization: Bearer <accessToken>`

## 🧱 Data model and access

The [task page](../frontend/src/pages/boards/ListTasksPage.jsx) creates a task
with its list ID and completes it by patching its status. The [task views](apps/tasks/views.py)
validate the request. The [task services](apps/tasks/services.py) check board access
and save the task and its ordered list membership in one transaction. The
[task API tests](apps/tasks/tests/test_tasks.py) read the saved status back from SQLite.

- A board contains lists and tasks.
- A list belongs to one board and orders tasks from that board.
- A task has `text`, an optional description, and a status. A task can appear in multiple lists.
- A notification belongs to one recipient and stores its read status and a copy of the board name.

### Permissions, ordering, and notifications

- Lists and tasks inherit access from the board's owner, creator, and collaborators. Each list and task records its own creator in `created_by`.
- Board owners can update board metadata and delete boards; collaborators receive a 403 response for board `PATCH`/`DELETE` attempts while retaining read access to shared boards.
- Board owners can manage board collaborators with `POST /api/boards/<id>/collaborators/` using `{ "identifier": "<username-or-email>" }` and `DELETE /api/boards/<id>/collaborators/<user_id>/`.
- Board responses include `owner_details` and `collaborators_details` summaries for sharing/access UI.
- Lists are returned in their saved board order. Persist a new board order with `PATCH /api/lists/reorder/` and `{ "board": <id>, "ordered_ids": [<list-id>, ...] }`.
- Tasks inside a list are returned in their saved order. Persist a new task order with `PATCH /api/tasks/reorder/` and `{ "list": <id>, "ordered_ids": [<task-id>, ...] }`.
- Each `ListTask` membership stores the task's position in that list.
- Tasks use `/api/tasks/` with a `text` field. List membership uses `tasks`. Notification responses expose `task`, `task_text`, and `task_*` event values. The Django app label `notes` preserves migration history.
- Notifications are only visible to their recipient. Clients can list them with `GET /api/notifications/`, mark one read with `PATCH /api/notifications/<id>/`, clear one with `DELETE /api/notifications/<id>/`, mark all read with `PATCH /api/notifications/mark-all-read/`, and clear all with `DELETE /api/notifications/clear-all/`.
- Notification responses include board, list, and task context plus `target_path` for navigation.
- Shared board activity notifies other board members about board renames and deletions, list and task changes, task completions, and collaborator changes. Added and removed collaborators also receive a direct notification.
- Board, list, and task activity notifications are best effort. If a notification write fails, the backend logs the failure and saves the edit. The add and remove collaborator actions save their notifications and the access change in one transaction. Both roll back on failure.

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
so Anymail reports a configuration error before attempting provider HTTP.
Set the maintained backend name explicitly; retired custom Resend paths are no
longer translated at startup. Console, SMTP and other configured backends retain
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

Backend tests live in an owning `tests/` package beside each app or configuration
module. Use descriptive `test_*.py` filenames and behavior-based test class names,
keep `__init__.py` empty, and put shared setup/builders in fixture-only modules
such as `helpers.py`. Helpers must not define test cases or import test modules.
Split independent behavior groups when that makes failures easier to locate;
keep related end-to-end scenarios together.

Authentication packages share registration, login, password recovery/reset and
recovery-privacy groups. Configuration owns production settings and email
configuration/delivery. The canonical MCP framework has identical profile, OAuth
and transport test modules in all three applications; app tools remain app-owned.

Task tests separate board/list APIs from task lifecycle, access and membership;
`apps/tasks/tests/test_ordering.py` covers both board-list and per-list task order.
Authentication retains onboarding and HTTP-method coverage. Notification events
and bulk actions, app-owned MCP tools and exact proxy trust retain their own
groups. The ordinary profile defaults MCP off. Run the app-owned MCP suites
separately with `DJANGO_MCP_ENABLED=1 DJANGO_MCP_BASE_URL=http://localhost:8000`
from `backend/`, targeting `apps.mcp.framework apps.mcp.tools`. CI runs both profiles.

From the repository root:

```powershell
uv run --locked --project backend python backend/manage.py test backend
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
Django uses its default test runner and secure password hashing; focused tests may
override hashing within their own test scope.
See [Docker dependency maintenance](../deploy/README.md#development-dependency-reproducibility).

## 🚀 Production

Use the [production launch guide](../deploy/production/README.md)
for private configuration, exact proxy trust, migrations, static files and readiness.
Production sessions/CSRF cookies require HTTPS with debug disabled; backend ports
remain private. Local Docker files are development tools, not production release inputs.
