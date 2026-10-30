# AGENTS.md

Production release ownership: use the [app-only release/recovery guide](deploy/production/README.md).
Common release code/tests and workflow stages are pinned to the Infrastructure
release standard. Update the shared source, then synchronize both applications;
CI's parity check rejects independent vendor edits. App policy lives in
`deploy/production/app.json`; preserve its intentional network/readiness differences.

Branch ownership: follow the main-first policy in
[FullStackTemplate #262](https://github.com/VanillaIceCube/FullStackTemplate/issues/262)
and [Notoli #975](https://github.com/VanillaIceCube/Notoli/issues/975).
Implement and review source through PRs targeting `main`, then promote its exact reviewed source
through an `env-prod` PR with existing review and CI gates. Exceptional deployment
iteration requires explicit owner authorization and must return promptly through
a reviewed `main` PR before the next promotion. History reconciliation alone
does not authorize deployment: hold the central OAuth cutover under
[#973](https://github.com/VanillaIceCube/Notoli/issues/973) until its acceptance
and operator checkpoints are complete. Intentional release lag is not source drift.


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

GitHub security-alert aggregation: The daily/manual CodeQL and Dependabot aggregation workflows require the `ROBOCOP_OPENAI_API_KEY`, `ROBOCOP_PRIVATE_KEY`, and `SECURITY_ALERTS_TOKEN` secrets; the `ROBOCOP_APP_ID`, `OPENAI_REVIEWERS_PROJECT_ID`, and `SECURITY_ALERTS_PROJECT_ID` repository variables; and a RoboCop installation with `Issues: write`, `Code scanning alerts: read`, and `Dependabot alerts: read`. RoboCop's short-lived token reads alerts and authors every issue mutation, while `SECURITY_ALERTS_TOKEN` is isolated to personal GitHub Project v2 synchronization. Keep their field/permission setup and fail-closed credential separation documented in `.github/README-WORKFLOWS.md` when changing these workflows.

GitHub AI PR reviews: The three persona workflows require `OBI_WAN_OPENAI_API_KEY`, `LINT_EASTWOOD_OPENAI_API_KEY`, `ROBOCOP_OPENAI_API_KEY`, `OPENAI_REVIEWERS_PROJECT_ID`, and separate GitHub App credentials for RoboCop, Lint Eastwood, and Obi-Wan Code-nobi. Keep the app IDs, private-key secrets, permissions, trigger policy, and failure behavior documented in `.github/README-WORKFLOWS.md` when changing these workflows.

GitHub Dependabot reviews: All three personas run for same-repository Dependabot PRs; forks remain excluded and Dependabot lint auto-fixes remain disabled. Store `OBI_WAN_OPENAI_API_KEY`, `LINT_EASTWOOD_OPENAI_API_KEY`, `ROBOCOP_OPENAI_API_KEY`, and the three reviewer private-key secrets in both Actions and Dependabot. Semver-major updates require Obi-Wan's complete, primary-source major-upgrade brief; web search is enabled only for that review type. Preserve visible failures for missing credentials, incomplete briefs, request-changes verdicts, and oversized diffs for every persona. The shared diff budget is 512 KiB, matching MacroMapper; keep dependency-usage loop fixes coordinated with #890. See `.github/README-WORKFLOWS.md` for evidence limits and the remaining branch-policy work in #656.

GitHub branch protection: Require `CodeQL / Detect CodeQL Scope` and the three `CodeQL / Analyze ...` jobs listed in `.github/README-WORKFLOWS.md`. Do not require the standalone `CodeQL` Code Scanning results context: documentation-only PRs skip all analyzers and never emit it. Preserve the scope and analyzer requirements when editing or recreating the main ruleset; skipped analyzer jobs satisfy required checks, while detector or analyzer failures block merging.

GitHub AI merge gates: Main also requires `AI Code Review / Obi-Wan Code-nobi code review`, `AI Build Sheriff Review / Lint Eastwood build sheriff review`, and `AI Security Review / RoboCop security review`. Preserve the existing 14 scanner/lint/test requirements and all other ruleset settings. Reviewer `REQUEST_CHANGES` and unavailable/invalid output fail; valid `APPROVE`/`COMMENT` pass. Keep same-repository human/Dependabot eligibility and fork secret isolation; run both publisher test files and Actionlint after workflow changes. The read-only `verify-gates.js` audit requires actual successful reviewer results, including after cancelled or skipped runs. See `.github/README-WORKFLOWS.md` and `.github/review-gating-evidence.json`.

GitHub dependency-review evidence: Keep full dependency-change JSON in the `dependency-review-evidence` artifact, pass it through a file instead of environment variables, and bound the report sent to RoboCop to 16 KiB plus summary metadata. Large lockfile migrations can exceed Linux's per-environment-variable limit. The independent gate must still fail for every non-success review outcome; report truncation must disclose omitted entries and never change the verdict.

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
- Production gateway/vhosts: the Infrastructure repository; `deploy/nginx-proxy.conf` is local/legacy-only.
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
   - `DJANGO_SECRET_KEY` (required when `DJANGO_DEBUG=0`; debug runs generate a temporary random key if unset/blank, so set a stable local key to retain sessions across restarts)
   - `DJANGO_DEBUG` (default: `1`)
   - `DJANGO_SQLITE_PATH` (default: `backend/db.sqlite3`)
   - `DJANGO_ALLOWED_HOSTS` (comma-separated)
   - `DJANGO_CORS_ALLOWED_ORIGINS` (comma-separated)
   - `DJANGO_CSRF_TRUSTED_ORIGINS` (comma-separated)
   - `DJANGO_FRONTEND_BASE_URL` (default: `http://localhost:3000`; used in password-reset email links)
   - `DJANGO_MCP_BASE_URL` (origin only, no path; defaults to `http://localhost:8000` in debug or `https://notoli.judeandrewalaba.com` in production; OAuth issuer and MCP resource base)
   - `DJANGO_MCP_AUTH_MODE` (`legacy` locally by default; `central` requires the fixed production Notoli resource origin)
   - `MCP_INTROSPECTION_CLIENT_SECRET` (required centrally; dedicated Notoli-only introspection credential delivered privately)
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
- Navigation utilities accept `/board/` and `/boards/` inputs, strip query/fragment suffixes and a trailing slash, and ignore invalid paths or navigators. Public React routes and generated links use singular `/board/`; helper compatibility does not add a plural route.
- Cloudflare, certificate and gateway changes belong to the separately approved
  Infrastructure operator plan; see the [production guide](deploy/production/README.md#chatgpt-mcp-deployment).
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
- The gateway's audited existing `macromapper-ingress` peer is `172.20.0.3`; record it in app-owned `gateway.addresses` without migrating addresses or network IDs. It is not a Notoli trusted proxy: `DJANGO_TRUSTED_PROXY_IPS` remains exactly `172.30.88.2`.
- Central MCP release preflight expects the accepted five-network gateway baseline: existing three route networks plus internal `ynab_mcp_private`/`172.30.89.2` and `mcp_auth_private`/`172.30.92.2`. Notoli's own memberships and exact `172.30.88.2` trust stay unchanged; Notoli never joins the new networks. Original three-network legacy bundle recovery requires root's explicit disabled YNAB/auth profiles and verified matching gateway baseline first, retaining 410 hostnames and network objects; never implicitly revert exposed routes to `base`. Shared fixture/address assertions must be updated canonically in Infrastructure and synchronized; see the migration plan.
- Central MCP migration #973: `DJANGO_MCP_AUTH_MODE=legacy|central` defaults to legacy locally; production app policy fixes central. Fixed issuer is `https://auth.judeandrewalaba.com`, resource remains Notoli `/mcp`, clients are `notoli-chatgpt`/`notoli-codex`, and `notoli-introspection` uses the Actions secret `MCP_INTROSPECTION_CLIENT_SECRET` through existing private `.backend.env`. It is introspection-only for Notoli; privileged host/Docker access can expose it. Do not add mounts or independently edit shared release/framework code. Bounded uncached TLS introspection and explicit `MCPIdentityLink` issuer/UUID-to-existing-user links recheck grants, active users and local permissions each operation; never infer email identity or create accounts. Central mode disables local issuance/registration and links Connected Apps to issuer grant management; normal app login/REST JWTs stay unchanged. Retain local grants for deliberate retirement, and invalidate them before legacy rollback so central revocation cannot silently reactivate them. Source work may proceed in parallel; `env-prod` is the live cutover and waits for actual YNAB acceptance in both clients and the Infrastructure root checkpoint. See `deploy/production/central-mcp.md`; no live operation or listing publication follows from source review.
- Deployments must not run host-wide Docker pruning. Retain prior release images for rollback; cleanup requires a host operator to review disk usage and explicitly select unused app images. Production releases use immutable digests and manage only Notoli's backend/frontend through `deploy/production/release.py`. Shared ingress/certificates belong to the infrastructure repository under approved architecture v2. See `deploy/production/README.md` and `.github/README-WORKFLOWS.md`.
- Frontend builds use Vite and tests use standalone Jest/Babel. ESLint 10 uses `frontend/eslint.config.mjs` with compatible plugins; do not restore Create React App's ESLint 8 peer graph. `npm run build` includes strict lint, and the frontend CI test gate runs tests plus the production build. Vite explicitly maps the existing `REACT_APP_API_BASE_URL`/`PUBLIC_URL` settings, keeps port 3000 and `build/`, and supports Docker's polling configuration. JSX-bearing source files use `.jsx`. See `frontend/README.md` and `deploy/README.md`.
- Frontend Material UI and icons must use compatible v9 versions. Upgrade them together, use `sx` instead of removed layout system props and `slotProps` for removed component prop APIs, then verify strict lint, tests (including real menu keyboard interaction), and production build. See `frontend/README.md` for the browser baseline.
- ChatGPT listing metadata: `plugins/notoli/plugin.json` is the canonical branding source, but personal custom-MCP plugins use a separate generated compatibility manifest. Download the installed plugin ZIP and use `plugins/notoli/build_listing.py` to apply branding while preserving its exported name and `.app.json`; upload a new version to the same plugin. Keep account-specific exports/build ZIPs out of Git. Listing publication is separate from Docker deployment and MCP tool refresh. Privacy/terms pages and verified publisher identity remain prerequisites for public submission. See `plugins/notoli/README.md`.
- MCP review regressions: Connected Apps must include the current user's unexpired grants before token exchange, exclude expired/foreign grants, and deduplicate apps across grants/tokens. Read consent must explicitly disclose owner/collaborator IDs, usernames, and emails. The shared REST/MCP collaborator resolver must reject multiple matching identities before membership or notification writes; never choose a recipient with `.first()`.
- MCP deployment: install requirements, apply Django OAuth Toolkit's supplied migrations with `migrate`, and run `python manage.py check --deploy` under production settings. Serve `app.asgi:application` using Uvicorn with `--no-proxy-headers` (one worker for SQLite); WSGI does not serve MCP. Production publishes no backend port. Only Nginx shares `backend_private` with the backend (`172.30.88.0/29`, Nginx `172.30.88.2`, backend `172.30.88.3`); `backend_egress` is backend-only for outbound email. ASGI accepts forwarded scheme/client only from the configured exact proxy IP, strips all other forwarded metadata, and Django ignores forwarded host/proto headers. If changing the subnet, update IPAM, both fixed IPs, and trusted IP together, then recreate services.
- Register the predefined public ChatGPT OAuth client once: `python manage.py register_mcp_client --redirect-uri "<exact ChatGPT callback URI>"`. Copy the callback from ChatGPT's management page; use S256 PKCE and token auth method `none`. No client secret, password grant, dynamic registration, or unverified OIDC email claims are exposed. Existing registrations must be edited explicitly in Django admin.
- MCP product coverage: 31 explicit tools cover boards, lists, items (including board-only items), ordering, membership, sharing, and notifications. `notoli:read` includes board-scoped owner/collaborator discovery; `notoli:write` permits item creation/edits; `notoli:share` permits owner-only collaborator add/remove; `notoli:organize` permits board/list creation/edits, order, and list membership; `notoli:notifications` permits recipient-only activity reads/read flags; `notoli:delete` permits permanent deletion (notification deletion also needs notifications). Sharing covers all lists/items in a board. Delete tools require `confirm: true` after explaining cascade impact; this is a caller assertion, not independent human verification. Arrays are capped at 1000 IDs, and reordering requires the complete current set. Preserve REST validation, owner checks, live membership checks, immutable boards, and notifications via shared services. Existing connections must reconnect for new scopes; refresh cannot escalate. Keep metadata/challenges aligned. No raw HTTP, global user directory, ownership transfer, or credential/admin tools are exposed. Full catalog/evaluations: `plugins/notoli/README.md`.
- Browser `GET /auth/mcp/authorize/` redirects to React `/connections/authorize` using `DJANGO_FRONTEND_BASE_URL` and the original query. React reuses the existing JWT login (no second Django session). JSON GET consent and POST ticket/decision require a verified JWT header; signed tickets bind the displayed request to the account for 10 minutes. Allow/Cancel returns Django's validated callback URL. React `/connections` calls JWT-only `GET/POST /auth/mcp/connections/` to list/revoke the current user's tokens and pending grants. Cookies and posted user IDs cannot authorize these endpoints. Keep JWTs out of URLs and retain PKCE/resource/scope checks in Django. Schedule token cleanup only through the approved production maintenance plan; keep access/refresh tokens, consent tickets, and authorization codes out of logs.
- When changing MCP routes or the issuer, review Cloudflare Redirect/WAF/Caching rules for `/mcp`, `/.well-known/*`, and `/auth/mcp/*`: no interactive challenges or path rewriting for MCP/discovery, no caching of authenticated responses, and rate limits for login/token endpoints. Existing DNS and Full (strict) TLS are reused. Details and connection steps: `deploy/production/README.md` and `plugins/notoli/README.md`.
- Backend migrations: `python backend/manage.py makemigrations` then `python backend/manage.py migrate`
- Backend tests: `cd backend` then `python manage.py test`. The configured Django test runner scopes the fast password hasher to the test run and restores settings on exit; `DJANGO_TESTING`, command-line inspection, and imported pytest modules do not change normal password hashing.
- Update Conda env: `conda env update --file backend/environment.yml --prune`
- Regenerate Conda env + requirements:
  - `python backend/environment_manager.py export -o backend/environment.yml`
- Frontend deps: `cd frontend` then `npm install`
- Note: pip dependencies are installed via the `pip:` section in `environment.yml`
  and resolved from `requirements.txt` (never via conda).
- MCP HTTP protocol tests use the directly pinned `httpx2` client in `backend/requirements.txt`; keep its pin compatible with the MCP SDK and update the Conda environment through the existing pip requirements path.

External GitHub Actions use immutable commit SHAs with version comments.
Keep that convention when updating workflows or composite actions; preserve
review/scanner failure gates and do not treat action updates as deployment approval.

## Jules recurring agents

Nora and Marty use the [v3 operating rules](.jules/README.md): at most one open
PR per agent per repository. Repeat runs maintain the existing PR, integrate
current main, and verify its latest head instead of opening another PR.

## 🔑 OpenAI reviewer isolation

Use `OBI_WAN_OPENAI_API_KEY`, `LINT_EASTWOOD_OPENAI_API_KEY`, and
`ROBOCOP_OPENAI_API_KEY` for their respective reviewers; RoboCop also owns
all security-alert model calls. `OPENAI_REVIEWERS_PROJECT_ID` identifies this repository's
reviewer project. Keep credentials separate across repositories and application
environments, preserve visible missing-key failures, and follow the deferred
cutover steps in `.github/README-WORKFLOWS.md`.


## 🔌 Shared MCP framework

MCP framework changes follow [docs/MCP-FRAMEWORK.md](docs/MCP-FRAMEWORK.md). FullStackTemplate owns the canonical Python package; keep all consumer hashes/pins aligned. MacroMapper stays disabled without business tools. Preserve Notoli credentials, scopes, tool permissions and exact proxy trust.

Dependency-review and alert-lifecycle behavior follows the shared parity contract in
`.github/README-WORKFLOWS.md`: missing evidence fails, reports stay bounded, and
concurrent closure requires verified final state. Keep CodeQL scope outputs and
RoboCop baseline evidence connected without changing full default-branch coverage.
