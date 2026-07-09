# 🎨 Frontend (React)

The Notoli frontend is a Create React App (CRA) single-page app with React Router and Material UI.

UI styling conventions live in [`STYLE_GUIDE.md`](STYLE_GUIDE.md).

## 🧭 App Routes

- `/` redirects authenticated users to their first board when one exists
- `/board/:boardId` shows lists for a board
- `/board/:boardId/list/:listId` shows notes for a list
- Public auth routes: `/login`, `/register`, `/forgot-password`, `/reset-password?uid=<...>&token=<...>`
- Everything else requires auth

Authentication tokens are stored in `sessionStorage` (`accessToken` and `refreshToken`).
The refresh token is stored for later use, but the frontend currently does not auto-refresh access tokens.
If an API request returns `401 Unauthorized` (expired/invalid token), the frontend clears stored tokens, redirects to `/login`, and shows an error snackbar explaining the logout.
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

The app bar notification icon opens a popover with the newest notifications first. Unread notifications show a badge count and can be marked read individually or all at once. Notification API failures are shown inside the popover and do not block the rest of the page.

## Drag-and-Drop Reordering

List and note pages include a top-right page action menu for entering reorder mode. Reorder mode hides row action menus, shows right-side drag handles, hides Add New, and exits through Done. Dragging only starts from the handle and persists the final order through the reorder API after drop.

## 🔌 API Base URL

API calls go through `src/services/notoliApiClient.js` (endpoints) via `src/services/requestClient.js` (request wrapper).

- `REACT_APP_API_BASE_URL` is used as a prefix for all backend requests.
- Default is `http://localhost:8000` for local dev when `REACT_APP_API_BASE_URL` is unset.
- In production, leave `REACT_APP_API_BASE_URL` blank/unset so calls use relative paths like `/api/...` on `https://notoli.judeandrewalaba.com`.
- If an absolute URL is required, set `REACT_APP_API_BASE_URL=https://notoli.judeandrewalaba.com`.
- Reorder calls use `PATCH /api/lists/reorder/` for board-scoped list order and `PATCH /api/notes/reorder/` for list-scoped note order.
- Notification calls use `GET /api/notifications/`, `PATCH /api/notifications/<id>/`, and `PATCH /api/notifications/mark-all-read/`.

Note: in the Docker image, `REACT_APP_API_BASE_URL` is a build-time value (it's baked into the static build).

## 💻 Local Development

From the repo root (full setup lives in [`AGENTS.md`](../AGENTS.md)):

```bash
cd frontend
npm install
npm start
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
