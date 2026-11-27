# AGENTS.md

## Human-First Engineering

This repository is intended to be understood, maintained, and owned by humans. AI-assisted development must not come at the expense of human comprehension.

### Simplicity and Readability

- Prefer simple, explicit, conventional implementations over clever or unnecessarily flexible solutions.
- Follow KISS, YAGNI, and separation of concerns without applying them dogmatically.
- Every abstraction, dependency, helper, and layer of indirection must justify its existence.
- Keep related functionality together. Minimize the number of files a developer must navigate to understand an operation.
- Prefer native framework and standard library functionality over custom implementations.
- Do not introduce abstractions for hypothetical future requirements.
- Prioritize readability over minimizing lines of code.
- Comments should explain why something exists, not restate what the code does.

### Deletion and Consolidation

- Prefer removing unnecessary complexity over introducing additional code to manage it.
- Remove unused imports, functions, files, dependencies, configuration, and obsolete implementation paths when verified safe.
- Maintain a single source of truth for business logic.
- Do not introduce parallel implementations, transitional wrappers, or compatibility layers without a demonstrated requirement.
- Leave modified code simpler or equally understandable whenever reasonably possible.

### Validation and Error Handling

- Address root causes rather than masking symptoms.
- Establish invariants and validate inputs at the appropriate upstream boundaries.
- Do not repeatedly validate conditions that are already guaranteed.
- Avoid speculative defensive checks, unnecessary fallbacks, broad exception handling, and silent failures.
- Unexpected internal failures should surface clearly.
- Preserve necessary security, authorization, data integrity, concurrency, external input validation, and legitimate recovery mechanisms.

### Testing

- Test meaningful, observable behavior rather than implementation details.
- Prefer straightforward tests with realistic inputs and minimal mocking.
- Do not create redundant tests solely to increase coverage.
- Do not weaken meaningful test coverage to make an implementation pass.
- Keep test infrastructure proportional to the complexity of the application.
- Follow established testing conventions.

### Architectural Consistency

- Before changing shared behavior, compare the applicable entry points, callers and failure paths in Notoli, MacroMapper, FullStackTemplate and JudeAndrewAlabaInfrastructure.
- Use FullStackTemplate as the baseline for shared app foundations. Where contracts match, adopt the simplest proven implementation, including improvements found in a product app.
- Keep differences that serve a product, data, lifecycle or operational requirement. Record the concrete reason beside the code or configuration when it would be hard to infer.
- JudeAndrewAlabaInfrastructure owns shared hosting, routing and release contracts. Verify a changed contract in Infrastructure and in every affected app using that app's configuration.

### Scope and Ownership

- Implement what was requested, not what might eventually be requested.
- Avoid unrelated refactoring and speculative improvements.
- Do not introduce new dependencies, architectural layers, or infrastructure without clear justification.
- Preserve existing behavior unless a behavioral change is explicitly intended.
- Flag consequential architectural decisions and uncertain deletions for human review.
- Verify changes using relevant tests, linting, type checks, and builds.

### Final Self-Review

Before completing any change, ask:

- Can this implementation be simpler?
- Is every new abstraction necessary?
- Can a human easily trace the execution flow?
- Am I solving a real problem or a hypothetical one?
- Am I addressing the root cause or masking it?
- Have I introduced unnecessary maintenance overhead?
- Would a human developer reasonably choose this implementation without AI assistance?

If a simpler, equally correct implementation exists, prefer it.



Complexity must be earned. Code is a liability as well as an asset. The objective is not to maximize output, but to deliver reliable functionality with the lowest reasonable maintenance burden.

## 🧭 Ownership and shared rollout

FullStackTemplate owns reusable application engineering and the canonical MCP
Python framework. Infrastructure owns shared ingress, host operations and the
versioned application release engine. Each application owns its domain behavior,
credentials, OAuth issuer, consent, permissions and MCP tools; do not introduce a
shared authorization service, cross-application account mapping or YNAB dependency.

Follow the [shared rollout policy](https://github.com/VanillaIceCube/fullstack-template/blob/main/.github/_README.md#-shared-engineering-ownership-and-rollout)
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

GitHub setup belongs in [.github/_README.md](.github/_README.md), workflow behavior
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

Use the locked Python 3.12 environment and the Node version declared in
`frontend/package.json`. The [backend guide](backend/README.md) covers uv,
migrations and startup. The [frontend guide](frontend/README.md) covers `npm ci`
and Vite. Use Uvicorn for MCP. Django’s development server serves REST and authentication.

Follow the [local Docker guide](deploy/README.md) for hot reload, HTTPS and
dependency changes. Build from the `backend/` and `frontend/` contexts with
their matching Dockerfile ignore files. Create missing local environment and
SQLite files only. Production uses the [app release guide](deploy/production/README.md).

### Codex cloud environment

Use this description in the Codex environment settings:

```text
Notoli
A Notion-inspired list app with a Django REST backend and React frontend. Includes JWT auth, subdomain production routing at notoli.judeandrewalaba.com, Docker/Nginx deployment support, and local setup via uv sync plus npm.
```

Use this setup script in Codex cloud environments:

```bash
set -euo pipefail

cd /board/notoli

python -m pip install uv==0.13.8
uv sync --locked --project backend

cd frontend
npm ci
```

Use the same script as the Codex maintenance script so cached containers refresh backend and frontend dependencies after checkout.

## ⚙️ Configuration

Use the [backend configuration guide](backend/README.md) for Django settings
and the [frontend configuration guide](frontend/README.md) for Vite build inputs.
Keep credentials in the backend environment. Frontend build inputs are public.

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

Vitest loads Testing Library's DOM matchers in `frontend/vite.config.mjs`.
Shared rendering helpers live in `frontend/src/test-helpers/`.
App, startup and feature tests stay beside their implementation. Vitest discovers
`*.test.js` and `*.test.jsx`.

For shared release changes, run `python deploy/production/build_bundle.py --check-parity` and
`python -m unittest discover -s deploy/tests -v` with a disposable local/CI Docker
daemon, plus all applicable consumer suites. Never test against production.

## 🚀 Production

Ordinary changes merge through reviewed `main` before promoting an exact reviewed
source tree through the repository's existing `env-prod` process. Preserve all
required CI, reviews, owner authorization and readiness checks. Explicitly
owner-authorized deployment experiments must return promptly to `main` through
review before the next ordinary promotion. Preserve both histories and newer main
work; never reset or force-push to manufacture parity. Intentional release lag is
allowed while prerequisites or acceptance remain unfinished. History reconciliation
does not authorize deployment, and an absent production branch is not a reason
to create one. Follow the [main-first release policy](https://github.com/VanillaIceCube/fullstack-template/blob/main/.github/_README.md#main-first-releases).

Common release code, verification, tests and workflow are owned by Infrastructure.
Change `deploy/` in Infrastructure, then synchronize all consumers to that exact Git commit. Application repositories track
that source in `shared_source` in `deploy/production/app.json`; never edit only a vendored copy.
Preserve app-specific Compose, network/readiness policy, immutable image digests,
SQLite writer integrity and private pre-migration copies of the database and app
containers. A failed deployment health check takes both app services offline. Keep shared ingress/certificates
and host operations within their separately authorized Infrastructure scope.

Use the [app-only launch guide](deploy/production/README.md).
`deploy/production/app.json` owns the app's intentional network/readiness policy.
Review Infrastructure `gateway/nginx/vhosts/`, Cloudflare DNS/proxy/Redirect/WAF/Caching
settings and allowlist/base-URL variables when domains or routes change.
Keep the active launch bundle private. Avoid host-wide Docker pruning. Cleanup requires the host operator to review disk usage and select unused
app images explicitly. Releases manage only the app's backend/frontend; local
`deploy/compose.yml` and `deploy/nginx.conf` are local/legacy-only.

Preserve branch ownership recorded in
[FullStackTemplate #262](https://github.com/VanillaIceCube/FullStackTemplate/issues/262)
and [Notoli #975](https://github.com/VanillaIceCube/Notoli/issues/975).
Production uses only the app launch procedure; Infrastructure owns
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
      - Tasks use `/api/tasks/` with a `text` field, and list membership uses `tasks`.
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
  - Prefer `VITE_API_BASE_URL=` (blank/unset) so requests resolve to same-origin `/api/...`.
  - If blank handling is not possible in a deploy environment, use `VITE_API_BASE_URL=https://notoli.judeandrewalaba.com`.
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
diffs must fail visibly. The shared diff budget is 2 MB (2,000,000 bytes). Obi-Wan's semver-major
Dependabot brief uses complete primary-source evidence; web search remains limited
to that review path. Run the repository's publisher regression tests and
Actionlint when changing this contract. Where used, the read-only `validate-reviewer-gates.js` audit requires actual
successful reviewer results, including after cancelled or skipped runs.

Dependency Review uses standard input for scanner outputs and limits RoboCop's
report to 16 KiB, including summary metadata. GitHub's native review summary and
workflow logs provide diagnostics. Disclose omitted entries; bounded reports
must not change the independent gate's non-success verdict. Missing evidence
fails. Preserve CodeQL scope outputs, full default-branch coverage and RoboCop
baseline evidence; concurrent security-alert closure requires verified final state.

Secret-dependent workflows fail visibly when credentials are unavailable.
RoboCop's short-lived App token reads alerts and writes repository issues and
native issue fields.
Keep App IDs/private keys, least-privilege permissions, trigger policy and field
setup documented in `.github/_README.md`. Security-alert variables resolve in the
three caller workflows, not local composite metadata; pass explicit model, effort
and token inputs. Run `.github/tests/track-security-alerts.test.js`
after changes; actual loading acceptance requires fresh controlled dispatches on
corrected main. Preserve applicable bounded malware review and documented
coverage decisions. Keep the CI architecture diagrams aligned with workflow edits.

Require `CodeQL / Detect CodeQL Scope` and the three `CodeQL / Analyze ...` jobs
listed in `.github/_README.md`; do not require the standalone `CodeQL` Code
Scanning results context. Skipped analyzers satisfy checks for documentation-only
PRs; detector/analyzer failures block merging. Main also requires
`AI Code Review / Obi-Wan Code-nobi code review`,
`AI Build Sheriff Review / Lint Eastwood build sheriff review`, and
`AI Security Review / RoboCop security review`. Preserve the existing 14
scanner/lint/test requirements and all other ruleset settings. See the
[workflow guide](.github/workflows/README.md) for rule verification and rollout
checks. Run both publisher test files when changing the reviewer contract. Keep
dependency-usage loop fixes coordinated
with #890 and remaining branch-policy work in #656. Batch 2 controls and Python
malware coverage remain documented in `.github/_README.md` and
[malware scan coverage](.github/workflows/README.md#-coverage-boundaries).

Security-alert aggregation requires `ROBOCOP_OPENAI_API_KEY`,
`ROBOCOP_PRIVATE_KEY`, `ROBOCOP_APP_ID`,
and `OPENAI_REVIEWERS_PROJECT_ID`, with RoboCop
`Issues: write`, `Code scanning alerts: read` and `Dependabot alerts: read`.
Preserve visible credential failures and the documented native issue schema.

## 🔑 OpenAI reviewer isolation

Use `OBI_WAN_OPENAI_API_KEY`, `LINT_EASTWOOD_OPENAI_API_KEY`, and
`ROBOCOP_OPENAI_API_KEY` for their respective reviewers; RoboCop also owns
all security-alert model calls. `OPENAI_REVIEWERS_PROJECT_ID` identifies this
repository's reviewer project. Keep credentials separate across repositories
and application environments, preserve visible missing-key failures, and follow
the credential ownership and cutover verification in `.github/_README.md`.
Store the three reviewer OpenAI keys and three reviewer App private keys in both
Actions and Dependabot. Keep production, application and SSH
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
- MCP deployment: keep the reviewed `DJANGO_MCP_ENABLED=1` production policy, sync locked production dependencies, apply Django OAuth Toolkit's supplied migrations with `migrate`, and run `python manage.py check --deploy` under production settings. Serve `config.asgi:application` using Uvicorn with `--no-proxy-headers` (one worker for SQLite); WSGI does not serve MCP. Production publishes no frontend or backend host port. The gateway reaches the frontend through `notoli_default`. Only Nginx shares `backend_private` with the backend (`172.30.88.0/29`, Nginx `172.30.88.2`, backend `172.30.88.3`); `backend_egress` is backend-only for outbound email. ASGI accepts forwarded scheme/client only from the configured exact proxy IP, strips all other forwarded metadata, and Django ignores forwarded host/proto headers. If changing the subnet, update IPAM, both fixed IPs, and trusted IP together, then recreate services.
- With `DJANGO_MCP_ENABLED=1` in the process environment, apply OAuth migrations and register the predefined public ChatGPT OAuth client once: `python manage.py createapplication public authorization-code --client-id notoli-chatgpt --name "Notoli for ChatGPT" --redirect-uris "<exact ChatGPT callback URI>"`. Copy the callback from ChatGPT's management page; use S256 PKCE and token auth method `none`. No client secret, password grant, dynamic registration, or unverified OIDC email claims are exposed. Keep consent enabled (omit `--skip-authorization`), ignore the generated public-client secret, and verify the success message/admin record because toolkit validation errors can exit zero. Existing registrations must be edited explicitly in Django admin.
- MCP product coverage: 32 explicit tools use Board, List, and Task names plus `confirm_change`. Keep the current scopes and server identity. Reject retired names and undeclared arguments. Old request UUIDs stay reserved. Reads are direct. Routine additions, text/status/read-flag edits, additive attachments and complete-set reorders execute directly with a caller-generated request UUID and durable atomic receipt. Adding collaborators executes directly for the board owner with share scope. Only deletions and collaborator removals prepare an exact action; `set_list_tasks` prepares only when it omits an existing membership (the check holds the board lock through dispatch); only the matching app user's JWT decision through the existing Connections approval page may approve it. MCP bearers, cookies and caller booleans cannot approve. Preserve separate read/write/share/organize/notifications/delete scopes and recheck the stored action's actual scopes at confirmation/replay. Bind full target/content/cascade/membership/recipient snapshots, token/client/owner, five-minute expiry, cancellation and one-use consumption; freeze bulk deletion IDs and preserve new arrivals. Keep at most ten pending actions per actor; purge expired private payloads while retaining terminal UUIDs. Replays require fresh grants, original owner/client and current shared-board access for routine domain data; completed deletion receipts survive target removal. Cancel obsolete approvals before any write. No ownership transfer, implicit sharing through edits, raw HTTP, directory or credential/admin tools. Reordering accepts the complete current set, up to 1000 IDs; approval snapshots accept at most 200 entries per collection with no truncation. The `integrations` label is unchanged; its additive `0001_initial` migration creates ActorLock, Confirmation and Execution without changing historical domain migrations. Full contract: `backend/apps/mcp/README.md`.
- Browser `GET /auth/mcp/authorize/` redirects to React `/connections/authorize` using `DJANGO_FRONTEND_BASE_URL` and the original query. React reuses the existing JWT login (no second Django session). JSON GET consent and POST ticket/decision require a verified JWT header; signed tickets bind the displayed request to the account for 10 minutes. Allow/Cancel returns Django's validated callback URL. React `/connections` calls JWT-only `GET/POST /auth/mcp/connections/` to list/revoke the current user's tokens and pending grants. Cookies and posted user IDs cannot authorize these endpoints. Keep JWTs out of URLs and retain PKCE/resource/scope checks in Django. Schedule token cleanup only through the approved production maintenance plan; keep access/refresh tokens, consent tickets, and authorization codes out of logs.
- When changing MCP routes or the issuer, review Cloudflare Redirect/WAF/Caching rules for `/mcp`, `/.well-known/*`, and `/auth/mcp/*`: no interactive challenges or path rewriting for MCP/discovery, no caching of authenticated responses, and rate limits for login/token endpoints. Existing DNS and Full (strict) TLS are reused. Details and connection steps: `deploy/production/README.md` and `backend/apps/mcp/README.md`.
- MCP HTTP protocol tests use the directly pinned `httpx2` client in `backend/pyproject.toml`; keep its pin compatible with the MCP SDK and update `backend/uv.lock` with uv.

## 🧩 Repository-specific contracts

- Frontend builds use Vite and tests use Vitest/jsdom. ESLint 10 uses `frontend/eslint.config.mjs` with compatible plugins; do not restore Create React App's ESLint 8 peer graph. `npm run build` includes strict lint, and the frontend CI test gate runs tests plus the production build. Vite uses `VITE_API_BASE_URL` and `import.meta.env.BASE_URL`, keeps port 3000 and `dist/`, and supports Docker's polling configuration. JSX-bearing source files use `.jsx`. See `frontend/README.md` and `deploy/README.md`.
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
