# 🎨 Notoli frontend

The React application uses Vite and Material UI for pages, navigation,
authentication, and the application shell.

## 🧭 Structure

- `docker/`: production/development Dockerfiles and Nginx configuration.
  Docker builds keep `frontend/` as their context; each Dockerfile has an adjacent
  `<Dockerfile-name>.dockerignore` using paths relative to that context.
- `src/index.css`: the single global stylesheet, loaded by `src/index.jsx`; keep
  theme tokens, document defaults, shared controls and app-specific rules here.
- `src/components/`: reusable interface components.
- `src/pages/`: application pages and routes.
- `src/services/`: API requests and session handling.
- `src/test-helpers/`: shared test setup and reusable helpers.
  App, startup and feature tests stay beside the files they exercise.

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

Development Compose supplies `REACT_APP_API_BASE_URL` through its `environment`
settings. Production Docker builds pass the matching build argument, which is
compiled into the static assets; a blank value selects same-origin requests.
Local `.env` files are excluded from Docker build contexts.

For direct `npm` development, an unset API origin uses `http://localhost:8000`.
An explicit shell value overrides that default; an explicit blank uses same-origin.
`PUBLIC_URL` supplies the router basename, defaulting to `/`. HTML asset URLs
use `%BASE_URL%` from Vite's separate `base` setting. The API origin is independent
of both. Production uses subdomain-root routing and Nginx's SPA fallback for deep
links; changing one prefix alone does not configure a complete subdirectory
deployment.

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
with the real router.

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
Django. See [Notoli's MCP integration](../backend/apps/mcp/tools/README.md) and
[client setup](../backend/apps/mcp/chatgpt/README.md).

### Connections response contract

Successful consent, decision, list and revoke responses must be JSON objects.
Unreadable, empty, null, scalar or array successes reject with `Request failed.`;
a protocol failure must not follow a callback or claim revocation succeeded.
HTTP failures use the first nonblank string in `error_description`, `detail`, then
`error`, otherwise `HTTP <status>`. Never expose raw HTML/plaintext, parser errors,
nested objects or unrelated JSON fields as fallback messages. Backend public error
fields must be safe to display. Preserve JWT-only headers, omitted cookies, form
encoding, signed consent tickets and validated callbacks. Invalid refresh credentials
clear the session; transient proxy/refresh failures retain it for retry. Notoli
retains its extra post-refresh 401 handling and legacy API-base compatibility.

## 🧩 Board and list behavior

<a id="-board-sharing"></a>

### Board sharing

Board management lives in the right sidebar. Open the Board list, use a board row's action menu, and choose Share. The Share dialog displays the board owner and collaborators. Owners can add collaborators by username/email and remove collaborators; non-owners can view access in read-only mode.

### Notes checklist items

Notes in a list render as checklist rows. Checking a note updates its `status` to `Complete` through the notes API, immediately reflects the change in the UI, and shows complete note text with a strikethrough. Unchecked notes use `Not Started`, and the API also supports `In Progress`.

### In-app notifications

The app bar notification icon opens a popover with the newest notifications first. Unread notifications show a badge count and can be marked read all at once. Clicking a notification opens its target board or list when the backend provides `target_path`, and each notification can be cleared individually. Notification API failures are shown inside the popover and do not block the rest of the page.

### Drag-and-drop reordering

List and note pages include a top-right page action menu for entering reorder mode. Reorder mode hides row action menus, shows right-side drag handles, hides Add New, and exits through Done. Dragging only starts from the handle and persists the final order through the reorder API after drop.

Loaded board/list pages may report readiness again when their parent renders. The route coordinator keeps an already active single-page state unchanged, preventing a render feedback loop that can make controls unresponsive. Unit tests exercise automatic and repeated readiness. See issue #1022.

Use semantic links for destinations and buttons for actions; retain keyboard
and native new-tab coverage. Drawer mutations use the shared structured-error
helper and snackbar feedback, guard missing tokens, and navigate away after
deleting the active board. Keep routing helper invalid-input coverage alongside
the documented singular/plural compatibility behavior.

### Menu exit and refresh behavior

Keep permission-dependent menu selection through MUI's exit transition and clear
it at `onExited`; reopening replaces selection and cancels the previous exit.
Use direct menu children for keyboard navigation and restore focus to a named,
focusable trigger. A single proportional refresh-indicator spacer owns pull
displacement and holds space until completion; keep paper padding constant.
Cancellation never refreshes, overlapping requests are ignored, and failed callbacks
settle. Respect nested/document scroll and inactive route slots. Suppress competing
native root overscroll through a pending custom refresh; restore prior policy
immediately on route exit/unmount and once a disabled hook has settled.

## 🎨 Style guide

### Dividers

- Dialog and modal dividers should be inset to align with the content padding.
- Avoid full-bleed divider lines inside dialogs unless the surrounding surface also uses full-bleed sectioning.
- Use the app divider color (`var(--secondary-color)`) and a visible weight (`borderBottomWidth: 2`) for consistency with sidebar and list surfaces.

### Dialog density

- Keep dialogs focused on the current task and avoid repeating identity fields.
- Prefer compact sections or responsive two-column layouts when a dialog compares two related groups, such as owner and collaborators.
- In member lists, show a display name plus one secondary identifier when possible instead of separate labeled username and email rows.
- Sharing dialogs should use a single `People with access` list with consistent user rows, avatars, role labels, and owner-only management controls.
- When a section heading already labels an input group, prefer placeholder text plus an accessible `aria-label` over a floating visual input label.
- Text field focus states should use the Notoli secondary color globally, never the default Material UI blue. Keep the global overrides in `src/index.css`.

## 🧪 Checks

`src/index.test.jsx` boots the real entry point, React root and application in
jsdom, then checks the signed-out login route and usable form without private API
requests or uncaught startup errors. It unmounts the real root and restores test
state afterward. Existing Material UI test shims still apply; browser layout and
built HTML are outside this test's scope.

`npm run build` runs strict lint before Vite's production build. Use
`npm run lint:fix` to apply available lint fixes.

From `frontend/`:

```powershell
npm test
npm run lint:strict
npm run format:check
npm run build
```

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
jsdom CSS assertions, check computed transition/animation longhands; inspect
responsive geometry in a browser. Follow the Node range in `package.json`,
and verify clean installs, strict lint, formatting, tests and production builds.
See [Docker dependency maintenance](../deploy/README.md#development-dependency-reproducibility).

Keep Vitest projects isolated. Do not override the configured pool; use
`--maxWorkers=1` for serial profiling. The DOM worker memory limit and recycling
keep test environments independent without dropping authentication or domain assertions.

<a id="-related-guides"></a>

## 📚 Reference

- [Backend and MCP integration](../backend/README.md).
- [Local Docker and production releases](../deploy/README.md).
