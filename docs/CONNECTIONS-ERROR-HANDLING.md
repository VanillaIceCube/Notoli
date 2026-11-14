# Connections API response handling

Canonical implementation: [FullStackTemplate #258](https://github.com/VanillaIceCube/FullStackTemplate/pull/258).
Rollout, PRs, exact commits and final CI/deployment evidence: [FullStackTemplate #311](https://github.com/VanillaIceCube/FullStackTemplate/issues/311).
Worktree group: `-04`.

`connectionsClient.js` reuses `authSession.safeReadJson`. Successful responses
must contain a JSON object; unreadable, empty, null, scalar or array success
payloads reject with `Request failed.`. This is a controlled protocol failure;
it does not follow a callback or report revocation as successful.

Failed HTTP responses preserve the first nonblank string in `error_description`,
`detail`, then `error`. Otherwise they reject with `HTTP <status>`. Raw HTML,
plaintext, malformed JSON, parser exceptions and unrelated JSON fields are never
used as fallback messages. Backend error fields remain responsible for providing
public messages; the client does not serialize nested objects or enumerate
arbitrary fields, which could include tokens or private diagnostics.

The focused change preserves URLs, JWT headers, omitted cookies, form encoding,
signed consent tickets and callback behavior. It does not change requestClient's
session refresh policy, provider registrations, scopes, credentials or routing.

## Verification and intentional differences

- The service tests exercise valid consent/decision/list/revoke results,
  structured error precedence and safe fallbacks for HTML 502/504, plaintext,
  empty/malformed bodies, invalid success JSON and unexpected JSON types.
- Integration tests use the real request client with mocked fetch: rotated JWT
  retry, expired refresh credentials, exact consent return path, and transient
  proxy failures retaining the session.
- Existing Connections page and backend OAuth suites cover consent allow/cancel,
  connection listing/revocation and authorization boundaries. Unusual failures
  are mocked; production is never deliberately disrupted.
- FullStackTemplate is the reusable source. Notoli keeps REACT_APP_API_BASE_URL
  compatibility and its additional rejection handling after a refreshed request
  returns 401; its integration fixture also sets that API-base variable.
  MacroMapper keeps its own authSession helpers, meal logging and app-owned MCP.
- Infrastructure is not applicable for code changes: existing `/auth/` backend
  routing and `/connections*` SPA routing already cover the contract. A gateway
  may legitimately return a non-JSON upstream failure; frontend parsing must
  tolerate it. No shared release/proxy/credential edits are required.
- FullStackTemplate has no active production branch or live domain. Notoli and
  MacroMapper use reviewed main-first promotions and their established release
  workflows; live results and any blockers are recorded in the rollout issue.
