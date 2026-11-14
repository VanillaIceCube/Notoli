# 🛠️ Notoli backend

The Django REST Framework backend owns application data, authentication,
permissions, notifications, and application integrations.

## 🧭 Structure

- `app/`: settings and server entry points.
- `notes/`: boards, lists, and notes.
- `authentication/`, `notifications/`: accounts and notifications.
- `integrations/`, `app_mcp/`: application tools and shared MCP.

## 💻 Local development

Use Python 3.12 in an isolated environment. From the repository root:

```powershell
python -m pip install -r backend/requirements.txt
python backend/manage.py migrate
Set-Location backend
python -m uvicorn app.asgi:application --port 8000 --reload --no-proxy-headers
```

Local settings can be supplied in ignored `backend/.env`. See the
[configuration and API reference](REFERENCE.md) for settings and endpoint details.
For Docker hot reload, follow the [deployment guide](../deploy/README.md).

Uvicorn serves both REST and MCP. Django `runserver` serves REST/auth only.

## 🧪 Checks

From the repository root:

```powershell
python backend/manage.py test
ruff check backend
ruff format backend --check
python backend/manage.py makemigrations --check --dry-run
```

## 🔌 MCP integration

The [MCP README](app_mcp/README.md) explains shared transport,
OAuth, configuration, and verification.

Notoli tools and permissions live in the [integration README](integrations/README.md),
which links to the [ChatGPT plugin guide](../backend/app_mcp/chatgpt/README.md).

Connection manifests, artwork, and package builders live in
[chatgpt/](app_mcp/chatgpt/README.md).

## 📚 Reference

Use the [backend reference](REFERENCE.md) for API contracts, configuration,
email delivery, and maintenance details. Live-server procedures belong to
the [production guide](../deploy/production/README.md).


<details>
<summary>API, configuration, and maintenance sections</summary>

<a id="-what-lives-here"></a>

- [🧭 What Lives Here](REFERENCE.md#-what-lives-here)

<a id="-api-routes"></a>

- [🗺️ API Routes](REFERENCE.md#-api-routes)

<a id="chatgpt-mcp-authentication-and-tools"></a>

- [ChatGPT MCP authentication and tools](REFERENCE.md#chatgpt-mcp-authentication-and-tools)

<a id="-authentication"></a>

- [🔐 Authentication](REFERENCE.md#-authentication)

<a id="-data-model-high-level"></a>

- [🧱 Data Model (High Level)](REFERENCE.md#-data-model-high-level)

- [💻 Local Development](REFERENCE.md#-local-development)

<a id="docker-hot-reload"></a>

- [Docker hot reload](REFERENCE.md#docker-hot-reload)

<a id="-configuration"></a>

- [⚙️ Configuration](REFERENCE.md#-configuration)

<a id="-shared-mcp-framework"></a>

- [🔌 Shared MCP framework](REFERENCE.md#-shared-mcp-framework)

<a id="authentication-and-notification-parity"></a>

- [Authentication and notification parity](REFERENCE.md#authentication-and-notification-parity)

<a id="development-dependency-reproducibility"></a>

- [Development dependency reproducibility](REFERENCE.md#development-dependency-reproducibility)

<a id="disposable-browser-test-backend"></a>

- [Disposable browser-test backend](REFERENCE.md#disposable-browser-test-backend)

<a id="transactional-email-failure-handling"></a>

- [Transactional email failure handling](REFERENCE.md#transactional-email-failure-handling)

</details>
