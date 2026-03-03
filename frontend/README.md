# 🎨 Frontend (React)

The Notoli frontend is a Create React App (CRA) single-page app with React Router and Material UI.

## 🧭 App Routes

- `/` shows workspaces
- `/workspace/:workspaceId` shows todo lists for a workspace
- `/workspace/:workspaceId/todolist/:todoListId` shows notes for a todo list
- `/login` and `/register` are public; everything else requires auth

Authentication tokens are stored in `sessionStorage` (`accessToken` and `refreshToken`).
The refresh token is stored for later use, but the frontend currently does not auto-refresh access tokens.
If an API request returns `401 Unauthorized` (expired/invalid token), the frontend clears stored tokens, redirects to `/login`, and shows an error snackbar explaining the logout.

## 🧩 Path-Based Hosting (`/apps/notoli`)

This app is designed to be hosted under a subpath (not at `/`), for example:

- `https://<your-domain>/apps/notoli`

Important pieces:

- `frontend/package.json` sets `homepage` to `/apps/notoli`
- `src/App.js` uses `process.env.PUBLIC_URL` as the React Router basename
- The container’s Nginx config (`frontend/nginx.conf`) serves `index.html` for deep links (`try_files ... /index.html`)

## 🔌 API Base URL

API calls go through `src/services/notoliApiClient.js` (endpoints) via `src/services/requestClient.js` (request wrapper).

- `REACT_APP_API_BASE_URL` is used as a prefix for all backend requests.
- Default is `http://localhost:8000` for local dev.
- For production behind `/apps/notoli`, set:
  - `REACT_APP_API_BASE_URL=https://<your-domain>/apps/notoli`

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
