# 🎨 Notoli frontend

The React application uses Vite and Material UI for pages, navigation,
authentication, and the application shell.

## 🧭 Structure

- `docker/`: production/development Dockerfiles and Nginx configuration.
  Docker builds keep `frontend/` as their context; each Dockerfile has an adjacent
  `<Dockerfile-name>.dockerignore` using paths relative to that context.
- `src/theme.js`: application palette, document typography, shared Material UI defaults
  and the existing CSS color variables, applied through `ThemeProvider` and `CssBaseline`.
- `src/index.css`: platform font rendering and remaining app-specific global rules,
  loaded by `src/index.jsx`. Keep responsive page geometry in the owning component.
- `src/components/`: reusable interface components.
  Standard components maintained across the three apps live in [src/components/app-core/](src/components/app-core/).
  App-specific layout and navigation live in [src/components/app/](src/components/app/).
- `src/pages/`: application pages and routes.
- `src/services/`: API requests, response parsing in `apiResponse.js` and session storage in `sessionState.js`.
- `src/hooks/`: reactive session access, notifications, the session’s board list and pull-to-refresh gestures.
- `src/test-helpers/`: shared test setup and reusable helpers.
  App, startup and feature tests stay beside the files they exercise.

Keep `components/`, `pages/`, `hooks/` and `services/` flat by default. Group modules you
usually edit together one level down. A source file and its adjacent test count as one module.

### Where to change things

| To change                                       | Start here                                                                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Routes and layout                               | [App](src/App.jsx)                                                                                                                 |
| Header and notifications                        | [AppHeader](src/components/app-core/AppHeader.jsx), [NotificationsMenu](src/components/app-core/NotificationsMenu.jsx)             |
| Sign-in, registration, and password reset       | [AuthForm](src/components/app-core/AuthForm.jsx) and [route pages](src/pages/authentication/)                                      |
| Shared colors, typography, and component styles | [Theme](src/theme.js)                                                                                                              |
| Preferred board on sign-in                      | [BoardHomeRedirect](src/components/app/BoardHomeRedirect.js)                                                                       |
| Board navigation and sharing                    | [BoardNavigationDrawer](src/components/app/BoardNavigationDrawer.jsx), [BoardShareDialog](src/components/app/BoardShareDialog.jsx) |
| Lists and tasks                                 | [BoardListsPage](src/pages/notepad/BoardListsPage.jsx), [ListTasksPage](src/pages/notepad/ListTasksPage.jsx)                       |

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

`VITE_API_BASE_URL` controls the API origin. Leave it blank for production same-origin
requests; client-side settings must contain no secrets. The build output is
`dist/`.

`VITE_MCP_ENABLED=1` enables Connected Apps, OAuth consent routes and the profile
menu link. With the flag off, stale connection URLs return to the normal app
landing flow. Match it to backend `DJANGO_MCP_ENABLED`; local Compose derives it
from the same setting. The production Dockerfile defaults this build argument to
`1`, matching the production backend policy. For direct npm development, set
`VITE_MCP_ENABLED=1` alongside an enabled backend before starting Vite.

Development Compose supplies `VITE_API_BASE_URL` through its `environment`
settings. Production Docker builds pass the matching build argument, which is
compiled into the static assets; a blank value selects same-origin requests.
Local `.env` files are excluded from Docker build contexts. Update local shell and
dotenv settings to `VITE_API_BASE_URL`; the retired `REACT_APP_API_BASE_URL` and
`PUBLIC_URL` variables are no longer read. Router and asset prefixes use Vite's
`base` setting.

For direct `npm` development, an unset API origin uses `http://localhost:8000`.
An explicit shell value overrides that default; an explicit blank uses same-origin.
Vite's `base` setting supplies the router basename through
`import.meta.env.BASE_URL` and HTML asset URLs through `%BASE_URL%`. The API origin is independent
of both. Production uses subdomain-root routing and Nginx's SPA fallback for deep
links; changing one prefix alone does not configure a complete subdirectory
deployment.

## 🗺️ Routes and behavior

Route pages load through `React.lazy` and the shared `RouteContent` boundary.
The application shell stays usable while a page loads. Authentication guards
run before protected lazy pages render, and a failed import offers a full-page
reload at the current URL, preserving its query and deployment base. Navigating
to another route clears that route's error state. The build emits separate page
chunks; shared vendor code remains part of the signed-out dependency graph.

Board and list pages have separate boundaries for the active page and the next
page. The active page stays visible until the next page is ready. A failed
import shows recovery controls for the next page.

- `/` opens the last accessible board or the first accessible board by ID
- `/board/:boardId` shows lists for a board
- `/board/:boardId/list/:listId` shows tasks for a list
- Public auth routes: `/login`, `/register`, `/forgot-password`, `/reset-password?uid=<...>&token=<...>`
- `/connections/authorize` displays OAuth consent for a pending application request
- `/connections` lists and revokes Connected Apps (also available in the profile menu)
- Everything else requires auth

All four authentication pages use the shared `AuthForm` for layout and submit controls.
Authentication-page navigation uses Material UI `Link` with React Router `Link`,
so each destination has a real `href`, Tab/Enter access, and native new-tab
behavior without submitting its form. Regression tests cover all five links
with the real router.

Navigation utilities accept `/board/` and `/boards/` inputs, strip query strings,
fragments, and a trailing slash, and ignore invalid paths or navigators. Public
React routes and generated links use `/board/`; `/boards/` is a helper input
compatibility form, not an additional React route.

## 🔐 Sessions and connections

`src/services/sessionState.js` is the sole owner of the compatible access/refresh
and username/email storage keys. Its cached snapshots and subscriptions feed
`useSession`; login/logout replace the account generation, while guarded refresh
updates tokens without replacing that generation. Do not read or mutate auth
storage in components or API adapters. Use the snapshot for request-time reads,
the hook for rendering, and the store operations for writes. The unrelated
`pendingSnackbar` key remains the login-message handoff.

The application shell and protected content reset on account changes, including
open menus, private drafts and Notoli's board drawer state. Async continuations
use `useSessionGuard` before account-scoped navigation or global UI updates. Authentication forms also check the current URL so a late response cannot take over after navigation starts.
Logout/expiry queue their login message before publishing the cleared session;
root snackbar state preserves successful login/register feedback and excludes
messages from an older generation.

`useNotifications` owns loading, retries, unread state and synchronous item/bulk
locks. `NotificationsMenu` connects the hook to the app's notification API and
handles presentation and navigation. The hook discards stale results after
account changes or unmount. Token rotation preserves pending work, and an
earlier list request cannot undo a newer mutation.

Authentication forms disable submission while pending. Tokens and profile data
live in `sessionStorage`; new sessions trim profile fields and clear absent values.
Protected requests use the stored JWT when the caller omits Authorization.
Public authentication forms do not receive an injected access token.

The request wrapper preserves object, tuple-array, and native `Headers` values
through one JWT refresh/retry. Invalid refresh credentials or a second protected
401 after refresh clear the session;
temporary refresh failures retain it. Refresh results belong to the login that
started them: logout or a new login invalidates pending work. Background failures
preserve an active, validated connection path and query through login.
Notification failures keep actions available
for Retry, and malformed mark-read responses must not navigate away.
Use semantic links for destinations and buttons for actions, with keyboard and
native new-tab coverage.

Ordinary login goes to the home route, which chooses the preferred board.
The session layout loads the board list for both the home redirect and drawer.
Token rotation refreshes that list, and drawer mutations keep the shared result current.
Connection login preserves the validated pending consent path and query. Connection pages use explicit JWT
headers and omit cookies. JWTs never enter OAuth callback URLs. Consent and
revocation stay account-bound; scopes and current membership remain enforced by
Django. See [Notoli's MCP integration](../backend/apps/mcp/README.md#application-tools) and
[client setup](../backend/apps/mcp/README.md#chatgpt).

The existing `/connections/authorize?approval_id=<opaque UUID>` screen supports
app-owned action review. It loads the complete preview with the app JWT, renders
untrusted text without HTML, and submits only the signed ticket plus explicit
Approve/Cancel. It never auto-approves or puts credentials in links. Invalid/stale
tickets clear controls and require fresh review. Framed action review is refused;
frontend Nginx applies `frame-ancestors 'none'`, `X-Frame-Options: DENY`, no-store and
no-referrer to the exact `/connections/authorize` page, preserving embedding policy
elsewhere. MacroMapper and Notoli configure app-owned approval handlers.
FullStackTemplate supplies the reusable flow for applications that register a
handler.

### Connections response contract

Successful consent, decision, list and revoke responses must be JSON objects.
Unreadable, empty, null, scalar or array successes reject with `Request failed.`;
a protocol failure must not follow a callback or claim revocation succeeded.
HTTP failures use the first nonblank string in `error_description`, `detail`, then
`error`, otherwise `HTTP <status>`. Never expose raw HTML/plaintext, parser errors,
nested objects or unrelated JSON fields as fallback messages. Backend public error
fields must be safe to display. Preserve JWT-only headers, omitted cookies, form
encoding, signed consent tickets and validated callbacks. Invalid refresh credentials
clear the session; transient proxy/refresh failures retain it for retry. All three applications share the same post-refresh 401
and session-lifecycle contract.

## 🧩 Board and list behavior

<a id="-board-sharing"></a>

### Board sharing

Board management lives in the right sidebar. Open the Board list, use a board row's action menu, and choose Share. The Share dialog displays the board owner and collaborators. Owners can add collaborators by username/email and remove collaborators; non-owners can view access in read-only mode.

### Task checklist items

Tasks in a list render as checklist rows. Checking a task sets its `status` to `Complete` and strikes through the task text immediately. Unchecking sets it to `Not Started`. The API also supports `In Progress`.

Authentication and notification requests live in `authApiClient.js` and `notificationApiClient.js`. The board, list and task client `notoliApiClient.js` translates between task `text` and the existing `note` field on `/api/notes/` routes.

### In-app notifications

The app bar notification icon opens a popover with the newest notifications first. Unread notifications show a badge count and can be marked read all at once. Clicking a notification opens its target board or list when the backend provides `target_path`, and each notification can be cleared individually. Notification API failures are shown inside the popover and do not block the rest of the page.

### Drag-and-drop reordering

To reorder lists or tasks, open a row’s action menu and choose **Reorder**. Drag items by the handles on the right. Each drop saves the new order. Select **Done Reordering** to return to the regular list.

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

Use `--page-background` and `--page-text` for the document, and
`--surface-background` and `--surface-text` for panels and controls. The app theme
defines these colors. Keep sibling JSX sections in the order they appear on
screen so keyboard navigation follows the layout.

`src/theme.js` owns the dark document background, pale-yellow paper surfaces and
neutral gray controls. MUI uses light control semantics on these pale surfaces;
body text remains white on the dark document. Preserve the system document font,
Roboto MUI controls and content-box document sizing when changing the baseline.
The four existing CSS color variables come from this theme, not duplicated CSS
literals. App bars, overlay frames, outlined white fields and focus colors share
theme defaults. Standard inline editors remain transparent; specialized field
surfaces, divider emphasis/insets and responsive layout remain component-owned.
MUI 9 applies the outlined surface through `MuiTextField.styleOverrides.root.variants`;
the real startup test verifies the rendered white background, while standard editors stay transparent.
Test helpers use the actual app theme with only ripple suppression added.

### Dividers

- Dialog and modal dividers should be inset to align with the content padding.
- Avoid full-bleed divider lines inside dialogs unless the surrounding surface also uses full-bleed sectioning.
- Use the app divider color (`var(--surface-text)`) and a visible weight (`borderBottomWidth: 2`) for consistency with sidebar and list surfaces.

### Dialog density

- Keep dialogs focused on the current task and avoid repeating identity fields.
- Prefer compact sections or responsive two-column layouts when a dialog compares two related groups, such as owner and collaborators.
- In member lists, show a display name plus one secondary identifier when possible instead of separate labeled username and email rows.
- Sharing dialogs should use a single `People with access` list with consistent user rows, avatars, role labels, and owner-only management controls.
- When a section heading already labels an input group, prefer placeholder text plus an accessible `aria-label` over a floating visual input label.
- Text field focus states use the Notoli control color globally. Keep input-label,
  outline and underline overrides in `src/theme.js`.

## 🧪 Checks

Keep every test beside its implementation with the same basename and extension:
`Component.jsx` pairs with `Component.test.jsx`, and `service.js` pairs with
`service.test.js`. Put behavior and integration scenarios in that owning suite
using scoped `describe` blocks, rather than adding standalone behavior-named or
`.integration.test` files. JavaScript hooks and components that return no JSX keep
`.test.js` harnesses using `createElement` when necessary. Shared setup and reusable
helpers belong in `src/test-helpers/`; tests of a domain package's public API pair
with its `index.js` entry point.

Keep shared session, request, connection and navigation regressions aligned across
FullStackTemplate, MacroMapper and Notoli when the behavior applies. Preserve real
React Router and Material UI keyboard/exit coverage when consolidating suites;
app-specific domain and route expectations remain in their owning application.

`src/index.test.jsx` boots the real entry point, React root and application in
jsdom, then checks the signed-out login route and usable form without private API
requests or uncaught startup errors. It unmounts the real root and restores test
state afterward. It also types into the themed login field and verifies shared
focus/action colors, document sizing and font ownership. Existing Material UI test
shims still apply; browser layout and built HTML are outside this test's scope.

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

Shared frontend dependency ranges align across the template and both applications:
React/React DOM 19.3.1, Material UI/icons 9.5, React Router 8.5.1, and Prettier 3.10.
Use `react-router` imports. Testing Library belongs in development dependencies;
TypeScript is explicitly pinned for the tooling peer graph. Keep app-specific
packages, including Notoli drag-and-drop and its test lint plugin, app-owned.

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
