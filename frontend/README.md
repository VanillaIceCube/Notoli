# 🎨 Frontend (React)

The Notoli frontend is a Create React App (CRA) single-page app with React Router and Material UI.

## 🧭 App Routes

- `/` shows workspaces
- `/workspace/:workspaceId` shows todo lists for a workspace
- `/workspace/:workspaceId/todolist/:todoListId` shows notes for a todo list
- Public auth routes: `/login`, `/register`, `/forgot-password`, `/reset-password?uid=<...>&token=<...>`
- Everything else requires auth

Authentication tokens are stored in `sessionStorage` (`accessToken` and `refreshToken`).
The refresh token is stored for later use, but the frontend currently does not auto-refresh access tokens.
If an API request returns `401 Unauthorized` (expired/invalid token), the frontend clears stored tokens, redirects to `/login`, and shows an error snackbar explaining the logout.
Auth endpoints (`/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`) do not trigger the global 401 logout redirect.

## 🧲 List Reordering

Workspace, todo-list, and note rows include a right-side drag handle. Dragging starts from the handle only; dropping on another row updates the visible order immediately and persists it through the matching `/api/*/reorder/` endpoint. If persistence fails, the UI reverts and shows a clear error message.

## 🌐 Subdomain Hosting (`notoli.judeandrewalaba.com`)

Production is hosted at the subdomain root:

- `https://notoli.judeandrewalaba.com`

Important pieces:

- `frontend/package.json` does not set a CRA `homepage`, so production assets resolve from `/`.
- `src/App.js` still uses `process.env.PUBLIC_URL` as the React Router basename, which is empty for the subdomain build and remains useful for specialized local builds.
- In Docker Compose, the frontend Nginx config also proxies `/api/*`, `/auth/*`, `/admin/*`, `/static/admin/*`, and `/static/rest_framework/*` to the `backend` service so direct `http://localhost:3000` testing works with same-origin API calls.
- The container’s Nginx config (`frontend/nginx.conf`) serves `index.html` for deep links (`try_files ... /index.html`).

## 🔌 API Base URL

API calls go through `src/services/notoliApiClient.js` (endpoints) via `src/services/requestClient.js` (request wrapper).

- `REACT_APP_API_BASE_URL` is used as a prefix for all backend requests.
- Default is `http://localhost:8000` for local dev when `REACT_APP_API_BASE_URL` is unset.
- In production, leave `REACT_APP_API_BASE_URL` blank/unset so calls use relative paths like `/api/...` on `https://notoli.judeandrewalaba.com`.
- If an absolute URL is required, set `REACT_APP_API_BASE_URL=https://notoli.judeandrewalaba.com`.
- For Docker builds with a blank API base, same-origin `/api/*` and `/auth/*` requests are handled by either the production reverse proxy or the frontend container's own Nginx API proxy.

Note: in the Docker image, `REACT_APP_API_BASE_URL` is a build-time value (it’s baked into the static build).

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
