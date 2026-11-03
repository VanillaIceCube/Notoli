# Authentication/frontend adoption audit

Tracking: [FullStackTemplate #255](https://github.com/VanillaIceCube/FullStackTemplate/issues/255).
Audit date: 2026-11-02 (Pacific). Initial main `44031f81889fe23361b344e3c212bb08b10fd0dc`;
initial production `689edf124e53ebc54bdc79645cd7c642d9efccd9`. Relevant application code matched on those
branches; main additionally contained reviewed dependency/CI updates. The owner
confirmed main-first promotion including those reviewed prerequisites.

Canonical merges:

- [#168](https://github.com/VanillaIceCube/FullStackTemplate/pull/168), `0e6aef3d05f6ddefd3b1d30e2d92cd4c29a33fc4`: registration validation and auth pending/error states.
- [#120](https://github.com/VanillaIceCube/FullStackTemplate/pull/120), `53b7909f2761f9a43c24a496961062d75c4a6c05`: headers and profile persistence.
- [#137](https://github.com/VanillaIceCube/FullStackTemplate/pull/137), `13d96b26f0de2a666d487cfbcce53ef42abb0fcb`: notification retry/action states and transactions.

| Area | Applicability and implementation |
| --- | --- |
| Registration | Missing validators; validate candidate username/email before user creation. Regressions cover weak/common/numeric/similar/non-string passwords. |
| Reset | Existing user-aware password validation and generic forgot-password response already satisfy the canonical behavior. |
| Auth forms | Missing pending states; add progress, duplicate-submission guard and failure recovery to all four forms. |
| Headers | Native Headers lost during refresh retry; normalize supported forms, preserve custom headers, replace case-variant auth only on retry. |
| Refresh | Existing single in-flight refresh, one retry, invalid credential cleanup and transient-failure retention preserved. |
| Profiles | Trim strings and clear stale/blank profile keys on new sessions. |
| Notifications | Retry load failures, keep failed items visible, guard item/bulk actions through parsing, and prevent navigation on failed/malformed mark-read. Bulk operations use explicit transactions. |
| Security | Preserve recipient-only queries, per-app OAuth issuer, MCP scopes/consent/revocation and proxy trust; no provider, secrets or infrastructure change. |

Notoli preserves seeded boards, preferred-board login landing, validated consent return URLs (including expiration on background requests), notification board/list context and Connected Apps. Its API client already omits missing-token Authorization headers.

## Release acceptance and data-safe recovery

Use the existing app-only release pipeline after reviewed main integration. The
promotion tree must exactly match approved main source. SHA-tagged builds deploy
immutable image digests recorded with source in private host `current.json`.
This change adds no migrations; compare the full production diff before promotion.
Record known-good source/images/release IDs in #255 and retain cached images and
private recovery files. Stop further promotion if verification fails.

Follow the [release guide](../deploy/production/README.md).
`--keep-database` is supported only before the recorded migration-started stage.
Never restore an older DB without separate authorization. After migration start,
a data-preserving code revert must be reviewed on main and promoted through the
pipeline with forward migrations; obtain a specific recovery plan if unsafe.

Read-only VM acceptance covers source/digests/container health/restarts, gateway
and companion identity, public frontend, auth/notification authorization, separate
OAuth discovery and MCP challenges, and sanitized error counts. Authenticated
sign-in/valid refresh, email delivery, notification mutation, consent and MCP
operations remain test-suite evidence rather than live probes: no real accounts
or user-data writes are needed. Final CI/merge/promotion/runtime evidence belongs
in #255; this source audit does not claim production delivery has occurred.
