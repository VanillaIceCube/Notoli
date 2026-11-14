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
`build/`. See the [frontend reference](REFERENCE.md) for routes and settings.

## 🧪 Checks

From `frontend/`:

```powershell
npm test
npm run lint:strict
npm run format:check
npm run build
```

For isolated browser tests, install backend dependencies, then run
`npx playwright install chromium` and `npm run test:e2e` from `frontend/`.
The reference covers disposable data, required ports, and failure reports.

## 📚 Reference

- [Routes, components, browser tests, and maintenance](REFERENCE.md).
- [Backend and MCP integration](../backend/README.md).
- [Docker dependencies and image maintenance](../deploy/README.md#development-dependency-reproducibility).


<details>
<summary>Routing, testing, and maintenance sections</summary>

<a id="-app-routes"></a>

- [🧭 App Routes](REFERENCE.md#-app-routes)

<a id="-subdomain-hosting-notolijudeandrewalabacom"></a>

- [🌐 Subdomain Hosting (`notoli.judeandrewalaba.com`)](REFERENCE.md#-subdomain-hosting-notolijudeandrewalabacom)

<a id="-board-sharing"></a>

- [🤝 Board Sharing](REFERENCE.md#-board-sharing)

<a id="notes-checklist-items"></a>

- [Notes Checklist Items](REFERENCE.md#notes-checklist-items)

<a id="in-app-notifications"></a>

- [In-App Notifications](REFERENCE.md#in-app-notifications)

<a id="drag-and-drop-reordering"></a>

- [Drag-and-Drop Reordering](REFERENCE.md#drag-and-drop-reordering)

<a id="-api-base-url"></a>

- [🔌 API Base URL](REFERENCE.md#-api-base-url)

- [💻 Local Development](REFERENCE.md#-local-development)

<a id="docker-hot-reload"></a>

- [Docker hot reload](REFERENCE.md#docker-hot-reload)

<a id="-useful-commands"></a>

- [🧰 Useful Commands](REFERENCE.md#-useful-commands)

<a id="-node-version"></a>

- [🧱 Node Version](REFERENCE.md#-node-version)

<a id="-shared-mcp-framework"></a>

- [🔌 Shared MCP framework](REFERENCE.md#-shared-mcp-framework)

<a id="-transitive-dependency-maintenance"></a>

- [🔒 Transitive dependency maintenance](REFERENCE.md#-transitive-dependency-maintenance)

<a id="authentication-and-notification-reliability"></a>

- [Authentication and notification reliability](REFERENCE.md#authentication-and-notification-reliability)

<a id="development-dependency-reproducibility"></a>

- [Development dependency reproducibility](REFERENCE.md#development-dependency-reproducibility)

<a id="vitest-and-react-router-acceptance"></a>

- [Vitest and React Router acceptance](REFERENCE.md#vitest-and-react-router-acceptance)

<a id="optional-isolated-browser-tests"></a>

- [Optional isolated browser tests](REFERENCE.md#optional-isolated-browser-tests)

<a id="navigation-readiness"></a>

- [Navigation readiness](REFERENCE.md#navigation-readiness)

<a id="navigation-maintenance"></a>

- [Navigation maintenance](REFERENCE.md#navigation-maintenance)

</details>
