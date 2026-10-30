# App-only production release and recovery

Notoli owns MCP OAuth, consent, token validation, connections and all 31 tools.
The unreleased central issuer migration in #973 has been withdrawn; no shared
introspection credential or YNAB acceptance is required. Ordinary accounts and
website/REST login remain app-owned. Merging `main` alone does not deploy.

## Main-first promotion

Follow the canonical policy in
[FullStackTemplate #262](https://github.com/VanillaIceCube/FullStackTemplate/issues/262)
and the local reconciliation in
[Notoli #975](https://github.com/VanillaIceCube/Notoli/issues/975).
Develop and review changes through PRs targeting `main`; promote that exact reviewed source through
an `env-prod` PR, preserving all CI, reviewer and owner/operator gates. A promotion
merge may have a different commit ID, but its source tree must match the reviewed
`main` commit. Do not add deployment fixes only to the promotion branch.
An exceptional owner-authorized deployment iteration must return promptly through
a reviewed `main` PR before the next promotion.

The #975 audit reconciled historical production promotion merges without reverting
reviewed source. Intentional unreleased changes may remain on `main` until their
release prerequisites are complete; history parity alone does not prove live
acceptance or authorize deployment.

## Current production boundary

The app policy retains the original three shared route networks and Notoli's exact
trusted proxy `172.30.88.2`. Notoli does not depend on YNAB or shared-issuer networks.
Infrastructure must restore that accepted gateway baseline before promoting this
app policy; app releases never alter shared ingress or create/delete networks.
Preserve existing Notoli OAuth registrations, grants, database and signing secret.
No account linking, client reconnection or grant retirement is required for this
withdrawal because the central migration was never deployed.

This is the implementation of approved architecture v2. Every PR merge and
every production release still requires separate explicit owner authorization.
Only the operator designated in coordination #4 may perform production actions
under its separately approved plan. For the coordinated ingress migration, the
owner designated Agent 3 as the sole production operator; source approval does
not authorize any agent to operate the host. Shared decisions:
[Infrastructure #4](https://github.com/VanillaIceCube/JudeAndrewAlabaInfrastructure/issues/4).

## Shared implementation and app configuration

Both apps use [release contract v1](https://github.com/VanillaIceCube/JudeAndrewAlabaInfrastructure/blob/b56d8a9f88088122555e275549afa8b86fc10be5/docs/app-release-standard.md).
`app.json` contains this app's service/container/domain/environment/network/DB
and readiness policy; `compose.yml` defines its services. Common release and
bundle code has no application-name branches. `deploy/shared-source.json` pins
the versioned source; CI verifies exact common code/test copies and the generated
workflow, failing on drift or unavailable source. The parity matrix and update
procedure live in the standard. Run `python deploy/check_parity.py` locally;
use `--sync` only after reviewing a coordinated pin update in both applications.

Public readiness requests use the honest `JudeAppRelease/1.0` User-Agent and
request uncached responses. Cloudflare protections and all expected status,
content and authentication-challenge checks remain enabled.

The staged bundle includes `app.json` in its private checksum manifest. Release
and rollback never download code or depend on an Infrastructure checkout.
One transaction file keeps failure ordering and crash barriers reviewable;
application policy and declarative readiness are separated from that state machine.

## Boundary and activation order

The infrastructure gateway must already own ingress and pass its cutover
acceptance before this pipeline is activated. Production Compose contains only
this app's frontend/backend. All existing networks are referenced externally;
the script rejects unexpected route-network members, current-app/gateway absence,
exact proxy-trust drift and DB-mount drift. A missing companion app is allowed
so its outage does not prevent this app from being released or recovered. Both
apps must still pass the gateway cutover acceptance before activation. It never
creates/deletes networks, publishes a backend port, uploads TLS/vhosts, reloads
Nginx, runs a whole-project down/remove-orphans, or prunes host images.

The owner-approved sequence is gateway transfer, Notoli release and independent
repeat verification, then MacroMapper release and repeat verification.
Notoli preserves proxy `172.30.88.2`, backend `.3`, ASGI exact-peer trust and
Uvicorn `--no-proxy-headers`. Port 3000 is preserved pending the separate owner
consumer/disposition decision. Certificates remain host-administered in the
legacy path and are excluded from every app release.

## CI inputs and private host preparation

The workflow runs only on reviewed `env-prod` pushes or a manually authorized
dispatch selecting that branch. Pushing `main` or this feature branch does not
deploy. CI builds full SHA tags, then selects the build's **immutable digests**
for every pull/migration/startup; no `latest` selector is used.

Required access variables: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`,
`DEPLOY_HOST_FINGERPRINT` (independently verified SSH host key fingerprint);
optional `DEPLOY_PORT` defaults to 22. Secret: `DEPLOY_SSH_KEY`.
The host must have working GHCR pull credentials, Docker Engine/Compose with
raw env-file support (audited Compose 2.40.3), Python 3 and util-linux flock
semantics through Python's POSIX flock. No packages are installed on the host by CI.

Required app secrets: `DJANGO_SECRET_KEY`, `DJANGO_EMAIL_HOST_KEY`.
Required variables: `DJANGO_EMAIL_BACKEND`, `DJANGO_DEFAULT_FROM_EMAIL`.
Optional SMTP settings: `DJANGO_EMAIL_HOST`, `DJANGO_EMAIL_PORT`,
`DJANGO_EMAIL_USE_TLS`, `DJANGO_EMAIL_HOST_USER`, `DJANGO_EMAIL_TIMEOUT`.
Defaults remain Resend SMTP, port 587, TLS, user resend, timeout 10 seconds.
MCP issuer and trusted peer are fixed to the approved production origin and `.2`.
Canonical production host/origin/debug/DB settings are set by the app's
`build_bundle.py`; incompatible explicit overrides fail. Values are single-line
raw env files, so dollar signs, hashes and quotes retain their literal bytes.
Secrets are not uploaded as CI artifacts or printed by release commands.

The approved operator must provision these paths **before activation**, owned
by the deployment identity and mode 0700:

- App root: `/root/apps/notoli` (existing DB remains at `db.sqlite3`).
- Its `incoming`, `releases` and `recovery` children.
- `/var/lib/jude-deploy-locks`, with existing regular mode-0600 files
  `maintenance.lock`, `notoli.lock` and `macromapper.lock`.

The current host needs root access for the existing paths. Do not infer a
non-root uploader works or change DB/key ownership blindly. The operator
reviews any permission change in the production plan. Locks must be protected
stable inodes; never replace them, and reject symlinks. Provisioning commands
and the initial legacy-workflow hold are in the infrastructure runbook.

CI reserves a fresh `incoming/<source-sha>-<run-id>-<attempt>` directory and
uploads only its bundle. It never overwrites active files before locking.
Staging and releases must be on the same app filesystem. Unique attempts may
not be reused. No first-install/empty-DB bootstrap is performed: this migration
requires the existing nonempty SQLite bind file.

## Transaction and failure states

`release.py deploy` acquires shared maintenance then exclusive app lock,
rejecting conflicts rather than waiting indefinitely. The host operator uses
the maintenance lock exclusively for cutover. Initially serialize different-app
releases operationally until peak/concurrent capacity is verified.

Before stopping writers the script checks the payload manifest, immutable app
image identities, topology, fixed trust, existing DB bind, 512 MiB available
memory and 20% disk headroom after allowance for recovery copies. These floors
do not certify representative peak capacity. It resolves/pulls images, captures
private runtime state and produces an **app-only recovery Compose model** pinned
to cached previous image IDs. Original legacy files are retained as private
evidence; they are never executed as rollback scripts.

The backend and any surviving app-labelled management containers stop before
SQLite backup. Private `data-state.json` records the exact writer ID or a unique generation
label plus a checksummed complete checkpoint. Capture never guesses by container
start time. It discovers all backend/management writers by labels, including
temporary Compose names, stops them, and copies the selected generation's
DB plus WAL/rollback journal from the stopped container into a private isolated
directory, and recovers that copy. This matters because only the main DB file is
bind-mounted; sidecars can be in the container filesystem. A backup and isolated restore copy
must both pass integrity checks before production checks/migrations. SQLite
copy/restore operations have a 60-second progress deadline. Management
containers carry app/release identity labels and unique names. They are stopped
and verified after Docker CLI timeout; rollback quiesces surviving labelled
containers too. Stopped containers are retained because their journals can be
recovery evidence. Cleanup needs explicit operator review, like image retention.
These containers join only backend egress; they never contend with Notoli's reserved
backend address. Before migration and again before app startup, verified data is consolidated
into the main host DB with its original owner/mode. Before an inode swap, the
complete checkpoint and consumed writer IDs are persisted; their old journals
are retired from future selection. A missing/unstarted replacement uses that
checkpoint, while a started temporary-name container is captured by its generation.
Unknown or multiple current writers fail closed. Copies use DELETE journal
mode; this does not enable WAL or relocate storage. Migration/startup use the
selected digest, no pull at startup.
Readiness includes direct Django /api/notifications/ returning 401, HTTPS HTML
root and JSON 401 API response, plus correct Notoli discovery issuer/resource and a 401 MCP challenge with resource metadata. Attempts are bounded by a 90-second
retry window plus at most one in-flight round of bounded requests; Docker exec
times out at 10 seconds and HTTP requests at 5 seconds. Other Docker commands
time out at 300 seconds.

`FAILED.json` is written **before stopping writers**, so process death also
blocks the next deploy. The success record `current.json` is replaced only
after readiness. On migration/startup/readiness failure the backend is stopped,
recovery is preserved, and the operator must select recovery explicitly.
No automatic DB restore can silently discard later writes.
A SIGKILL/host crash still requires the operator to inspect containers and stop
writers before recovery; the persistent marker does not itself stop a process.

The private recovery set contains captured effective runtime (including Env),
app-only Compose, raw old environment, immutable old local image IDs, original
config/script/env evidence, previous release files/record, and verified DB backup.
Retain these plus cached images. The tool never prunes them. Keep recovery files
private and out of logs/tickets. Retained management containers also contain raw
environment and possible DB journals; treat them as private recovery evidence. Command errors intentionally withhold captured
output; diagnose privately using the saved configuration.

## Operator commands after separate authorization

CI invokes the equivalent of:

```bash
python3 "$app_root/incoming/$release_id/release.py" deploy \
  --root "$app_root" --bundle "$app_root/incoming/$release_id"
```

Set `app_root=/root/apps/notoli`; select the exact reviewed release/recovery ID from the
private record. Use a reviewed copy of this new release tool, never the legacy
deploy script. For an approved rollback that can lose post-snapshot writes:

```bash
python3 "$app_root/releases/$release_id/release.py" rollback \
  --root "$app_root" --recovery "$release_id" --restore-database
```

Recovery verifies cached images before stopping the backend, saves the current
DB/journals from the stopped writer too, restores the selected DB with its
original ownership/mode, and recreates **only app services**, no pull. It runs
the same readiness gates and records success only afterward. Failed rollback
stops backend writers and leaves the failure marker/recovery data intact.

If backup/check failed **before migration started**, the operator may instead
restart the captured previous app configuration with all current data (no older
snapshot selection). Current journals are consolidated before container recreation:

```bash
python3 "$app_root/releases/$release_id/release.py" rollback \
  --root "$app_root" --recovery "$release_id" --keep-database
```

That mode is rejected after the recorded migration-started stage. Its safe-data
flag persists through rollback failure, allowing a retry after transient readiness
failure without editing markers or choosing an unnecessary old snapshot. If a crash
occurred before the marker/recovery set was complete, inspect privately and use
a specifically approved recovery plan; do not fabricate a success record.
Rollback is not a substitute for off-host backups and a full functional restore
drill. Both remain deployment acceptance gates.

## Validation and remaining acceptance

Run `python -m unittest discover -s deploy/tests -v` with Docker.
Tests use synthetic credentials, real Compose/container env parsing, real SQLite
backup/restore, and Linux locks with injected migration/backup/readiness failures.
Real Docker recovery rehearsals recreate captured image IDs, commands, raw
environment and DB binds without changing another container; stop a real writer
after a short CLI timeout and a simulated interrupted invocation; and recover a
committed WAL-only row after an unclean exit with the actual single-file bind.
A real recovery retry then replaces the host inode, fails before new startup,
removes the canonical backend, fails during a temporary-name replacement, and
retries successfully without replaying a retired journal or touching a companion.
POSIX transaction tests run in Linux CI (Windows skips them); local Linux Docker
runs can exercise them independently. Shared vhost routing and proxy endpoint
reversal are tested in the infrastructure repository.

After an authorized release, compare the gateway and other app's container IDs,
start times, images and network IDs before/after; verify both sites and a repeat
app release. Full sign-in, password-reset delivery, actual OAuth consent/MCP actions, persistence,
reboot, off-host restores, monitoring and resource evidence are operator
acceptance work, not inferred from these tests. Keep the implementation issues
open until that evidence exists.

## ChatGPT MCP deployment

MCP runs at the canonical `/mcp` endpoint inside the existing ASGI backend.
Keep the backend private, its address `.3`, trusted gateway `.2`, separate
backend egress and Uvicorn `--no-proxy-headers`. App middleware authenticates the
original proxy peer before accepting forwarded scheme/client metadata. The host
infrastructure owns Nginx routes and certificates; never upload or recreate a
proxy through an application release.

The bundle fixes the issuer and frontend origin to `https://notoli.judeandrewalaba.com`.
Changing an issuer invalidates resource-bound grants; coordinate client
reconnection and `plugins/notoli/mcp.json` updates explicitly. Listing metadata
is published separately: follow the [listing workflow](../../plugins/notoli/README.md#listing-metadata-and-updates).
The following registration, write, mail and maintenance actions require the
separately approved operator plan; they are not automatic release probes.

1. In Cloudflare, reuse the existing proxied DNS record and Full (strict) TLS.
   Review Redirect, WAF, Bot, Access, and Caching rules: preserve `/mcp` and
   discovery paths without slash redirects or interactive challenges, and bypass
   cache for `/mcp` and `/auth/mcp/*`. Keep metadata publicly readable. Set
   appropriate login/token rate limits. These are operator changes; repository
   configuration does not change Cloudflare automatically.

2. Register the exact OAuth callback shown in ChatGPT's connection page:

   ```bash
   docker exec -i notoli-backend python manage.py register_mcp_client \
     --redirect-uri "<exact ChatGPT callback URI>"
   ```

   Use client ID `notoli-chatgpt`, token authentication method `none`, and scopes
   `notoli:read notoli:write notoli:share notoli:organize notoli:notifications notoli:delete`
   for complete coverage, or request a subset. No client secret is needed. Existing
   connections must reconnect and approve new permissions. Sharing affects all
   lists/items in the selected board and remains owner-only. Delete tools require
   explicit confirmation of their impact: board deletion removes all lists/items,
   item deletion removes every occurrence, and list deletion preserves items. See the
   [personal connection walkthrough](../../plugins/notoli/README.md).

3. Verify discovery and an unauthenticated challenge before linking:

   ```bash
   curl -i https://notoli.judeandrewalaba.com/.well-known/oauth-authorization-server
   curl -i https://notoli.judeandrewalaba.com/.well-known/oauth-protected-resource/mcp
   curl -i https://notoli.judeandrewalaba.com/mcp
   ```

   Metadata returns JSON; `/mcp` returns `401` with a `WWW-Authenticate` resource
   metadata URL. After linking, try discovery, add one item, mark it complete,
   and revoke the connection in React's `/connections` (**Connected Apps** in the
   profile menu). Verify already-signed-in consent, signed-out login â†’ consent â†’
   callback, Cancel returning `access_denied` with the original state/issuer, and
   revocation preventing access and refresh. Also approve consent without exchanging
   the code: the app must appear in Connected Apps, and revoking it must block exchange.
   Verify read consent discloses collaborator IDs/usernames/emails, and ambiguous
   username/email values cannot share with either matching account. Test reading board collaborators,
   owner-only add/remove with notifications, and rejection of sharing when
   `notoli:share` is missing. On disposable data, test board/list creation and edits,
   complete-set reordering, same-board membership changes, board-wide orphan items,
   deletion cascades/confirmation, and recipient-only notification management.
   Verify missing organize/notifications/delete permissions prompt reauthorization
   and refresh cannot escalate any scope. Check ordinary REST/JWT
   login, list ordering, and collaborator notifications as well. MCP Inspector
   can exercise the protocol before testing ChatGPT. Register its exact HTTPS
   callback as a separate public client if needed.

Nginx passes `/mcp` with buffering disabled, a 120-second read timeout, and
`Cache-Control: no-store`; `/.well-known/*` goes to Django. OAuth JSON endpoints use
the existing `/auth/` proxy location with caching disabled; React's `/connections`
and `/connections/authorize` use the SPA catch-all. `DJANGO_FRONTEND_BASE_URL`
must point to that frontend origin for the browser authorization redirect. Never
cache authenticated consent or connection responses. `/mcp/` is not the
canonical endpoint. The development Compose stack overrides the issuer to
`http://notoli.localhost:8000` (or the selected backend port); ChatGPT testing
requires a reachable HTTPS origin or an appropriate secure tunnel. Set the
issuer, allowed host, and trusted CSRF origin consistently when using a tunnel.

Include `docker exec -i notoli-backend python manage.py cleartokens` in an approved maintenance plan
to remove expired OAuth rows. Never put access/refresh tokens or codes into
deployment logs. Rolling back the code does not require removing OAuth tables;
restore a database backup only if a migration rollback is specifically needed.

The shared release pin includes template-policy regression coverage coordinated
with [FullStackTemplate #217](https://github.com/VanillaIceCube/FullStackTemplate/issues/217)
and [Infrastructure #26](https://github.com/VanillaIceCube/JudeAndrewAlabaInfrastructure/pull/26).
It derives common preflight fixtures from app policy while retaining this app's
existing trust, networks, environment requirements, workflow and runtime bytes.
The same immutable source commit is proposed for all three consumers. These
source-pin PRs do not authorize merging, promotion, or deployment.


## ðŸ”Œ Shared MCP framework

Follow the [MCP framework contract](../../docs/MCP-FRAMEWORK.md) before activating an optional app. Notoli keeps its current MCP profile; MacroMapper ships the framework with MCP disabled. Use this guide for immutable app releases and explicit recovery; framework adoption does not provision a new template instance.
