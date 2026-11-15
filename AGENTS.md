# AGENTS.md

## 🧭 Ownership and shared rollout

FullStackTemplate owns reusable application engineering and the canonical MCP
Python framework. Infrastructure owns shared ingress, host operations and the
versioned application release engine. Each application owns its domain behavior,
credentials, OAuth issuer, consent, permissions and MCP tools; do not introduce a
shared authorization service, cross-application account mapping or YNAB dependency.

Follow the [shared rollout policy](https://github.com/VanillaIceCube/FullStackTemplate/blob/main/.github/README.md#-shared-engineering-ownership-and-rollout)
for reusable framework, automation, test or security changes. One canonical
FullStackTemplate parent must inventory all four repositories as required,
not applicable, already satisfied or explicitly deferred with reasons and evidence.
Infrastructure-owned deployment/host changes use an Infrastructure parent with
linked downstream work; do not relocate source ownership.
The parent is complete only after required downstream adoptions are merged and
verified, or explicitly deferred with an owner, tracking issue and acceptance.
Record final-head/main checks and exact PR/commit/evidence links; template-only
success is insufficient. Preserve active PRs, issue history, production controls
and non-triggering labels when consolidating work.

## 📚 Documentation ownership

The main README introduces the repository. Keep setup, commands, configuration,
and maintenance details in the owning folder README and its linked references.
Use consistent headings: 🧭 Structure, 💻 Local development, ⚙️ Configuration,
🧪 Checks, 🔌 MCP integration, and 📚 Reference where applicable.
Use the owning folder READMEs linked below for setup and maintenance.
Keep this file current when its commands or constraints change, and update the
owning README/reference when setup, routing, environment, deployment or CI changes.
Record user-visible or operational changes in `CHANGELOG.md`.

GitHub setup belongs in [.github/README.md](.github/README.md), workflow behavior
in [.github/workflows/README.md](.github/workflows/README.md), and the shared
reviewer/action contract in [.github/actions/README.md](.github/actions/README.md).

Application setup/API/authentication belongs in [backend/README.md](backend/README.md),
frontend routing/configuration/style in [frontend/README.md](frontend/README.md),
and local Docker/deployment setup in [deploy/README.md](deploy/README.md).

## 📝 Changelog format

Keep the single `# Changelog` title and established introduction at the top;
never place entries above them. Use newest-first `## YYYY-MM-DD` sections,
reusing the existing date instead of creating a duplicate. Within each date,
use only nonempty `### Added`, `### Fixed`, `### Changed`, `### Removed` groups,
in that order, with no duplicate categories and entries filed under the correct
group. Use `- ` bullets and one blank line around headings. Preserve substantive
history and valid UTF-8 text when editing or merging entries.

## 💻 Local development

Use manual setup; do not assume Django or Node dependencies are installed.
Use uv 0.13.8 to manage Python 3.12 and the backend environment, and the Node
version range in `frontend/package.json`. Follow the backend README for uv setup.
Uvicorn serves REST and MCP; Django `runserver` serves REST/auth only.

### Codex cloud environment

Use this description in the Codex environment settings:

```text
Notoli
A Notion-inspired list app with a Django REST backend and React frontend. Includes JWT auth, subdomain production routing at notoli.judeandrewalaba.com, Docker/Nginx deployment support, and local setup via uv sync plus npm.
```

Use this setup script in Codex cloud environments:

```bash
set -euo pipefail

cd /board/Notoli

python -m pip install uv==0.13.8
uv sync --locked --project backend

cd frontend
npm ci
```

Use the same script as the Codex maintenance script so cached containers refresh backend and frontend dependencies after checkout.

### uv setup

1) Install uv 0.13.8 following its official installation guide, then run
   `uv sync --locked --project backend` from the repository root.
2) Optional backend `.env` for local non-Docker runs:
   - `backend/.env` is auto-loaded by Django settings (`python-dotenv`).
   - Add `DJANGO_*` keys there if you don't want to set shell vars manually.
3) Run backend migrations: `uv run --locked --project backend python backend/manage.py migrate`
4) Start backend including MCP: `cd backend` then `uv run --locked uvicorn config.asgi:application --port 8000 --reload --no-proxy-headers` (Django `runserver` serves only REST/auth, not `/mcp`). Return to the repo root for the frontend steps.
5) Frontend setup:
   - `cd frontend`
   - `npm install`
   - Optional: set `REACT_APP_API_BASE_URL` (default: `http://localhost:8000`)
     - For production builds, leave this blank/unset for relative `/api/...` calls on `https://notoli.judeandrewalaba.com`
   - `npm start`

### Docker setup

Backend image definitions live in `backend/docker/`; keep `backend/` as the
Docker build context. Frontend image definitions and Nginx configuration live in
`frontend/docker/`; keep `frontend/` as the Docker build context.
Both Docker folders contain `Dockerfile.dockerignore` and
`Dockerfile.dev.dockerignore`; their patterns are relative to the corresponding
backend/frontend context. Preserve Nginx configuration and development entrypoint
inputs when adjusting exclusions.

Use the [local Docker guide](deploy/README.md) for hot reload at
`notoli.localhost` and optional standalone HTTPS. Initialize only missing local
env/database files; never truncate an existing SQLite file. Development Compose
mounts backend/frontend source, binds ports to loopback and runs Uvicorn/Vite
reload. Restart the frontend after dependency changes so its startup check runs
`npm ci`. Keep the reviewed development base-image digest and lockfile in sync.

`deploy/docker-compose.yml` and `deploy/nginx-proxy.conf` are local/legacy-only.
Do not use them on the shared production host. The
[production guide](deploy/production/README.md) is the sole app release/recovery
procedure; Infrastructure owns gateway, certificates and host routing.

## ⚙️ Configuration

Optional backend variables (defaults are used if unset):

- `DJANGO_SECRET_KEY` (required when `DJANGO_DEBUG=0`; debug runs generate a temporary random key if unset/blank, so set a stable local key to retain sessions across restarts)
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

## 🧪 Checks

Keep backend tests in owning `tests/` packages with descriptive behavior-based
`test_*.py` modules and empty `__init__.py` files. Shared fixture helpers must not
define discoverable test cases or import test modules. Group modules and classes
by behavior, preserve test discovery and assertions when splitting, and keep the
canonical MCP framework tests aligned across applications.

Run checks in proportion to the change, from the repository root:

```powershell
uv run --locked --project backend python backend/manage.py test backend
uv run --locked --project backend ruff check backend
uv run --locked --project backend ruff format backend --check
```

From `frontend/`:

```powershell
npm test
npm run lint:strict
npm run format:check
npm run build
```

Shared frontend test setup and helpers live in `frontend/src/test-helpers/`.
App, startup and feature tests stay beside their implementation. Vitest discovers
`*.test.js` and `*.test.jsx`.

For shared release changes, run `python deploy/check_parity.py` and
`python -m unittest discover -s deploy/tests -v` with a disposable local/CI Docker
daemon, plus all applicable consumer suites. Never test against production.

## 🚀 Production

Ordinary changes merge through reviewed `main` before promoting an exact reviewed
source tree through the repository's existing `env-prod` process. Preserve all
required CI, reviews, owner authorization and recovery gates. Explicitly
owner-authorized deployment experiments must return promptly to `main` through
review before the next ordinary promotion. Preserve both histories and newer main
work; never reset or force-push to manufacture parity. Intentional release lag is
allowed while prerequisites or acceptance remain unfinished. History reconciliation
does not authorize deployment, and an absent production branch is not a reason
to create one. Follow the [main-first release policy](https://github.com/VanillaIceCube/FullStackTemplate/blob/main/.github/README.md#main-first-releases).

Common release code, tests, checker and workflow are owned by Infrastructure.
Change `app-release/v1` at the source, regenerate its manifest, then synchronize
all consumers to the same immutable source commit. Application repositories track
that source in `deploy/shared-source.json`; never edit only a vendored copy.
Preserve app-specific Compose, network/readiness policy, immutable image digests,
SQLite capture/recovery and explicit rollback. Keep shared ingress/certificates
and host operations within their separately authorized Infrastructure scope.

Use the [app-only release/recovery guide](deploy/production/README.md).
`deploy/production/app.json` owns the app's intentional network/readiness policy.
Review Infrastructure gateway/vhosts, Cloudflare DNS/proxy/Redirect/WAF/Caching
settings and allowlist/base-URL variables when domains or routes change.
Retain prior release images and matched private recovery data; no host-wide Docker
pruning. Cleanup requires the host operator to review disk usage and select unused
app images explicitly. Releases manage only the app's backend/frontend; local
`deploy/docker-compose.yml` and `deploy/nginx-proxy.conf` are local/legacy-only.

Preserve branch ownership recorded in
[FullStackTemplate #262](https://github.com/VanillaIceCube/FullStackTemplate/issues/262)
and [Notoli #975](https://github.com/VanillaIceCube/Notoli/issues/975).
Production uses only the app release/recovery procedure; Infrastructure owns
Cloudflare, certificates, gateway and host routing under its separately approved
operator plan.

### Routes and authentication

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
- Navigation utilities accept `/board/` and `/boards/` inputs, strip query/fragment suffixes and a trailing slash, and ignore invalid paths or navigators. Public React routes and generated links use singular `/board/`; helper compatibility does not add a plural route.
- Cloudflare, certificate and gateway changes belong to the separately approved
  Infrastructure operator plan; see the [production guide](deploy/production/README.md).
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

## 🤖 GitHub automation

Preserve existing required checks, scanner/lint/test gates and reviewer budgets.
Eligible same-repository human and Dependabot PRs retain their reviewers; forks
remain excluded from secret-bearing reviews. Keep reviewer identities and
serialized writers separate, validated optional `AI_REVIEW_*` settings aligned,
and Dependabot lint auto-fixes disabled. External GitHub Actions use immutable
commit SHAs with version comments. Workflow updates do not authorize deployment.

The shared publisher fails after every `REQUEST_CHANGES`, including repeated or
unchanged verdicts; valid `APPROVE`/`COMMENT` pass and unavailable/invalid output
fails. Missing credentials, incomplete required major-upgrade briefs and oversized
diffs must fail visibly. The shared diff budget is 512 KiB. Obi-Wan's semver-major
Dependabot brief uses complete primary-source evidence; web search remains limited
to that review path. Run the repository's publisher regression tests and
Actionlint when changing this contract. Where used, the read-only `verify-gates.js` audit requires actual
successful reviewer results, including after cancelled or skipped runs.

Dependency review retains full JSON in the `dependency-review-evidence` artifact,
passes it through a file rather than environment variables, and limits RoboCop's
report to 16 KiB plus summary metadata. Disclose omitted entries; bounded reports
must not change the independent gate's non-success verdict. Missing evidence
fails. Preserve CodeQL scope outputs, full default-branch coverage and RoboCop
baseline evidence; concurrent security-alert closure requires verified final state.

Secret-dependent workflows fail visibly when credentials are unavailable.
RoboCop's short-lived App token reads alerts and authors issue mutations;
`SECURITY_ALERTS_TOKEN` is isolated to personal GitHub Project v2 synchronization.
Keep App IDs/private keys, least-privilege permissions, trigger policy and field
setup documented in `.github/README.md`. Security-alert variables resolve in the
three caller workflows, not local composite metadata; pass explicit model, effort
and token inputs. Run `.github/actions/custom-regressions/security-alert-contract.test.js`
after changes; actual loading acceptance requires fresh controlled dispatches on
corrected main. Preserve applicable bounded malware review and documented
coverage decisions. Maintain CI architecture diagrams and regenerate
`.github/workflows/ci-source-inventory.json` with `python .github/tools/ci_architecture.py` after
workflow edits. Promotion summaries are informational.

Require `CodeQL / Detect CodeQL Scope` and the three `CodeQL / Analyze ...` jobs
listed in `.github/README.md`; do not require the standalone `CodeQL` Code
Scanning results context. Skipped analyzers satisfy checks for documentation-only
PRs; detector/analyzer failures block merging. Main also requires
`AI Code Review / Obi-Wan Code-nobi code review`,
`AI Build Sheriff Review / Lint Eastwood build sheriff review`, and
`AI Security Review / RoboCop security review`. Preserve the existing 14
scanner/lint/test requirements and all other ruleset settings; see
`.github/review-gating-evidence.json`. Run both publisher test files when changing
the reviewer contract. Keep dependency-usage loop fixes coordinated
with #890 and remaining branch-policy work in #656. Batch 2 controls and Python
malware coverage remain documented in `.github/README.md` and
[the Python malware decision](.github/workflows/README.md#python-malware-coverage-limitation).

Security-alert aggregation requires `ROBOCOP_OPENAI_API_KEY`,
`ROBOCOP_PRIVATE_KEY`, `SECURITY_ALERTS_TOKEN`, `ROBOCOP_APP_ID`,
`OPENAI_REVIEWERS_PROJECT_ID` and `SECURITY_ALERTS_PROJECT_ID`, with RoboCop
`Issues: write`, `Code scanning alerts: read` and `Dependabot alerts: read`.
Preserve its fail-closed credential separation and documented field setup.

## 🔑 OpenAI reviewer isolation

Use `OBI_WAN_OPENAI_API_KEY`, `LINT_EASTWOOD_OPENAI_API_KEY`, and
`ROBOCOP_OPENAI_API_KEY` for their respective reviewers; RoboCop also owns
all security-alert model calls. `OPENAI_REVIEWERS_PROJECT_ID` identifies this
repository's reviewer project. Keep credentials separate across repositories
and application environments, preserve visible missing-key failures, and follow
the credential ownership and cutover verification in `.github/README.md`.
Store the three reviewer OpenAI keys and three reviewer App private keys in both
Actions and Dependabot. Keep production, application, SSH and Project-token
secrets outside Dependabot. A human PR smoke test does not prove Dependabot access.

Use `gpt-6-luna` for OpenAI code, build and security reviewers and security-alert
grouping. Preserve each reviewer's key/project isolation, budgets and blocking
gates. Application AI model selection remains app-owned.

## 🔌 MCP integration

Shared MCP framework changes originate in FullStackTemplate's canonical Python
package; synchronize reviewed runtime changes across consumers and record source
commits in the coordinated tracking issue. Derived applications own enablement,
registries, scopes and business tools. Infrastructure supplies ordinary gateway
routing and its optional MCP contract. Preserve existing Notoli credentials,
scopes, tool permissions, connection and exact proxy trust. The retired central
issuer is not a deployment prerequisite. Advertise an app service only after its
own registry, OAuth and readiness checks pass; framework adoption alone does not
authorize activation, client registration, owner consent or plugin installation.

Notoli owns its OAuth issuer, consent, grants and tools. Preserve its existing
connection; the abandoned central issuer migration (#973) is not a prerequisite.
Follow the [app MCP contract](backend/apps/mcp/README.md#framework) and
[tool/listing guide](backend/apps/mcp/README.md#chatgpt).

- MCP review regressions: Connected Apps must include the current user's unexpired grants before token exchange, exclude expired/foreign grants, and deduplicate apps across grants/tokens. Read consent must explicitly disclose owner/collaborator IDs, usernames, and emails. The shared REST/MCP collaborator resolver must reject multiple matching identities before membership or notification writes; never choose a recipient with `.first()`.
- MCP deployment: sync locked production dependencies, apply Django OAuth Toolkit's supplied migrations with `migrate`, and run `python manage.py check --deploy` under production settings. Serve `config.asgi:application` using Uvicorn with `--no-proxy-headers` (one worker for SQLite); WSGI does not serve MCP. Production publishes no frontend or backend host port. The gateway reaches the frontend through `notoli_default`. Only Nginx shares `backend_private` with the backend (`172.30.88.0/29`, Nginx `172.30.88.2`, backend `172.30.88.3`); `backend_egress` is backend-only for outbound email. ASGI accepts forwarded scheme/client only from the configured exact proxy IP, strips all other forwarded metadata, and Django ignores forwarded host/proto headers. If changing the subnet, update IPAM, both fixed IPs, and trusted IP together, then recreate services.
- Register the predefined public ChatGPT OAuth client once: `python manage.py createapplication public authorization-code --client-id notoli-chatgpt --name "Notoli for ChatGPT" --redirect-uris "<exact ChatGPT callback URI>"`. Copy the callback from ChatGPT's management page; use S256 PKCE and token auth method `none`. No client secret, password grant, dynamic registration, or unverified OIDC email claims are exposed. Keep consent enabled (omit `--skip-authorization`), ignore the generated public-client secret, and verify the success message/admin record because toolkit validation errors can exit zero. Existing registrations must be edited explicitly in Django admin.
- MCP product coverage: 31 explicit tools cover boards, lists, items (including board-only items), ordering, membership, sharing, and notifications. `notoli:read` includes board-scoped owner/collaborator discovery; `notoli:write` permits item creation/edits; `notoli:share` permits owner-only collaborator add/remove; `notoli:organize` permits board/list creation/edits, order, and list membership; `notoli:notifications` permits recipient-only activity reads/read flags; `notoli:delete` permits permanent deletion (notification deletion also needs notifications). Sharing covers all lists/items in a board. Delete tools require `confirm: true` after explaining cascade impact; this is a caller assertion, not independent human verification. Arrays are capped at 1000 IDs, and reordering requires the complete current set. Preserve REST validation, owner checks, live membership checks, immutable boards, and notifications via shared services. Existing connections must reconnect for new scopes; refresh cannot escalate. Keep metadata/challenges aligned. No raw HTTP, global user directory, ownership transfer, or credential/admin tools are exposed. Full catalog/evaluations: `backend/apps/mcp/README.md`.
- Browser `GET /auth/mcp/authorize/` redirects to React `/connections/authorize` using `DJANGO_FRONTEND_BASE_URL` and the original query. React reuses the existing JWT login (no second Django session). JSON GET consent and POST ticket/decision require a verified JWT header; signed tickets bind the displayed request to the account for 10 minutes. Allow/Cancel returns Django's validated callback URL. React `/connections` calls JWT-only `GET/POST /auth/mcp/connections/` to list/revoke the current user's tokens and pending grants. Cookies and posted user IDs cannot authorize these endpoints. Keep JWTs out of URLs and retain PKCE/resource/scope checks in Django. Schedule token cleanup only through the approved production maintenance plan; keep access/refresh tokens, consent tickets, and authorization codes out of logs.
- When changing MCP routes or the issuer, review Cloudflare Redirect/WAF/Caching rules for `/mcp`, `/.well-known/*`, and `/auth/mcp/*`: no interactive challenges or path rewriting for MCP/discovery, no caching of authenticated responses, and rate limits for login/token endpoints. Existing DNS and Full (strict) TLS are reused. Details and connection steps: `deploy/production/README.md` and `backend/apps/mcp/README.md`.
- MCP HTTP protocol tests use the directly pinned `httpx2` client in `backend/pyproject.toml`; keep its pin compatible with the MCP SDK and update `backend/uv.lock` with uv.

## 🧩 Repository-specific contracts

- Frontend builds use Vite and tests use Vitest/jsdom. ESLint 10 uses `frontend/eslint.config.mjs` with compatible plugins; do not restore Create React App's ESLint 8 peer graph. `npm run build` includes strict lint, and the frontend CI test gate runs tests plus the production build. Vite explicitly maps the existing `REACT_APP_API_BASE_URL`/`PUBLIC_URL` settings, keeps port 3000 and `build/`, and supports Docker's polling configuration. JSX-bearing source files use `.jsx`. See `frontend/README.md` and `deploy/README.md`.
- Frontend Material UI and icons must use compatible v9 versions. Upgrade them together, use `sx` instead of removed layout system props and `slotProps` for removed component prop APIs, then verify strict lint, tests (including real menu keyboard interaction), and production build. See `frontend/README.md` for frontend checks.
- ChatGPT listing metadata: `backend/apps/mcp/chatgpt/plugin.json` is the canonical branding source, but personal custom-MCP plugins use a separate generated compatibility manifest. Listing updates must preserve the installed plugin identity and registered app mapping; the repository no longer maintains local package or listing builders. Keep account-specific exports/build ZIPs out of Git. Listing publication is separate from Docker deployment and MCP tool refresh. Privacy/terms pages and verified publisher identity remain prerequisites for public submission. See `backend/apps/mcp/README.md`.
- Backend migrations: `uv run --locked --project backend python backend/manage.py makemigrations` then `uv run --locked --project backend python backend/manage.py migrate`
- Backend tests: `cd backend` then `uv run --locked python manage.py test`. Use Django's default test runner; focused tests may override password hashing within their own scope. `DJANGO_TESTING`, command-line inspection, and imported pytest modules do not change normal password hashing.
- Sync the locked environment: `uv sync --locked --project backend`
- Change dependencies with `uv add --project backend` / `uv remove --project backend`; commit `pyproject.toml` and `uv.lock` together.
- Frontend deps: `cd frontend` then `npm install`
- Python versions are selected by `project.requires-python` in `backend/pyproject.toml`. Conda is not required.

Vitest projects isolate pure Node files from VM DOM forks; do not override the configured pool
for timing.

Django-Anymail directly handles Resend delivery. Map the existing host key to
`ANYMAIL.RESEND_API_KEY` only when nonblank, bound the request timeout to
`0 < seconds <= 30` with a 10-second fallback, and keep API debugging disabled.
Operational failures honor `fail_silently`; missing configuration fails during
backend construction. Keep reset responses generic and application logs static,
without exception text/tracebacks or recipient/token data; see the backend README.
