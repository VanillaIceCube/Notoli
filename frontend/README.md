# 🎨 Frontend (React)

The Notoli frontend is a Create React App (CRA) single-page app with React Router and Material UI.

UI styling conventions live in [`STYLE_GUIDE.md`](STYLE_GUIDE.md).

## 🧭 App Routes

- `/` redirects authenticated users to their first board when one exists
- `/board/:boardId` shows lists for a board
- `/board/:boardId/list/:listId` shows notes for a list
- Public auth routes: `/login`, `/register`, `/forgot-password`, `/reset-password?uid=<...>&token=<...>`
- `/connections/authorize` displays OAuth consent for a pending application request
- `/connections` lists and revokes Connected Apps (also available in the profile menu)
- Everything else requires auth

ChatGPT's authorization URL remains Django's `/auth/mcp/authorize/`, which
redirects the browser to React's `/connections/authorize` with the original
query. Users with JWTs go directly to consent. Signed-out users sign in through
the existing `/login?next=<encoded connection path>` and return to consent
instead of the board landing. Return paths are limited to the two connection
routes; external URLs cannot become login redirects. React shows application
name, client ID, account, requested permissions, and **Allow** / **Cancel**.
The optional sharing permission explicitly grants collaborator management on
owned boards and access to every list/item in those boards. Existing connections
must reconnect to approve it; the generic consent UI displays this new permission
from Django without changing the login flow.

`connectionsClient` uses explicit JWT headers and `credentials: omit` for
Django's JSON consent and connection-management endpoints. Django issues a
signed consent ticket; React posts only that ticket and the selected decision,
then follows Django's validated OAuth callback. OAuth tokens, PKCE validation,
resource binding, and permission enforcement stay in Django. Revocation removes
the current user's access/refresh tokens and pending codes. There is no separate
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

Important pieces:

- `frontend/package.json` does not set a CRA `homepage`, so production assets resolve from `/`.
- `src/App.js` still uses `process.env.PUBLIC_URL` as the React Router basename, which is empty for the subdomain build and remains useful for specialized local builds.
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
npm test -- --watchAll=false
npm run build
npm run lint
npm run format
```

## 🧱 Node Version

CI reads the Node version from `frontend/package.json` (`engines.node`).
