# Automation coverage and failure diagnostics

FullStackTemplate owns reusable behavior; application/Infrastructure variants
are exercised by the same mocked regressions. These automation tests use no production secrets,
live GitHub writes, or a paid model request.

| Behavior / risk | Coverage and boundary |
| --- | --- |
| Dependabot policy, exact-head readiness, concurrent close and narrow HTTP422 recovery (high) | Existing Batch1 suites retained; final-head native policy/CI checks remain required. |
| Alert grouping, complete unique source coverage and interrupted Project writes (high) | Existing Batch1 mocked fault/retry suites and repository-specific mappings retained. |
| AI verdict publication and blocking reviewer gates (high) | Existing publisher/gating tests retained; real configured persona checks verify current-head App access. |
| PR changed-version npm malware selection/evidence (high) | Shared read-lock, selection, batching, pagination, request bounds, missing evidence/failure and finding tests. Infrastructure N/A: no npm graph. |
| Workflow pinning and write grants (high) | Parsed-YAML cases include flow/quoted/sequence forms, aliases, invalid grants, platform-base policy authority and self-authorizing proposed policy regression. |
| Responses request construction and failure text (high) | Execute the actual composite Bash with synthetic credentials and mocked curl; validate JSON, tools, budget, prompt preservation and unavailable paths. Network is never used by these tests. Publisher coverage separately proves unavailable output cannot approve. |
| Prior reviewer identity/history and untrusted discussion (medium) | Execute the actual github-script body with mocked reads/writes; verify persona history, ordering, human association/body caps, reply caps and visible API failure. Human text is evidence, never authority. |
| Lint attribution/push credentials (high) | Execute the composite with mocked gh/git: valid identity, missing slug and invalid numeric ID. Infrastructure N/A: it has no lint autofix/push action. |
| PR diff acquisition (high) | Existing Python fixture tests retain full/oversized/failure behavior; live credential/read API availability remains an integration boundary. |
| Shared release parity and recovery (high) | Infrastructure-owned manifest, source-pinned app suites, approved template-upgrade positive test, unauthorized drift negatives, disposable Docker profiles. Never edit vendored copies independently. |
| Development entrypoint (medium) | Mocked failed install/reverted manifests and command status; actual CI images plus fresh/unchanged/changed named-volume cases. |
| Early/middle/late diagnostics (medium) | Synthetic long-output regression retains all three failure positions, random output delimiters and bounded artifacts. Existing pipeline exit codes still determine success. |

Application automation runs on `.github/**`, scripts, deploy, tests and maintained
docs changes. Actionlint plus safe YAML/composite validation, Bash syntax parsing,
PowerShell parser-only validation, Python AST parsing and synthetic Compose `config`
run without deployments or private environment files. Infrastructure retains its
existing stronger shellcheck/Compose/manifest/RequiredCI strategy instead of an
application clone. Markdown uses `git diff --check`; no brittle external-link crawler
is introduced. Actionlint's only compatibility exception is the existing newly
supported GitHub `vulnerability-alerts` scope, not a generic syntax waiver.

Summaries retain bounded early/failing/late context (<=16000 characters). `tee`
keeps full original output in the job log. Failure artifacts keep at most roughly
1MiB per captured log and expire in7days. Summary/output delimiters are unpredictable.
Infrastructure preprocesses through the shared summarizer before its existing
reporter, avoiding the overlapping open Marty #52 reporter changes. The current
reporter and gateway/snapshot source files are preserved.

Untested locally or intentionally external: GitHub service/rate-limit behavior,
real App installation/secret access on forks and Dependabot, edge security policy,
actual package-provider detection of new unknown malware, provider billing/model
quality, and production rollback restore. Use real configured required checks and
independent scoped production read-only verification for their respective evidence;
no synthetic test result substitutes for them. FullStackTemplate has no production target; Notoli and MacroMapper retain independent releases.
