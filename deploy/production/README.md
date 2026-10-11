# App-only production release and recovery

This is the implementation of approved architecture v2. Every PR merge and
every production release still requires separate explicit owner authorization.
Agent 3 is the sole production operator. Shared decisions:
[Infrastructure #4](https://github.com/VanillaIceCube/JudeAndrewAlabaInfrastructure/issues/4).

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
SQLite backup. The tool selects the most recently started writer, copies its
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
into the main host DB with its original owner/mode. Copies use DELETE journal
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
POSIX transaction tests run in Linux CI (Windows skips them); local Linux Docker
runs can exercise them independently. Shared vhost routing and proxy endpoint
reversal are tested in the infrastructure repository.

After an authorized release, compare the gateway and other app's container IDs,
start times, images and network IDs before/after; verify both sites and a repeat
app release. Full sign-in, password-reset delivery, actual OAuth consent/MCP actions, persistence,
reboot, off-host restores, monitoring and resource evidence are operator
acceptance work, not inferred from these tests. Keep the implementation issues
open until that evidence exists.
