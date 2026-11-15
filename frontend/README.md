# 🎨 Notoli frontend

The React application uses Vite and Material UI for pages, navigation,
authentication, and the application shell.

## 🧭 Structure

- `src/components/`: reusable interface components.
- `src/pages/`: application pages and routes.
- `src/services/`: API requests and session handling.
- `src/__tests__/`, `e2e/`: component and isolated browser tests.

## 💻 Local development

Use Node.js 24.15+ within 24.x or Node.js 26.x, matching `package.json`.
From the repository root:

```powershell
Set-Location frontend
npm ci
npm start
```

Open `http://notoli.localhost:3000`. For Docker hot reload, follow the
[deployment guide](../deploy/README.md).

## ⚙️ Configuration

`REACT_APP_API_BASE_URL` controls the API origin. Leave it blank for production same-origin
requests; client-side settings must contain no secrets. The build output is
`build/`.

An unset API origin defaults to localhost:8000 during development and same-origin
in production; an explicit blank uses same-origin. Vite retains `PUBLIC_URL` as
the router/asset base and exposes only those legacy client variables. Production
uses subdomain-root routing and Nginx's SPA fallback for deep links.

## 🗺️ Routes and behavior

- `/` redirects authenticated users to their first board when one exists
- `/board/:boardId` shows lists for a board
- `/board/:boardId/list/:listId` shows notes for a list
- Public auth routes: `/login`, `/register`, `/forgot-password`, `/reset-password?uid=<...>&token=<...>`
- `/connections/authorize` displays OAuth consent for a pending application request
- `/connections` lists and revokes Connected Apps (also available in the profile menu)
- Everything else requires auth

Authentication-page navigation uses Material UI `Link` with React Router `Link`,
so each destination has a real `href`, Tab/Enter access, and native new-tab
behavior without submitting its form. Regression tests cover all five links
with the real router; browser tests also check new-tab navigation.

Navigation utilities accept `/board/` and `/boards/` inputs, strip query strings,
fragments, and a trailing slash, and ignore invalid paths or navigators. Public
React routes and generated links use `/board/`; `/boards/` is a helper input
compatibility form, not an additional React route.

## 🔐 Sessions and connections

Authentication forms disable submission while pending. Tokens and profile data
live in `sessionStorage`; new sessions trim profile fields and clear absent values.
Protected requests use the stored JWT when the caller omits Authorization.
Public authentication forms do not receive an injected access token.

The request wrapper preserves object, tuple-array, and native `Headers` values
through one JWT refresh/retry. Invalid refresh credentials clear the session;
temporary refresh failures retain it. Notification failures keep actions available
for Retry, and malformed mark-read responses must not navigate away.
Use semantic links for destinations and buttons for actions, with keyboard and
native new-tab coverage.

Ordinary login lands on the preferred board; connection login preserves the
validated pending consent path and query. Connection pages use explicit JWT
headers and omit cookies. JWTs never enter OAuth callback URLs. Consent and
revocation stay account-bound; scopes and current membership remain enforced by
Django. See [Notoli's MCP integration](../backend/integrations/README.md) and
[client setup](../backend/app_mcp/chatgpt/README.md).

## 🧩 Board and list behavior

### 🤝 Board Sharing

Board management lives in the right sidebar. Open the Board list, use a board row's action menu, and choose Share. The Share dialog displays the board owner and collaborators. Owners can add collaborators by username/email and remove collaborators; non-owners can view access in read-only mode.

### Notes Checklist Items

Notes in a list render as checklist rows. Checking a note updates its `status` to `Complete` through the notes API, immediately reflects the change in the UI, and shows complete note text with a strikethrough. Unchecked notes use `Not Started`, and the API also supports `In Progress`.

### In-App Notifications

The app bar notification icon opens a popover with the newest notifications first. Unread notifications show a badge count and can be marked read all at once. Clicking a notification opens its target board or list when the backend provides `target_path`, and each notification can be cleared individually. Notification API failures are shown inside the popover and do not block the rest of the page.

### Drag-and-Drop Reordering

List and note pages include a top-right page action menu for entering reorder mode. Reorder mode hides row action menus, shows right-side drag handles, hides Add New, and exits through Done. Dragging only starts from the handle and persists the final order through the reorder API after drop.

Loaded board/list pages may report readiness again when their parent renders. The route coordinator keeps an already active single-page state unchanged, preventing a render feedback loop that can make controls unresponsive. Unit tests exercise automatic and repeated readiness; desktop/mobile browser menu and refresh journeys also reject render-loop messages and uncaught page errors. See issue #1022.

Use semantic links for destinations and buttons for actions; retain keyboard
and native new-tab coverage. Drawer mutations use the shared structured-error
helper and snackbar feedback, guard missing tokens, and navigate away after
deleting the active board. Keep routing helper invalid-input coverage alongside
the documented singular/plural compatibility behavior.

## 🎨 Style guide

### Dividers

- Dialog and modal dividers should be inset to align with the content padding.
- Avoid full-bleed divider lines inside dialogs unless the surrounding surface also uses full-bleed sectioning.
- Use the app divider color (`var(--secondary-color)`) and a visible weight (`borderBottomWidth: 2`) for consistency with sidebar and list surfaces.

### Dialog Density

- Keep dialogs focused on the current task and avoid repeating identity fields.
- Prefer compact sections or responsive two-column layouts when a dialog compares two related groups, such as owner and collaborators.
- In member lists, show a display name plus one secondary identifier when possible instead of separate labeled username and email rows.
- Sharing dialogs should use a single `People with access` list with consistent user rows, avatars, role labels, and owner-only management controls.
- When a section heading already labels an input group, prefer placeholder text plus an accessible `aria-label` over a floating visual input label.
- Text field focus states should use the Notoli secondary color globally, never the default Material UI blue. Keep the global overrides in `src/App.css` covered by `notoliThemeStyles.test.js`.

## 🧪 Checks

From `frontend/`:

```powershell
npm test
npm run lint:strict
npm run format:check
npm run build
```

## 🌐 Browser tests

`frontend/e2e/` owns the browser journeys and their helpers: `run_e2e.cjs` creates
and cleans up disposable state, `e2e_backend.py` starts the isolated loopback
backend, `e2e_settings.py` suppresses developer dotenv loading and selects temporary
SQLite/file mail, and `collect_browser_artifacts.py` collects bounded failure
evidence. `npm run test:e2e` invokes the runner from `frontend/`; CI collects reports
with `python e2e/collect_browser_artifacts.py` from the same directory.

Install backend requirements in an activated Python environment. From `frontend/`:

```powershell
npx playwright install chromium
npm run test:e2e
```

Ports 8001 and 3001 must be free. The wrapper starts Django and Vite with fresh,
marked temporary state and stops both before deleting that state. It uses synthetic
users, temporary SQLite and file mail; it does not load developer `.env` files,
reuse running servers, send external email, or make paid AI calls. The shared auth
journeys cover registration, session isolation, logout, protected routing, invalid
credentials, JWT expiry, and password reset. Product journeys belong under `e2e/`.

The suite uses one Chromium worker, no retries, and a ten-minute global timeout.
Linux CI installs Chromium with `--with-deps`. Failure artifacts are written to
`test-results/` and `playwright-report/`; CI retains bounded evidence for seven
days. Reports may include disposable tokens, so do not publish them in issues.

The board/menu and mobile refresh journeys retain render-loop and uncaught-error
checks. See [menu and refresh behavior](../docs/UI-BUG-BATCH-915-847.md).

## 🛠️ Maintenance

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
versions, regenerate the lockfile and repeat those checks.

Notoli also overrides `glob@>=9 <14.0.2` to `^14.0.2` for
[GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4).
Jest/Babel and their glob/deepmerge test-only graph were removed by the Vitest migration. Keep lockfile updates coupled to supported lint/test dependencies.

Keep Material UI and icons on compatible versions and regenerate the lockfile
together. Prefer `sx` and `slotProps`; preserve accessible control labels. For
jsdom CSS assertions, check computed transition/animation longhands and use real
browser tests for responsive geometry. Follow the Node range in `package.json`,
and verify clean installs, strict lint, formatting, tests and production builds.
See [Docker dependency maintenance](../deploy/README.md#development-dependency-reproducibility).

Keep Vitest projects isolated. Do not override the configured pool; use
`--maxWorkers=1` for serial profiling. The DOM worker memory limit and recycling
keep test environments independent without dropping authentication or domain assertions.

## 📚 Related guides

- [Backend and MCP integration](../backend/README.md).
- [Local Docker and production releases](../deploy/README.md).
