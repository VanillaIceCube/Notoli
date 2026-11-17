# 🐳 Notoli deployment

Production uses the shared Infrastructure gateway and the
[app-only release/recovery procedure](production/README.md). Root Compose and
Nginx files operate local development stacks only.

## 🧭 Structure

| File or folder | Purpose |
| --- | --- |
| `backend.env` | Committed local example; copy to ignored `.env` |
| `docker-compose.dev.yml` | Source mounts, Uvicorn/Vite reload and direct HTTP |
| `docker-compose.yml` | Standalone local HTTPS using checkout-built images |
| `nginx-proxy.conf` | Proxy template expanded by official Nginx startup |
| `production/` | Pinned shared release engine and app-owned production policy |
| `tests/` | Release, configuration and recovery checks |

Shared release verification runs through
`python deploy/production/build_bundle.py --check-parity`; the immutable
Infrastructure source pin is `shared_source` in `production/app.json`.
See the [production guide](production/README.md) for source synchronization.

<a id="local-docker-with-notolilocalhost"></a>

## 💻 Local Docker with `notoli.localhost`

Both local Compose profiles require `deploy/db.sqlite3` to exist as a file before
startup (`create_host_path: false`). From the repository root, initialize only
missing files and reject a directory at the database path; existing data is preserved:

```powershell
if (-not (Test-Path deploy/.env)) { Copy-Item deploy/backend.env deploy/.env }
if (-not (Test-Path deploy/db.sqlite3)) { New-Item -ItemType File -Path deploy/db.sqlite3 }
if (-not (Test-Path deploy/db.sqlite3 -PathType Leaf)) { throw "deploy/db.sqlite3 must be a file; inspect any directory before continuing." }
docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml up --build -d
docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml exec -T backend python manage.py migrate
```

Open `http://notoli.localhost:3000`; the backend is
`http://notoli.localhost:8000`. Both ports bind to localhost. Override them
with `NOTOLI_DEV_FRONTEND_PORT` and `NOTOLI_DEV_BACKEND_PORT`
in `deploy/.env`. The frontend API URL, CSRF/CORS origins and MCP origin follow
those ports. Vite listens on its container interface with `HOST=0.0.0.0`.

This profile mounts both source trees, runs Uvicorn/Vite autoreload, forces debug
mode and trusts no forwarded proxy headers. It supplies a stable development-only
signing-key fallback when the local key is blank. Production requires its own key.
No certificate, Nginx or shared local ingress is needed.

<a id="standalone-https-and-image-checks"></a>

## 🔐 Standalone HTTPS and image checks

Use this profile only on your workstation. Stop the development profile before
switching because both profiles use the same database. From the repository root,
initialize only missing files and check the database before starting HTTPS:

```powershell
if (-not (Test-Path deploy/.env)) { Copy-Item deploy/backend.env deploy/.env }
if (-not (Test-Path deploy/db.sqlite3)) { New-Item -ItemType File -Path deploy/db.sqlite3 }
if (-not (Test-Path deploy/db.sqlite3 -PathType Leaf)) { throw "deploy/db.sqlite3 must be a file; inspect any directory before continuing." }
```

Set a nonblank private `DJANGO_SECRET_KEY` in `deploy/.env` for stable sessions.
Install `mkcert`; reuse existing certificates or create the first local pair:

```powershell
New-Item -ItemType Directory -Path certs -Force | Out-Null
mkcert -cert-file certs/origin.pem -key-file certs/origin.key "notoli.localhost" localhost 127.0.0.1 ::1
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up --build -d
docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec -T backend python manage.py migrate
```

Open `https://notoli.localhost`. Install your local mkcert CA if the browser
does not trust the certificate. Certificates stay in ignored `certs/`.
Compose builds the existing production Dockerfiles from this checkout using
local `:latest` image names. The frontend API build argument is blank for
same-origin requests. Production selects immutable image digests independently.

Only the proxy publishes HTTP 80 and HTTPS 443, both on localhost. Backend and
frontend publish no host ports; direct HTTP access belongs to the development
profile. The frontend shares a network with the proxy. The backend uses an
internal private proxy network and separate outbound network, trusting only the
proxy's exact address `172.30.88.2`. Bind mounts require existing files/directories
and never auto-create a SQLite directory, certificate directory or proxy file.

For a second local stack, set these app-specific values in `deploy/.env`:

```env
NOTOLI_HTTP_PORT=8080
NOTOLI_HTTPS_PORT=8443
NOTOLI_HTTPS_ORIGIN=https://notoli.localhost:8443
```

Update `HTTPS_ORIGIN` whenever changing the HTTPS port. This origin drives HTTP
redirects, password-reset links, OAuth/MCP metadata and trusted CSRF/CORS origins.
Nginx preserves the browser's Host port and relative slash redirects.
`NOTOLI_CERTS_DIR` selects another existing certificate directory; relative
paths resolve from `deploy/`. Private subnets differ per app so all three stacks
can coexist. If another local network conflicts, review this app's subnet,
proxy/backend addresses and exact proxy trust together in Compose.

<a id="routing-and-persistence"></a>

## ⚙️ Configuration and routing

The env example uses localhost origins and console email. Reset messages stay in
local logs unless you explicitly configure a real backend. Keep real credentials
in ignored `.env`; never add them to `backend.env`.

Both profiles override their own URL, database and proxy settings. Direct HTTP
trusts no proxy; HTTPS trusts the exact private Nginx address. Nginx replaces
client-supplied forwarded metadata with its actual TLS scheme/client address and
clears forwarded-host headers. Routes are consistent across apps:

- `/mcp` and `/.well-known/*` reach the backend; MCP streaming is unbuffered.
- `/api/*`, `/auth/*`, `/admin/*` and Django admin/DRF static files reach the backend.
- Frontend pages and deep links reach the frontend image.

API, auth, admin, MCP and discovery responses carry `Cache-Control: no-store`.
The upstream read timeout is 120 seconds. WebSocket upgrade headers are sent only
for actual upgrade requests. Official Nginx startup expands only
`LOCAL_SERVER_NAME` and `LOCAL_HTTPS_ORIGIN`; Nginx request variables remain intact.
Production ingress, Cloudflare, certificates and trust remain Infrastructure-owned.

<a id="local-persistence-and-troubleshooting"></a>

## 🛟 Local persistence and troubleshooting

Both profiles persist SQLite at `deploy/db.sqlite3`. Never replace existing data
with an empty file. If Docker previously created a directory there, stop the
stack and inspect/back up its contents before correcting the bind. Production
uses the approved application database path and private recovery procedure;
review managed-database adoption before adding backend replicas.

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml ps
docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml logs --tail 100 backend frontend
docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml down
```

Stop the other profile before switching; both mount the same SQLite file. Use
the matching Compose filename for every command. Recreate containers after env
changes with `up -d --force-recreate`; a restart does not reload env files.
If needed, add `127.0.0.1 notoli.localhost` to your local hosts file.

<a id="vite-build-interface"></a>

## 🔌 MCP integration

The app-owned connector uses `DJANGO_MCP_ENABLED`, with the same switch as Template
and MacroMapper. The local `backend.env` example sets it to `0`; set it to `1` to
enable MCP. Compose applies the same value to `VITE_MCP_ENABLED`. Recreate the
development containers or rebuild the HTTPS stack after changing the flag.
Production policy explicitly fixes both sides on.

Both profiles supply matching MCP/backend origins. Direct development serves
ASGI with no trusted proxy. ChatGPT connection testing requires a reachable HTTPS
origin or secure tunnel with consistent issuer, allowed host and CSRF origin;
`.localhost` itself is workstation-only. Keep local test databases and client
registrations separate from production. See the
[MCP framework and app guide](../backend/apps/mcp/README.md).

<a id="development-dependency-reproducibility"></a>

## 📦 Development dependency reproducibility

Both backend Dockerfiles install uv using isolated, binary-only pip with reviewed
SHA-256 hashes from [PyPI's uv 0.13.8 release](https://pypi.org/pypi/uv/0.13.8/json).
The allowlist covers every platform in the pinned Python image: Linux amd64,
arm/v7, arm64/v8, 386 and ppc64le. Unlisted artifacts, altered wheels and source
distributions fail installation. Requirements are passed through stdin; update
the version and all compatible wheel hashes together after artifact verification.

Development images pin reviewed multi-platform Node 26 and Python 3.12
registry digests. Frontend production and development builders use the same
immutable Node 26 digest. Refresh matching tags/digests together after registry
verification and a disposable build/configuration check.

Backend images use the reviewed Python 3.12 base and uv 0.13.8. The project
lockfile supplies production dependencies; development includes the tooling group.
The environment lives at `/opt/venv`, outside the source bind mount. Restart the
backend after changing the lockfile so `uv run --locked` synchronizes dependencies.
Host `.venv/` files are excluded from the image build. Conda is no longer required.
Template and MacroMapper production startup selects Uvicorn when
`DJANGO_MCP_ENABLED=1` and otherwise retains its app-owned Gunicorn profile.
Notoli retains Uvicorn in either profile; the app-level switch controls MCP routes. Local development uses Uvicorn in all three apps.

Backend production/development Dockerfiles live in `backend/docker/`; frontend
Dockerfiles and Nginx configuration live in `frontend/docker/`. Build contexts
remain `backend/` and `frontend/`; Compose and CI select each Dockerfile explicitly.

The frontend starts Vite directly with `npm start`. Source hot reload and the
persistent `frontend_node_modules` volume remain. Dependency changes require a
manual install in the running frontend container, followed by a restart:

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml exec -T frontend npm ci
docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml restart frontend
```

If the frontend is stopped, use `run --rm --no-deps frontend npm ci` with the same
Compose options, then start it again. Keep one dependency volume per checkout.
Compose configuration
checks do not deploy or touch application data.

<a id="non-deploying-repository-validation"></a>

<a id="-repository-validation"></a>

## 🧪 Checks

The existing validator renders all profiles with synthetic env values and rejects
public local bindings, backend exposure, automatic SQLite bind-path creation,
mismatched exact proxy trust and inconsistent HTTPS origins. It never starts
application containers or reads private local env/database/certificate contents.
See [workflow checks and validation](../.github/workflows/README.md#-checks-and-diagnostics).


<a id="-further-reading"></a>

## 📚 Reference

- [Live-server releases and recovery](production/README.md).
- [Backend configuration](../backend/README.md).
- [Frontend development](../frontend/README.md).

Both application contexts keep their Dockerfile-specific ignore files under
`docker/`: `Dockerfile.dockerignore` and `Dockerfile.dev.dockerignore`. Docker
selects the file matching the explicitly selected Dockerfile. Patterns remain
relative to `backend/` or `frontend/`, and the frontend Nginx/entrypoint files
remain included. There is no context-root `.dockerignore`.
