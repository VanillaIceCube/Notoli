# 🎨 Frontend (React)

Production release ownership: use the [app-only release/recovery guide](../deploy/production/README.md).

The Notoli frontend is a Vite single-page app with React Router and Material UI.
Vitest and jsdom run the existing tests; ESLint 10 uses
`eslint.config.mjs` and compatible React, hooks, accessibility, and Testing Library
plugins. Create React App and its incompatible ESLint 8 peer graph are removed.

Material UI and its icons use the compatible v9 package family. Upgrade them
together and regenerate the lockfile; isolated major bumps fail peer resolution.
Use `sx` for layout system props and `slotProps` for component slots, including
checkbox input labels. Supported browser minimums are Chrome 117, Edge 121,
Firefox 121, and Safari 17. The migration follows MacroMapper PRs #103 and #130.

UI styling conventions live in [`STYLE_GUIDE.md`](STYLE_GUIDE.md).

## 🧭 App Routes

- `/` redirects authenticated users to their first board when one exists
- `/board/:boardId` shows lists for a board
- `/board/:boardId/list/:listId` shows notes for a list
- Public auth routes: `/login`, `/register`, `/forgot-password`, `/reset-password?uid=<...>&token=<...>`
- `/connections/authorize` displays OAuth consent for a pending application request
- `/connections` lists and revokes Connected Apps (also available in the profile menu)
- Everything else requires auth

Navigation utilities accept `/board/` and `/boards/` inputs, strip query strings,
fragments, and a trailing slash, and ignore invalid paths or navigators. Public
React routes and generated links use `/board/`; `/boards/` is a helper input
compatibility form, not an additional React route.

ChatGPT's authorization URL remains Django's `/auth/mcp/authorize/`, which
redirects the browser to React's `/connections/authorize` with the original
query. Users with JWTs go directly to consent. Signed-out users sign in through
the existing `/login?next=<encoded connection path>` and return to consent
instead of the board landing. Return paths are limited to the two connection
routes; external URLs cannot become login redirects. React shows application
name, client ID, account, requested permissions, and **Allow** / **Cancel**.
The optional sharing permission explicitly grants collaborator management on
owned boards and access to every list/item in those boards. Existing connections
must reconnect to approve new permissions. Organization, notification management,
and permanent deletion have separate permission descriptions. The generic consent
UI displays every requested permission from Django without changing the login flow.
Deletion consent describes accessible list/item deletion, owned board cascades, and
notification removal; clients must also confirm each requested deletion's impact.

`connectionsClient` uses explicit JWT headers and `credentials: omit` for
Django's JSON consent and connection-management endpoints. Django issues a
signed consent ticket; React posts only that ticket and the selected decision,
then follows Django's validated OAuth callback. OAuth tokens, PKCE validation,
resource binding, and permission enforcement stay in Django. Revocation removes
the current user's access/refresh tokens and pending codes. Connected Apps also lists
applications with only an unexpired pending code, so **Revoke** works before token
exchange. Read consent names the board owner/collaborator IDs, usernames, and email
addresses that the app can access. There is no separate
Django session login, and JWTs never travel through OAuth URLs. MCP item results link
back to `/board/:boardId/list/:listId`. See the
[plugin connection instructions](../plugins/notoli/README.md).

Authentication tokens are stored in `sessionStorage` (`accessToken` and `refreshToken`).
The request client retries a `401` once after refreshing an expired access token.
Invalid refresh credentials clear stored tokens and redirect to `/login` with an
error snackbar; temporary refresh failures retain the session. Connection
requests preserve their pending path/query through reauthentication, including
when a refreshed JWT is also rejected. Ordinary login still lands on the preferred board.
Auth endpoints (`/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`) do not trigger the global 401 logout redirect.

## 🌐 Subdomain Hosting (`notoli.judeandrewalaba.com`)

Production is hosted at the subdomain root:

- `https://notoli.judeandrewalaba.com`

Backend routes also use the subdomain root (`/api/`, `/auth/`, `/admin/`, and
`/mcp`); no backend deployment path prefix is configured.

Important pieces:

- `index.html` is Vite's entry point; production assets resolve from `/`.
- `src/App.jsx` uses `process.env.PUBLIC_URL` as the React Router basename, which is empty for the subdomain build. `vite.config.mjs` explicitly exposes only `PUBLIC_URL` and `REACT_APP_API_BASE_URL`; it does not expose the shell environment.
- Vite keeps the existing `build/` output directory and `REACT_APP_API_BASE_URL` build argument. An unset API base defaults to same-origin requests in production and localhost port 8000 in development; an explicit blank also uses same-origin requests.
- The container's Nginx config (`frontend/nginx.conf`) serves `index.html` for deep links (`try_files ... /index.html`).

## 🤝 Board Sharing

Board management lives in the right sidebar. Open the Board list, use a board row's action menu, and choose Share. The Share dialog displays the board owner and collaborators. Owners can add collaborators by username/email and remove collaborators; non-owners can view access in read-only mode.

## Notes Checklist Items

Notes in a list render as checklist rows. Checking a note updates its `status` to `Complete` through the notes API, immediately reflects the change in the UI, and shows complete note text with a strikethrough. Unchecked notes use `Not Started`, and the API also supports `In Progress`.

## In-App Notifications

The app bar notification icon opens a popover with the newest notifications first. Unread notifications show a badge count and can be marked read all at once. Clicking a notification opens its target board or list when the backend provides `target_path`, and each notification can be cleared individually. Notification API failures are shown inside the popover and do not block the rest of the page.

## Drag-and-Drop Reordering

List and note pages include a top-right page action menu for entering reorder mode. Reorder mode hides row action menus, shows right-side drag handles, hides Add New, and exits through Done. Dragging only starts from the handle and persists the final order through the reorder API after drop.

## 🔌 API Base URL

API calls go through `src/services/notoliApiClient.js` (endpoints) via `src/services/requestClient.js` (request wrapper).

- `REACT_APP_API_BASE_URL` is used as a prefix for all backend requests.
- Default is `http://localhost:8000` for local dev when `REACT_APP_API_BASE_URL` is unset.
- In production, leave `REACT_APP_API_BASE_URL` blank/unset so calls use relative paths like `/api/...` on `https://notoli.judeandrewalaba.com`.
- If an absolute URL is required, set `REACT_APP_API_BASE_URL=https://notoli.judeandrewalaba.com`.
- Reorder calls use `PATCH /api/lists/reorder/` for board-scoped list order and `PATCH /api/notes/reorder/` for list-scoped note order.
- Notification calls use `GET /api/notifications/`, `PATCH` or `DELETE /api/notifications/<id>/`, `PATCH /api/notifications/mark-all-read/`, and `DELETE /api/notifications/clear-all/`.

Note: in the Docker image, `REACT_APP_API_BASE_URL` is a build-time value (it's baked into the static build).

## 💻 Local Development

From the repo root (full setup lives in [`AGENTS.md`](../AGENTS.md)):

```bash
cd frontend
npm install
npm start
```

## Docker hot reload

From the repository root:

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml up --build -d
```

The development image uses `Dockerfile.dev`, mounts `frontend/`, and keeps
`node_modules` in a Docker volume. React watches the mounted source and reloads
without rebuilding the production image. Open `http://notoli.localhost:3000`;
the development API runs at `http://notoli.localhost:8000`. Both ports are
localhost-only by default and can be changed with the `NOTOLI_DEV_*_PORT`
variables in `deploy/.env`.

At container start, the development entrypoint compares `package.json` and
`package-lock.json` with the dependencies in its Docker volume and runs
`npm ci` when they differ. After changing either file, restart the frontend:

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml restart frontend
```

## 🧰 Useful Commands

```bash
cd frontend
npm test
npm run build
npm run lint
npm run format
```

`npm start` runs Vite on port 3000. `npm run build` first runs strict lint,
then generates `build/` for the existing Nginx image. CI runs both the full
Vitest suite and this production build. JSX-bearing source files use `.jsx`;
extensionless imports continue to resolve normally. Local `.env` API settings
are loaded by Vite, and Docker's `HOST`/`CHOKIDAR_USEPOLLING` settings retain
the existing development bind and polling behavior.

## 🧱 Node Version

CI reads the Node version from `frontend/package.json` (`engines.node`).

## 🔌 Shared MCP framework

See [the MCP framework guide](../docs/MCP-FRAMEWORK.md). Optional consent and Connected Apps routes require `VITE_MCP_ENABLED=1` in the template/MacroMapper; Notoli keeps its existing enabled UI. Preserve JWT-only consent and validated connection return paths.

## 🔒 Transitive dependency maintenance

The frontend temporarily overrides `minimatch@>=9 <11.0.1` to `^11.0.1` for
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
ESLint, its config-array, the JSX accessibility plugin and typescript-estree
still request older majors; upgrading ESLint alone does not remove the advisory.
The lockfile resolves minimatch 11.0.4. These are build/lint dependencies, not
browser globbing APIs. Keep the version selector scoped to the affected modern
API family; do not apply it to legacy callable minimatch 3 consumers.

Minimatch 11 removes `makeRe`, `AST` and internal matcher methods. The current
parents use the retained matching API. Validate a clean `npm ci`, `npm ls
minimatch glob --all`, strict lint, tests and the production build whenever a
parent or override changes. Review upstream API changes before widening the
selector. Remove overrides once all parent ranges natively accept patched
versions, regenerate the lockfile and repeat those checks. Canonical rollout:
[FullStackTemplate #267](https://github.com/VanillaIceCube/FullStackTemplate/issues/267).

Notoli also overrides `glob@>=9 <14.0.2` to `^14.0.2` for
[GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4).
Jest/Babel and their glob/deepmerge test-only graph were removed by the Vitest migration. Keep lockfile updates coupled to supported lint/test dependencies.

## Authentication and notification reliability

All four authentication forms disable submission while requests are pending and
restore it after failure. New sessions trim profile strings and remove absent or
blank username/email fields. The request client normalizes object, tuple-array
and native `Headers` inputs, preserves custom headers on one JWT refresh/retry,
and attaches the stored access token when explicit Authorization is absent
outside public auth forms. Invalid refresh credentials clear tokens/profile;
transient refresh failures preserve the session. Existing consent return paths
remain application-specific.

Notifications expose Retry and retain failed actions. Item/bulk controls disable
overlapping actions through response parsing. Failed/malformed mark-read responses
keep the inbox open instead of navigating. See [the audit](../docs/AUTH-PARITY.md).

## Development dependency reproducibility

Development images pin reviewed multi-platform Node 26 and Miniforge 26.9.4-0
registry digests. Production Dockerfiles and the independent release engine are
unchanged by this development-image policy. Refresh tags/digests together after
registry verification and a disposable build/configuration check.

The frontend development entrypoint hashes both `package.json` and
`package-lock.json` inside its persistent `node_modules` volume. Fresh volumes
install with `npm ci`; unchanged restarts reuse dependencies; changing either
manifest reinstalls. Missing manifests or a failed installation stop startup and
retry on the next invocation. Use one volume per checkout and restart after edits.
Run `node --test tests/dev-dependencies.test.cjs` from the repository root for the
credential-free mocked lifecycle/exit-status regression. Compose configuration
checks do not deploy or touch application data.

## Vitest and React Router acceptance

`npm test` runs all existing frontend assertions in Vitest 5/jsdom. JSX test files
use `.jsx`, mocks use the runner's native ESM API, and Jest/Babel test-only packages
are removed. This eliminates Jest's unpatched deepmerge path and allows supported
React Router 7.18.5 (both reported Router advisories are fixed in >=7.18.0).
Vite development/build was already present; its `build/` output and legacy
`REACT_APP_API_BASE_URL` behavior are retained. No SSR server is used here.

Use `npm ci`, `npm run lint:strict`, `npm run format:check`, `npm test`, and
`npm run build` from frontend. CI bounds test workers to two; use
`npm test -- --maxWorkers=1 --reporter=json --outputFile=vitest-results.json`
for serial profiling. Keep isolated test environments and every domain/auth
assertion. The ESLint configuration regression now imports ESLint directly in a
Node test environment instead of launching a second Node runtime.

The supported-runtime VM comparison (Node 24.22.2, npm 11.19.1, 0.75 CPU,
768 MiB, 512 MiB V8 heap, cold caches, network disabled during tests) measured
Jest at 63.391s (65.044s container wall) before and the initial unoptimized
Vitest migration at 151.839s (154.103s container wall). Both passed all 301
tests; this initial migration was 137% slower, not a performance improvement.
Dependency installs were separate: 36.021s versus 33.019s. Final tuned
measurements are recorded in docs/BATCH2-PARITY.md when independently verified.
Backend Django time was 24.256s before and 25.723s after (190 tests, one existing
skip); no backend speedup is claimed. The existing test-scoped fast password
hasher remains. Settings subprocess and MCP protocol tests retain their useful
integration coverage rather than being skipped to improve timing.

The tuned configuration uses native forks for six non-DOM files and fresh
VM fork environments for DOM tests, recycling at 384 MiB. UI dependencies are
prebundled, test environments remain isolated, and form validation/API fixtures
use bulk changes while happy paths retain typed interaction. The shared browser
suite also exercises real typing/filling. Use the configured projects without
overriding `--pool`; `--maxWorkers=1` provides comparable serial profiling.

The browser foundation observed a pre-existing route render loop (maximum update
depth in `NotepadRoutes`/`onPageReady`). The same registration/session journey
passes and emits the same warning on exact pre-change 7f1db4c. This task does not
refactor product UI; authentication/board browser assertions remain active.

Supported test/build runtimes are Node24.15+ within24.x or Node26.x. jsdom30 explicitly excludes the end-of-life Node25 line; do not treat >=24 as universal support. Use the same supported runtime for before/after timings.

## Optional isolated browser tests

Install the backend requirements in an activated Python environment, then from
`frontend` run the following with Node 24.15+ within 24.x or Node 26.x:

```powershell
npm ci
npx playwright install chromium
npm run test:e2e
```

Linux CI uses `npx playwright install --with-deps chromium`. The wrapper creates
a marked temporary directory, starts fresh Django/SQLite on 127.0.0.1:8001 and
Vite on 127.0.0.1:3001, and removes only its generated state after both servers
stop. Those ports must be free; existing servers are never reused. The backend
does not load developer `.env` files, uses synthetic users, disables MCP, and
writes reset messages to the temporary mail directory. No SMTP or model calls
are made. Registration, reload/session isolation, logout/protected routing, bad
credentials, expired access and valid/invalid password-reset tokens are covered.

There is one Chromium worker, no retries, and a ten-minute global timeout. Local
runs of the three shared journeys take roughly one minute after installation;
CI also pays Python/npm/browser installation cost. Failure traces/screenshots
and the HTML report are local in `test-results/` and `playwright-report/`. CI
retains at most 20 MiB/file and 50 MiB/run for seven days, listing omitted files
in `browser-evidence/INDEX.txt`; full text remains in the job log. Reports may
contain disposable test tokens and should not be copied into public issues.

Add product journeys under `e2e/` using these isolated users and existing APIs.
Keep authentication journeys shared; domain fixtures belong to their app. Do not
add real customer accounts, external email or paid-model requests. Infrastructure
has no browser application and retains its ingress/Docker protocol suites.
