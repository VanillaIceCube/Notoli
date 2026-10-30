# Central MCP OAuth migration (#973)

Source preparation proceeds in parallel with Infrastructure's authorization
service. The Infrastructure root operator coordinates integration and all live
operations. **`env-prod` promotion activates central mode** and waits for actual
YNAB acceptance in both ChatGPT and Codex under
[Infrastructure #62](https://github.com/VanillaIceCube/JudeAndrewAlabaInfrastructure/issues/62),
the reviewed service delta, and the exact app release checkpoint. A `main` merge
does not deploy. Automated tests do not establish live client acceptance.

## Fixed contract

| Setting | Value |
| --- | --- |
| Issuer | `https://auth.judeandrewalaba.com` |
| Discovery | Issuer `/.well-known/oauth-authorization-server` |
| Authorization / token | Issuer `/o/authorize/`, `/o/token/` |
| Revocation / management | Issuer `/o/revoke_token/`, `/o/authorized_tokens/` |
| Resource | `https://notoli.judeandrewalaba.com/mcp` |
| Public clients | `notoli-chatgpt`, `notoli-codex`; code/S256, token auth `none` |
| Introspection | Issuer `/o/introspect/`; HTTP Basic `notoli-introspection` |
| Scopes | `notoli:read`, `notoli:write`, `notoli:share`, `notoli:organize`, `notoli:notifications`, `notoli:delete` |

Infrastructure registers the clients separately using their **actual** callbacks.
ChatGPT uses exact HTTPS callbacks; Codex's approved literal loopback callback
follows the issuer's RFC8252 policy. Never invent callbacks, use wildcards, or
reuse another app's client registrations. Request only needed scopes. Central
login/consent occurs at the issuer; ordinary Notoli login/REST JWTs stay unchanged.

`DJANGO_MCP_AUTH_MODE=legacy|central` defaults to `legacy` locally. Central mode
requires the fixed Notoli origin and `MCP_INTROSPECTION_CLIENT_SECRET`.
Invalid configuration fails startup; issuer outage never falls back to legacy.
The introspection-only credential is restricted to Notoli's resource and cannot
issue tokens. The same-named Actions secret travels through the existing private
`.backend.env` bundle contract; no new mount or shared release-engine extension.
Host root, Docker administrators and principals able to inspect/exec the backend
can read it. Treat bundles, effective Docker environment, retained containers and
recovery files as privileged; keep secrets out of logs, artifacts and tickets.
Rotate issuer/consumer credentials together under containment.

Introspection uses verified TLS, no redirects/environment proxy or result cache,
a three-second total streaming deadline and a 16 KiB response limit. It requires
literal `active: true`, exact issuer, canonical UUID subject, exact scalar or
singleton audience, allowed Notoli client, known scopes including read, integer
issuance/expiry and at most 900 seconds lifetime. The issuer checks JWT signatures,
keys and current grants. Every HTTP request and tool operation rechecks the grant,
active link/user and local board permissions. Revocation applies on the next check;
an operation already authorized can finish. Outages, invalid replies and
expired/revoked/cross-app tokens deny MCP without affecting ordinary app auth.

## Explicit account linking

Apply the additive `integrations` migration through the normal app release.
Verify the immutable central subject and **existing active Notoli numeric user
ID** privately. Never infer an email identity, create users or grant membership.
Under the approved app maintenance plan, run in the selected backend image:

```sh
python manage.py link_mcp_identity --subject '<verified central UUID>' --user-id '<existing ID>'
```

The command refuses existing links and rebinding to another user. Add `--disable`
or `--enable` with the same arguments for explicit state changes. A unique
`(issuer, subject)` constraint prevents ambiguous links. Link records and subject/
user IDs are private account metadata; retain sanitized acceptance evidence.
Linking creates no OAuth grant or local role.

## Cutover and independent acceptance

1. Record real YNAB two-client acceptance and the Infrastructure checkpoint.
   Review immutable images, all CI/reviewer gates and the canonical framework pin.
   Preserve prior app images, private recovery configuration and DB backup.
2. Infrastructure privately provisions separate clients, actual callbacks and
   the resource-bound introspector. Provision its matching Actions secret and
   verified local identity link under the authorized plan. This source change
   provisions no credentials or ingress.
3. Review Cloudflare no-cache/no-challenge rules for `/mcp`, discovery and legacy
   `/auth/mcp/*`, plus independently owned issuer routes. Preserve the existing
   Notoli networks, proxy `172.30.88.2`, backend `.3`, TLS and app-only deployment.
   The central app policy requires the gateway's exact five-network baseline:
   existing `notoli_backend_private`, `notoli_default`, `macromapper-ingress`,
   plus internal `ynab_mcp_private` (`172.30.89.0/29`, proxy `.2`) and
   `mcp_auth_private` (`172.30.92.0/29`, proxy `.2`). Only the gateway and the
   corresponding `ynab-mcp-gateway-1` / `mcp-auth-server` are allowed on those
   private routes; the gateway is required and companion absence remains allowed
   for independent app recovery. Notoli joins neither new network. Infrastructure
   must accept the matching enabled gateway baseline before this app promotion.
4. Promote the reviewed `env-prod` candidate at the cutover checkpoint. App policy
   fixes central mode. Readiness checks protected-resource metadata pointing to
   the central issuer, local issuer discovery 410 `issuer_moved`, anonymous MCP
   401 with resource metadata, and ordinary HTML/REST health.
5. Reconnect ChatGPT and Codex independently. Verify central account/consent,
   least privilege, 31-tool discovery, own/shared board reads, an approved scoped
   write and unchanged website login/refresh/REST/sharing. Check foreign-board
   denial, foreign/expired/revoked tokens, link disablement and issuer outage.
   Use synthetic or approved records; record sanitized results and cleanup.
6. JWT-protected `/connections` links to central grant management. Local MCP
   authorize/token/revoke endpoints return 410 and local registration is disabled.
   Local grants are retained but cannot authorize central MCP. Old clients must
   reconnect; refresh cannot escalate scopes. After both clients and rollback are
   accepted, retire old local grants through explicit approved maintenance.

The new portable plugin version targets central endpoints. Publishing it is a
separate post-cutover action; do not upload while legacy is live. This source
change does not modify an installed personal plugin or current connection.

## Containment and rollback

Use the existing app-only release/recovery procedure. Prefer a reviewed rollback
candidate selecting `legacy`, retaining the additive link table and current
business data. Fixed central app policy rejects a host environment override;
retain the previous immutable images and private release configuration. A new
legacy-mode candidate can retain the five-network gateway policy. App release/
recovery never changes shared gateway/issuer state or restores a historical
business DB casually.

Restoring an original legacy bundle with its three-network gateway policy needs
a bounded coordinated sequence: the Infrastructure operator first accepts the
explicit **disabled** YNAB and authorization profiles (retaining both 410
hostnames), verifies their containment and the matching three-network gateway
baseline, then performs the matching app-only recovery. Keep the existing network
objects, companion app containers and private recovery evidence. Never switch
exposed hostnames implicitly to `base`, delete shared networks, or let an app
release recreate ingress. Re-enabling either route is a separate root-coordinated
step after the matching consumer/gateway policy and acceptance checks are ready.

Central revocation does **not** revoke retained legacy grants. Before reopening
legacy issuance, explicitly invalidate local MCP codes/access/refresh grants
under the reviewed maintenance plan and reconnect clients to the legacy issuer.
Revoke central Notoli grants when abandoning the cutover. A DB restore can
resurrect local grants and requires explicit invalidation before reopening MCP.
Verify both clients, old-token denial, ordinary app behavior and recovery health.
Never reverse the additive migration or silently reactivate old grants.
