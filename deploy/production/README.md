# 🚀 Production releases and recovery

This guide covers Notoli's app-only release and explicit recovery process.
For local development, use the [deployment README](../README.md). Infrastructure
owns the shared release engine and host ingress; each app owns its configuration,
credentials and operational acceptance.

| Task | Section |
| --- | --- |
| Release an already prepared app | [Release sequence](#-release-sequence) |
| Resolve a failed release | [Failure and recovery](#-failure-and-explicit-recovery) |
| Prepare a host or change settings | [Host preparation](#-host-preparation-and-activation) and [configuration](#-configuration) |
| Review detailed behavior | [Transaction and data capture](#transaction-and-data-capture) |

For an existing deployment, confirm required CI/review on `main`, the exact
reviewed source tree, applicable owner/operator authorization and accepted host
prerequisites before promotion through the existing `env-prod` process. Merging
`main` does not deploy. Initial adoption and migrations retain their specific
procedures below; this guide does not establish their live completion.

## 🚀 Release sequence

1. CI verifies parity before destination credentials or image publication, builds
   full-SHA-tagged backend/frontend images and records their actual immutable
   digests. Every pull, migration and startup uses those digests, never `latest`.
2. CI builds a private bundle identified by `<source-sha>-<run-id>-<attempt>`.
   It contains only app Compose, `app.json`, `release.py`, environment,
   release identity and checksums; never ingress files or certificates.
3. CI reserves a fresh `incoming/<release-id>` directory and uploads only that
   bundle. It never overwrites active files before locking or reuses an attempt.
4. The common transaction validates the candidate, captures matched recovery
   data and verifies backup/restore before migrating. It starts only the two app
   services and records success only after bounded readiness checks.

The staged bundle checksums `app.json`. Release and rollback run offline without
an Infrastructure checkout or code downloads. One transaction file keeps failure
ordering and crash barriers reviewable; app policy is separate from that state
machine.

### Authorized deploy command

Set `app_root=/root/apps/notoli` and resolve `release_id` from the exact reviewed private
release/recovery record. Use a retained, reviewed copy of this release tool,
never a legacy proxy-owning deploy script.

CI invokes the equivalent of:

```bash
python3 "$app_root/incoming/$release_id/release.py" deploy \
  --root "$app_root" --bundle "$app_root/incoming/$release_id"
```

## 🛟 Failure and explicit recovery

The release tool writes plain progress steps to stderr, such as
`Release: Applying database migrations`. Errors name the current step; failed commands
include their exit code, while command output and credentials stay private.
Readiness timeouts distinguish the direct backend API from public routes.
On failure, inspect the app's `FAILED.json` if present and `recovery/` privately;
early failures may leave no complete recovery set. Preserve existing records
before retrying or choosing recovery below.

`FAILED.json` is written **before stopping writers**, so process death also
blocks the next deploy. The success record `current.json` is replaced only
after readiness. On migration/startup/readiness failure the backend is stopped,
recovery is preserved, and the operator must select recovery explicitly.
No automatic DB restore can silently discard later writes.
A SIGKILL/host crash still requires the operator to inspect containers and stop
writers before recovery; the persistent marker does not itself stop a process.

The private recovery set contains captured effective runtime (including Env),
app-only Compose, raw old service environment, immutable old local image IDs,
matched previous release files/record, and verified DB backup. New captures omit
retired root-level Compose/proxy/env files; older recovery archives retain them.
Retain these plus cached images. The tool never prunes them. Keep recovery files
private and out of logs/tickets. Retained management containers also contain raw
environment and possible DB journals; treat them as private recovery evidence.
Command errors intentionally withhold captured output; diagnose privately using the saved configuration.

<a id="operator-commands-after-separate-authorization"></a>

<a id="-operator-commands-after-separate-authorization"></a>

### Authorized recovery commands

Use the same `app_root` and selected `release_id` from the private record.
Run the failed attempt's retained, reviewed `incoming/$release_id/release.py`.
It automatically selects the checksummed `release.py` and `app.json` saved under
`recovery/$release_id/previous-release/`, while holding the existing deployment
locks. The recovered app uses its own readiness policy, including a previously
disabled MCP profile. You still choose the recovery ID and database mode.

Missing, changed, foreign or unrecorded controller/policy data stops recovery
before Docker or database changes; no latest-script or candidate-policy fallback
is guessed. Legacy recovery without an accepted saved release still requires
its separately reviewed procedure. Retain incoming bundles and recovery records.
Older tools that predate automatic selection retain their documented manual
controller choice; do not overwrite those immutable bundles.

For an approved rollback that can lose post-snapshot writes:

```bash
python3 "$app_root/incoming/$release_id/release.py" rollback \
  --root "$app_root" --recovery "$release_id" --restore-database
```

Recovery verifies cached images before stopping the backend, saves the current
DB/journals from the stopped writer too, restores the selected DB with its
original ownership/mode, and recreates **only app services**, no pull. It runs
the saved release's readiness gates and records success only afterward. Failed rollback
stops backend writers and leaves the failure marker/recovery data intact.

If backup/check failed **before migration started**, the operator may instead
restart the captured previous app configuration with all current data (no older
snapshot selection). Current journals are consolidated before container recreation:

```bash
python3 "$app_root/incoming/$release_id/release.py" rollback \
  --root "$app_root" --recovery "$release_id" --keep-database
```

That mode is rejected after the recorded migration-started stage. Its safe-data
flag persists through rollback failure, allowing a retry after transient readiness
failure without editing markers or choosing an unnecessary old snapshot. If a crash
occurred before the marker/recovery set was complete, inspect privately and use
a specifically approved recovery plan; do not fabricate a success record.
Rollback is not a substitute for off-host backups and a full functional restore
drill. Both remain deployment acceptance gates.

<a id="-main-first-promotion"></a>

<a id="main-first-promotion"></a>

## 🧭 Ownership and promotion

Follow the [main-first release policy](https://github.com/VanillaIceCube/FullStackTemplate/blob/main/.github/README.md#main-first-releases).
Develop and review ordinary changes through PRs targeting `main`, then promote
only the exact reviewed source tree through the existing protected `env-prod`
process. A promotion merge may have a different commit ID, but its source tree
must match the reviewed main commit. Preserve required CI, reviews and explicit
owner/operator authorization. The workflow accepts `env-prod` pushes and manual
dispatch selecting that branch; its branch check does not enforce main ancestry.
Merging main does not deploy, and source review does not authorize host operations.

An explicitly owner-authorized deployment experiment must return promptly to
main through review before the next ordinary promotion. Preserve both histories
and newer main work; never reset or force-push to manufacture parity. Intentional
release lag is allowed while prerequisites or acceptance remain unfinished.
History reconciliation does not authorize deployment or require matching live
and main trees. An absent production branch is not a reason to create one.
Use the owner-designated operator and its scoped plan; an explicitly authorized
mission may cover both source and promotion stages. Agent 3's historical ingress
migration assignment is not a permanent operator identity.

Historical reconciliation is recorded in
[FullStackTemplate #262](https://github.com/VanillaIceCube/FullStackTemplate/issues/262)
and [Notoli #975](https://github.com/VanillaIceCube/Notoli/issues/975). The #975
audit reconciled historical promotion merges without reverting reviewed source.

<a id="-shared-implementation-and-app-configuration"></a>

<a id="shared-implementation-and-app-configuration"></a>

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
Infrastructure owns `app-release/v1`, its manifest, tests and workflow template.
`shared_source` in `app.json` pins that source to immutable commit
`96134004e40f38ae76bdad25eb785eeeedd5db51` across all three consumers. CI verifies
the common files and generated workflow, failing on drift or unavailable source.
Change the Infrastructure source, regenerate its manifest, then synchronize all
consumers; never edit only a vendored common file. See the
[release standard](https://github.com/VanillaIceCube/JudeAndrewAlabaInfrastructure/blob/96134004e40f38ae76bdad25eb785eeeedd5db51/app-release/README.md)
for the parity matrix and coordinated update procedure.

Required Actions access variables: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`,
`DEPLOY_HOST_FINGERPRINT` (independently verified SSH host key fingerprint).
Optional `DEPLOY_PORT` defaults to 22. Required access secret: `DEPLOY_SSH_KEY`.
Required app secrets: `DJANGO_SECRET_KEY`, `DJANGO_EMAIL_HOST_KEY`.
Required app variables: `DJANGO_EMAIL_BACKEND`, `DJANGO_DEFAULT_FROM_EMAIL`.
Use `anymail.backends.resend.EmailBackend` or
`django.core.mail.backends.smtp.EmailBackend` explicitly. New bundles reject
retired custom Resend class paths; saved recovery bundles keep their original
settings and matched images/controllers.
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
variables and logs. Release bundles and captured recovery evidence stay private.

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

## 🧱 Host preparation and activation

Infrastructure owns shared Nginx, TLS certificates, ports 80/443, route-network
lifecycle and host capacity. Application releases own only their backend,
frontend, database, immutable images and private release/recovery records.
The gateway must already own ingress and pass its cutover acceptance before
activation. App Compose references existing networks externally. The controller
rejects unexpected route-network members, required app/gateway absence,
app-policy trust/address drift and DB-mount drift. A missing companion app is
allowed so its outage does not prevent this app's release or recovery; gateway
cutover acceptance still requires both apps.

Releases never create/delete networks, publish a backend port, upload TLS/vhosts,
reload the gateway, run whole-project `down`/`remove-orphans` or prune host images.
Local `deploy/compose.yml` and `deploy/nginx.conf` are local/legacy
inputs, never production release inputs. The retired shared-proxy deployment
must not be restored. Preserve installed legacy evidence until the separately
approved transfer/recovery is verified.

The recorded gateway-transfer sequence is Infrastructure cutover, Notoli release
and independent repeat verification, then MacroMapper release and repeat
verification. Check current acceptance evidence before using that migration
plan; this guide does not establish live completion. Shared decisions and host
provisioning belong to
[Infrastructure #4](https://github.com/VanillaIceCube/JudeAndrewAlabaInfrastructure/issues/4).

The release controller verifies running frontend bindings against the accepted
app policy, then checks rendered Compose and Docker against the candidate policy.
Change both Compose and app.json when changing a publication. The current
candidate policies publish no frontend or backend host ports.

The app policy retains the original three shared route networks and Notoli's exact
trusted proxy `172.30.88.2`. Notoli does not depend on YNAB or shared-issuer networks.
Verify or restore that accepted gateway baseline through Infrastructure before
promoting this app policy; app releases never alter shared ingress or create/delete networks.
Preserve existing Notoli OAuth registrations, grants, database and signing secret.
No account linking, client reconnection or grant retirement is required for this
withdrawal because the central migration was never deployed.

Notoli preserves proxy `172.30.88.2`, backend `.3`, ASGI exact-peer trust and
Uvicorn `--no-proxy-headers`. Production publishes no host ports for either
service. The gateway connects to `notoli-frontend:80` on `notoli_default`. The
port 3000 consumer inventory found no direct operational dependency, so
the Compose file and app policy remove both wildcard bindings. Verify Docker
bindings, IPv4/IPv6 reachability from outside the VM, HTTPS, API auth responses,
OAuth discovery and MCP readiness after the app release. See
[Infrastructure #23](https://github.com/VanillaIceCube/JudeAndrewAlabaInfrastructure/issues/23).
Certificates remain host-administered in the legacy path and are excluded
from every app release.

### Port-policy transition prerequisite

The port-removal release requires a healthy accepted Notoli release record
(current.json) whose checksummed app policy permits the existing bindings.
A recovered release requires its retained previous-release app.json and
manifest. Missing saved policy fails preflight; the incoming candidate cannot
substitute for the accepted recovery policy. Use the matched historical
recovery/adoption procedure to establish a verified baseline when records are
incomplete; never fabricate or guess an accepted policy.

For an unrecorded legacy deployment, first use the existing app adoption process.
Review a baseline release that keeps the live approved bindings in both Compose
and app.json, and deploy it through env-prod with the current database. With no
accepted record, preflight uses the incoming policy and rejects a direct change
from legacy port 3000 to no host ports. Once the baseline records its healthy
policy, promote the separate port-removal change.
The Infrastructure #23 migration notes recorded a healthy, checksum-verified
baseline release. Verify the retained record again before a transition.

If the post-start port check fails, the controller stops the candidate frontend
explicitly. The outer failure handler stops the backend and any management
writers by app and service labels, verifies that each writer has stopped, and
retains the failed release record for operator review.

### Private host preparation

The approved operator provisions the app root and its `incoming`, `releases`
and `recovery` children before activation, owned by the deployment identity with
mode 0700. `/root/apps/notoli` is the app root in policy; the existing nonempty, valid SQLite file
must remain at `db.sqlite3`. Staging and releases must share the app filesystem.
The release engine performs no first-install or empty-database bootstrap and
never silently creates or truncates the database.

The host needs working GHCR pull credentials, Docker Engine/Compose with raw
env-file support (the recorded audit used Compose 2.40.3), Python 3 and POSIX
flock support. CI installs no host packages. Shared maintenance and per-app lock
files live outside replaceable releases under `/var/lib/jude-deploy-locks`.
Provision that directory privately and existing regular mode-0600
`maintenance.lock` and `notoli.lock` files with reviewed ownership. Existing
Notoli and MacroMapper releases also retain their respective app locks. Locks
must be protected stable inodes; never replace them, and reject symlinks.

Existing production paths require operator-reviewed access; do not infer that
a non-root uploader works or change database/key ownership blindly. Review
permission changes in the production plan. Initially serialize different-app
releases operationally until peak/concurrent capacity is verified.

<a id="-chatgpt-mcp-deployment"></a>

<a id="-shared-mcp-framework"></a>

<a id="chatgpt-mcp-deployment"></a>

## 🔌 MCP integration

Enabled-app readiness requires `application/json` discovery responses with the
exact app-origin issuer and `/mcp` resource, plus MCP status 401 containing
`resource_metadata="https://notoli.judeandrewalaba.com/.well-known/oauth-protected-resource/mcp"`
in `WWW-Authenticate`. These are bounded unauthenticated release probes;
authenticated consent and product actions remain separate acceptance work.

Notoli owns its OAuth issuer, consent, grants, connections and 32 tools
(the original 31 product tools plus `confirm_change`). The withdrawn central
issuer migration in #973 needs no shared introspection credential or YNAB
acceptance; preserve existing registrations, grants, database and signing secret.
The app policy fixes `DJANGO_MCP_ENABLED=1`; frontend Docker builds default
`VITE_MCP_ENABLED=1`. Changing that reviewed profile requires matching readiness
policy, rather than overriding fixed values in a release environment. Local
examples default MCP off.

MCP runs at the canonical `/mcp` endpoint inside the existing ASGI backend.
Keep the backend private, its address `.3`, trusted gateway `.2`, separate
backend egress and Uvicorn `--no-proxy-headers`. App middleware authenticates the
original proxy peer before accepting forwarded scheme/client metadata. The host
infrastructure owns Nginx routes and certificates; never upload or recreate a
proxy through an application release.

The bundle fixes the issuer and frontend origin to `https://notoli.judeandrewalaba.com`.
Changing an issuer invalidates resource-bound grants; coordinate client
reconnection and `backend/apps/mcp/chatgpt/mcp.json` updates explicitly. Listing metadata
is published separately: follow the [listing workflow](../../backend/apps/mcp/README.md#listing-metadata-and-updates).
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
   docker exec -i notoli-backend python manage.py createapplication public authorization-code \
     --client-id notoli-chatgpt --name "Notoli for ChatGPT" \
     --redirect-uris "<exact ChatGPT callback URI>"
   ```

   Use client ID `notoli-chatgpt`, token authentication method `none`, and scopes
   `notoli:read notoli:write notoli:share notoli:organize notoli:notifications notoli:delete`
   for complete coverage, or request a subset. Keep consent enabled (omit
   `--skip-authorization`) and leave any generated public-client secret unused.
   Check the success message and Django admin: validation failures can exit zero,
   and duplicate IDs leave existing registrations unchanged. Edit existing callback
   allowlists explicitly in admin. Existing
   connections must reconnect and approve new permissions. Sharing affects all
   lists/items in the selected board and remains owner-only. Delete tools require
   explicit confirmation of their impact: board deletion removes all lists/items,
   item deletion removes every occurrence, and list deletion preserves items. See the
   [personal connection walkthrough](../../backend/apps/mcp/README.md#chatgpt).

3. Verify discovery and an unauthenticated challenge before linking:

   ```bash
   curl -i https://notoli.judeandrewalaba.com/.well-known/oauth-authorization-server
   curl -i https://notoli.judeandrewalaba.com/.well-known/oauth-protected-resource/mcp
   curl -i https://notoli.judeandrewalaba.com/mcp
   ```

   Metadata returns JSON; `/mcp` returns `401` with a `WWW-Authenticate` resource
   metadata URL. After linking, try discovery, add one item, mark it complete,
   and revoke the connection in React's `/connections` (**Connected Apps** in the
   profile menu). Verify already-signed-in consent, signed-out login → consent →
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

## 🛠️ Application maintenance

Include `docker exec -i notoli-backend python manage.py cleartokens` in an approved maintenance plan
to remove expired OAuth rows. Never put access/refresh tokens or codes into
deployment logs. Rolling back the code does not require removing OAuth tables;
restore a database backup only if a migration rollback is specifically needed.
Retain prior images, private environment/configuration, recovery sets and stopped
management containers until the host operator reviews disk use and explicitly
selects unused app resources. Never use host-wide Docker pruning.

<a id="-validation-and-remaining-acceptance"></a>

<a id="validation-and-remaining-acceptance"></a>

## 🧪 Checks

Run from the repository root:

```powershell
python deploy/production/build_bundle.py --check-parity
python -m unittest discover -s deploy/tests -v
```

Parity checks the immutable Infrastructure pin, common runtime/tests and generated
workflow. For local source development only, add
`--source-root <infrastructure-checkout>` to `--check-parity` to verify local
common hashes offline; that does not verify the remote pin. Use `--sync` only
after reviewing a coordinated source/pin update across all three consumers.
Synchronization replaces only the verified common files and rendered workflow;
other local files remain untouched. A linked `deploy/` directory is rejected
before writes.
CI always checks the immutable pin.

The full release suite needs Linux and a disposable local/CI Docker daemon,
never production. Windows skips POSIX transaction tests. Fixtures use synthetic
credentials and derive additional required backend values from `app.json`;
production bundling still requires explicit credentials.

Tests use synthetic credentials, real Compose/container env parsing, real SQLite
backup/restore, and Linux locks with injected migration/backup/readiness failures.
Real Docker recovery rehearsals recreate captured image IDs, commands, raw
environment and DB binds without changing another container; stop a real writer
after a short CLI timeout and a simulated interrupted invocation; and recover a
committed WAL-only row after an unclean exit with the actual single-file bind.
A real recovery retry then replaces the host inode, fails before new startup,
removes the canonical backend, fails during a temporary-name replacement, and
retries successfully without replaying a retired journal or touching a companion.
Infrastructure's root routing and proxy-reversal suites were retired;
current repository checks do not establish gateway runtime acceptance.

## Transaction details

<a id="transaction-and-failure-states"></a>

<a id="-transaction-and-failure-states"></a>

### Transaction and data capture

`release.py deploy` acquires shared maintenance then exclusive app lock,
rejecting conflicts rather than waiting indefinitely. The host operator uses
the maintenance lock exclusively for cutover. Initially serialize different-app
releases operationally until peak/concurrent capacity is verified.

Before stopping writers the script checks the payload manifest, immutable app
image identities, topology, fixed trust, existing DB bind, 512 MiB available
memory and 20% disk headroom after allowance for recovery copies. These floors
do not certify representative peak capacity. It resolves/pulls images, captures
private runtime state and produces an **app-only recovery Compose model** pinned
to cached previous image IDs, alongside the matched previous release bundle.
Retired root-level stack files are no longer copied into new recovery sets.
Existing historical archives remain private and use their reviewed procedures;
proxy-owning legacy scripts are not app recovery controllers.

The backend and any surviving app-labelled management containers stop before
SQLite backup. Private `data-state.json` records the exact writer ID or a unique
generation label plus a checksummed complete checkpoint. Capture never guesses by container
start time. It discovers all backend/management writers by labels, including
temporary Compose names, stops them, and copies the selected generation's
DB plus WAL/rollback journal from the stopped container into a private isolated
directory, and recovers that copy. This matters because only the main DB file is
bind-mounted; sidecars can be in the container filesystem. A backup and isolated
restore copy must both pass integrity checks before production checks/migrations. SQLite
copy/restore operations have a 60-second progress deadline. Management
containers carry app/release identity labels and unique names. They are stopped
and verified after Docker CLI timeout; rollback quiesces surviving labelled
containers too. Stopped containers are retained because their journals can be
recovery evidence. Cleanup needs explicit operator review, like image retention.
Management containers join only the app's backend egress network; they do not
contend with reserved backend addresses. Before migration and again before app
startup, verified data is consolidated into the main host DB with its original owner/mode. Before an inode swap, the
complete checkpoint and consumed writer IDs are persisted; their old journals
are retired from future selection. A missing/unstarted replacement uses that
checkpoint, while a started temporary-name container is captured by its generation.
Unknown or multiple current writers fail closed. Copies use DELETE journal
mode; this does not enable WAL or relocate storage. Migration/startup use the
selected digest, no pull at startup.

Readiness includes direct Django `/api/notifications/` returning 401, HTTPS HTML
root returning 200 and public JSON API returning 401. Enabled app policies add
issuer/resource discovery and an unauthenticated MCP challenge; see
[MCP integration](#-mcp-integration) for each app's exact contract. Public probes
use `JudeAppRelease/1.0` and request uncached responses; Cloudflare protections
and policy response checks remain enabled. Attempts use a 90-second retry window
plus at most one in-flight round of bounded requests. Docker exec times out at
10 seconds and HTTP at 5 seconds; ordinary Docker commands default to 300 seconds
with shorter explicit stop/management limits. These readiness checks do not
establish full functional or operator acceptance.

## 🔎 Independent production verification

Use this checklist for each application. Record source revision, deployed image
identity, observation time and result. A local production-settings check verifies
the selected settings; it cannot establish the settings of a running container.

1. In the accepted backend container, run `python manage.py check --deploy`.
   Record check IDs and assess each warning. Verify DEBUG is false, the allowed
   hosts are explicit, and session and CSRF cookies use Secure. Run the ordinary
   and enabled MCP profiles independently when both are supported.
2. Confirm HTTP redirects to HTTPS at the real edge. Review the accepted HSTS
   policy with the domain owner before enabling it. W004 requires that decision;
   W008 may be satisfied by an independently verified gateway redirect.
   For ASGI, verify that only the application's exact trusted proxy can supply
   forwarded scheme/client information.
3. With a nonprivileged test session, inspect auth, protected API and admin
   responses, including redirects and errors, through the public CDN and origin
   gateway. Record status, Cache-Control, Age and cache-hit headers. Check that
   personalized responses cannot be served from cache. Exercise a SPA deep link
   and an unknown API path. Retain only sanitized summaries.
4. List GitHub secret and variable **names** with `gh secret list` and
   `gh variable list`. Reconcile them with the application deploy workflow and
   runbook. Verify actual host key/env/TLS ownership and permissions through an
   authorized read-only host session. Record modes and identities, never values.
5. Inventory signup, login and reset abuse controls. Record any missing rate
   limits explicitly. AI request timeouts and concurrency limits do not establish
   per-user quotas. Track MacroMapper quota and credential rollout through
   [#298](https://github.com/VanillaIceCube/FullStackTemplate/issues/298) and
   [MacroMapper #289](https://github.com/VanillaIceCube/MacroMapper/issues/289).
6. Cite existing sender/domain and reset return-URL evidence. Inbox/Spam delivery
   requires an actual receipt. Reuse historical evidence with its original date.
   New mail and paid AI requests require authorization for those operations.
   Review provenance and unmatched-food behavior in MacroMapper's existing
   tests and acceptance records.
7. Mark each capability passed, failed or blocked, with the evidence type.
   Link independent app receipts. Keep the parent open while required runtime
   checks remain unverified.

After an authorized release, compare the gateway and companion app's container
IDs, start times, images and network IDs before/after; verify both sites and a
repeat app release. Full sign-in, password-reset delivery, actual OAuth consent/MCP actions,
persistence, reboot, off-host restores, monitoring and resource evidence remain
operator acceptance work. Keep implementation issues open until the required
evidence exists. Local tests and source review cannot establish current
production status.

## 📚 Reference

- [Local Docker and deployment guide](../README.md)
- [Backend configuration and behavior](../../backend/README.md)
- [Frontend build and routing](../../frontend/README.md)
- [MCP framework and app contract](../../backend/apps/mcp/README.md#framework)
- [GitHub setup and release policy](../../.github/README.md)
- [Workflow guide](../../.github/workflows/README.md)
- [App policy](app.json), [Compose](compose.yml), [bundle builder](build_bundle.py),
  [release controller](release.py) and [deployment workflow](../../.github/workflows/ci-deploy.yml)
- [Infrastructure release standard](https://github.com/VanillaIceCube/JudeAndrewAlabaInfrastructure/blob/96134004e40f38ae76bdad25eb785eeeedd5db51/app-release/README.md)
