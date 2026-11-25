# Production launches

Notoli serves `https://notoli.judeandrewalaba.com`. The backend trusts only the gateway at `172.30.88.2` on its private network. Application settings and readiness checks live in [app.json](app.json). The [Compose file](compose.yml) defines the two services. The [shared release guide](https://github.com/VanillaIceCube/JudeAndrewAlabaInfrastructure/blob/0c45c727198d057c8bba3c72699588b6672a6362/app-release/README.md) describes the Infrastructure-owned launcher. For local development, see the [deployment README](../README.md).

## Release sequence

1. The owner promotes the reviewed source to `env-prod`. The [workflow](../../.github/workflows/ci-deploy.yml) verifies its shared source pin, builds the images, and records their immutable digests.
2. The workflow verifies the SSH host key, reserves a private incoming directory, and uploads the app’s Compose file, configuration and environment there.
3. The launcher validates the bundle, existing SQLite database, trusted gateway and ports. It pulls both images, stops this app’s database writers, and runs Django’s deployment checks and migrations.
4. Compose starts the backend and frontend. The launcher checks network isolation, the direct backend and the public routes before reporting success.

## Host preparation and activation

Provision the app’s private `DEPLOY_PATH` and `incoming/` directory, owned by the deployment identity with mode 0700. Supply the existing, nonempty SQLite file at `$DEPLOY_PATH/db.sqlite3`. Preserve its ownership and mode. Provision `/var/lib/jude-deploy-locks` (0700) with private `maintenance.lock` and `notoli.lock` files (0600). The shared gateway and the external networks declared in the Compose file must exist. An app’s first launch can attach its own services to those networks.

The workflow executes this command on the host with its unique incoming bundle.

```sh
python3 "$DEPLOY_PATH/incoming/$RELEASE_ID/release.py" \
  --root "$DEPLOY_PATH" --bundle "$DEPLOY_PATH/incoming/$RELEASE_ID"
```

The launcher operates only this app’s services. It makes no database copies and offers no rollback command. A migration or readiness failure exits with the failed step. Inspect the affected app’s containers and their private logs before retrying with a new attempt. A WAL or rollback journal can contain committed data outside the single-file bind. If the launcher reports a journal, preserve that writer and have the database owner checkpoint it before attempting replacement. Avoid host-wide Docker pruning.

## ⚙️ Configuration

[app.json](app.json) owns the app's services, container names, domain,
environment, networks, database and readiness policy; [compose.yml](compose.yml)
defines its two services. Common release and bundle code has no app-name branches.
The gateway section describes this app's route networks and trusted peers.
`gateway.allowed_networks`, when present, lists all approved gateway attachments;
otherwise only this app's route networks are allowed. Unknown attachments and
missing app routes fail preflight; approved companion routes may be absent.
Infrastructure's `nginx/check_host.py` retains detailed full-host topology checks.
`workflow.extra_env` adds only app-specific Actions inputs;
all frontend builds use `VITE_API_BASE_URL=` for same-origin API requests.
The `shared_source` field pins the reviewed Infrastructure commit. The release workflow checks its code, tests and rendered workflow against that revision.

Required Actions access variables: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`,
`DEPLOY_HOST_FINGERPRINT` (independently verified SSH host key fingerprint).
Optional `DEPLOY_PORT` defaults to 22. Required access secret: `DEPLOY_SSH_KEY`.
Required app secrets: `DJANGO_SECRET_KEY`, `DJANGO_EMAIL_HOST_KEY`.
Required app variables: `DJANGO_EMAIL_BACKEND`, `DJANGO_DEFAULT_FROM_EMAIL`.
Use `anymail.backends.resend.EmailBackend` or
`django.core.mail.backends.smtp.EmailBackend` explicitly. The builder rejects retired custom backend names.
Optional mail settings: `DJANGO_EMAIL_HOST`, `DJANGO_EMAIL_PORT`,
`DJANGO_EMAIL_USE_TLS`, `DJANGO_EMAIL_HOST_USER`, `DJANGO_EMAIL_TIMEOUT`.
Defaults are `smtp.resend.com`, port 587, TLS enabled, user `resend`, timeout 10
seconds. Host/port/TLS/user settings apply to SMTP; the timeout also bounds
Resend API calls.

The bundle builder applies required, default and fixed settings from `app.json`;
incompatible explicit overrides of fixed production settings fail. Debug is off,
hosts/origins are explicit and the database target is `/backend/db.sqlite3`.
The frontend build uses blank `VITE_API_BASE_URL` for same-origin requests.
Both apps and the template use domain-root routes, without a configurable Django
path prefix: frontend `/`, authentication `/auth/`, admin `/admin/`, APIs `/api/`.
Environment values use single-line raw env files, preserving literal dollar
signs, hashes and quotes. Keep credentials out of Git, public artifacts, Vite
variables and logs. Keep release bundles private.

Notoli domain: `notoli.judeandrewalaba.com`; Compose services: `backend` /
`frontend`; container/image names: `notoli-backend` / `notoli-frontend`.
The backend uses `notoli_backend_private` at `172.30.88.3` plus backend-only
`notoli_backend_egress`; the frontend uses `notoli_default`. Trust only gateway
`172.30.88.2` and preserve Uvicorn `--no-proxy-headers`. ASGI middleware checks
the original peer before accepting forwarded scheme/client metadata; Django
ignores forwarded host/proto headers. MCP issuer and frontend origin are fixed
to `https://notoli.judeandrewalaba.com`.

<a id="-boundary-and-activation-order"></a>

<a id="-ci-inputs-and-private-host-preparation"></a>

<a id="-current-production-boundary"></a>

<a id="boundary-and-activation-order"></a>

<a id="ci-inputs-and-private-host-preparation"></a>

<a id="current-production-boundary"></a>

<a id="-chatgpt-mcp-deployment"></a>

## MCP integration

MCP uses Uvicorn and the Notoli issuer. Keep Cloudflare discovery and `/mcp` free from caching, challenges and path rewrites. Verify that protected-resource discovery names the Notoli resource and that an unauthenticated MCP request returns 401 with its challenge. The browser consent page is served at `/connections/authorize`. Client registration, owner consent, and plugin installation are separate from a launch. See the [app MCP guide](../../backend/apps/mcp/README.md).

<a id="-independent-production-verification"></a>

## Checks

From the repository root, verify the shared pin and run the release tests using a disposable Linux Docker environment.

```sh
python3 deploy/production/build_bundle.py --check-parity
python3 -m unittest discover -s deploy/tests -v
```

For live acceptance, confirm the deployed image digests, direct backend response, public HTML and authenticated API boundary against `app.json`. Use the declared public probes for the app’s enabled profile. Record the reviewed source and observed readiness in the deployment run.
