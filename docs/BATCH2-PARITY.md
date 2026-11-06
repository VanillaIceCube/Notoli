# Batch 2 adoption and acceptance record

FullStackTemplate owns reusable app patterns; Infrastructure owns `app-release/v1`.
Evidence is per repository and per protected PR head. Ticket states alone do not
establish acceptance. Dates below are UTC unless a local test log says otherwise.

## Reviewed increments

| Repository | A: security | B: tooling | C: validation/browser/diagnostics |
| --- | --- | --- | --- |
| FullStackTemplate | [285](https://github.com/VanillaIceCube/FullStackTemplate/pull/285), merge `8c540a35212e829bcecff7566d276e160380de65` | [288](https://github.com/VanillaIceCube/FullStackTemplate/pull/288), merge `d222dcdaba2f1c14244a3dd6117f5632e289c5c3` | Branch `codex/batch2-diagnostics`, protected checks required before delivery |
| Notoli | [1008](https://github.com/VanillaIceCube/Notoli/pull/1008), merge `223aed21bea4632b250ac1ade2c036ef14a43257` | [1010](https://github.com/VanillaIceCube/Notoli/pull/1010), merge `c9f8f26739c378a739c69165b549736afd689dc4` | Branch `codex/batch2-diagnostics`, protected checks required before delivery |
| MacroMapper | [367](https://github.com/VanillaIceCube/MacroMapper/pull/367), merge `ab98948f120e566bb4993b3e3eba1804e15dbfe6` | [369](https://github.com/VanillaIceCube/MacroMapper/pull/369), merge `c803fd2d48e1ea76b2dd4e2acd9e0d0e3fec8b2a` | Branch `codex/batch2-diagnostics`, protected checks required before delivery |
| Infrastructure | [116](https://github.com/VanillaIceCube/JudeAndrewAlabaInfrastructure/pull/116), merge `0417fcbaa23cc3356e96164684ed88c0843a0df7` | Shared-source adoption is in A; no app development image | [120](https://github.com/VanillaIceCube/JudeAndrewAlabaInfrastructure/pull/120), merge `f7fd326c015045f8aa66446ca998fb3cfcedfd1f` |

A/B final-head checks and configured persona reviews passed before normal merges;
C application delivery still requires its final-head CI/reviews and promotion.
No check removal, stale-head approval, bypass or blocking-review dismissal is used.

## Capability matrix

M = matching implementation (normalized LF bytes compared); E = tested equivalent;
D = intentional difference; N/A = no corresponding capability; B = blocked upstream.
PR adoption references are in the increment table above.
Normalized-LF SHA256 comparisons are recorded in [BATCH2-PARITY-HASHES.json](BATCH2-PARITY-HASHES.json).
Repo-specific grants, path filters and profile settings intentionally differ;
shared regression cases establish equivalent behavior for these variants.

| Capability / source | Template | Notoli | MacroMapper | Infrastructure | Verification |
| --- | --- | --- | --- | --- | --- |
| Immutable Actions and least privilege; existing Macro pins brought back into Template, A285 canonical policy | M A285 | M A1008 | M A367 | E A116/C120; its own grants/Required CI | Parsed YAML and seven policy cases, platform-base grants regression, Actionlint, exact-head CI; live readback below |
| Changed-version npm malware; Template243 / A285 | M A285 | M A1008 | M A367 | N/A, no npm application graph | Identical review.cjs; missing base/head, ref/version/API failures, bounds and findings regressions; actual CI scan |
| Python malware research; Template A285 decision | M A285 | M A1008 | M A367 | N/A app pip gate; security guidance applies | Candidate/cost/privacy/graph decision in PYTHON-MALWARE-DECISION.md; reject new blocking vendor/integration |
| CodeQL default branch and PR scope; existing source coverage/Batch1 retained | E three languages | E three languages | E three languages | E three languages, its independent orchestration | Actual main analyses and PR evidence; Notoli main B has exactly Python/actions/JS uploads and empty error/warning fields |
| Shared release contract; Infrastructure source `7ec4486827d15137dbc6b87e7b5cb5cbe3d0ea6b` | M pin A285 | M pin A1008 | M pin A367 | Canonical A116 | Source manifest plus each app check_parity.py; approved Action template upgrade passes, old template and unauthorized drift fail |
| Dev dependency entrypoint; Notoli662 origin, Template B288 hardened | M B288 | M B1010 | M B369 | N/A app node_modules volume | Identical entrypoint/lifecycle tests; failed install + reverted manifest; actual CI images and named-volume lifecycle |
| Dev Miniforge/Node digest policy; Template B288 | E app settings | E B1010; production builder also moves off unsupported Node25 | E B369 | D independent gateway images | Registry multi-platform digest verification, CI image builds; no shared gateway base migration |
| Repository-file validation; Template C | M C | M C | M C | E existing shellcheck/Compose/Python/manifest checks | Identical synthetic validator and verified Actionlint installer; no private env loading or deployment |
| Mocked Responses/history/lint tests; Template C | M C | M C | M C | E C120; lint push N/A | Identical custom test file; actual composite execution, mocked curl/gh/git/API; existing publisher/alert/Dependabot suites retained |
| Prior review context; Notoli origin `2fd6c733e64ef260514967ced2445d5e69bd892f` | M backport C | M existing | M existing | M existing | Identical action bytes and shared ordering/identity/untrusted-context tests |
| Bounded test diagnostics; Template C | M C | M C | M C | E C120 preprocesses through existing ci_report.py | Identical helper/test, early/middle/late failures, random delimiter and caps; old reporter/gateway/snapshot source preserved |
| Playwright auth foundation; Template C | M three journeys | M plus one board/list/task collaboration case | M three journeys | N/A no browser app | Identical shared harness/config/auth cases; isolated SQLite/file mail, session boundaries and failure cases; capped failure evidence |
| Unit test speed tuning; Notoli C | E bulk fixture setup, own small-suite pool | D Node + isolated VM fork projects, UI dependency optimizer | E bulk fixture setup, own small-suite pool | N/A app test runner | Full assertions retained and typed happy paths; compare serial supported-runtime measurements, not unrelated machine timings |
| TypeScript7; Macro224 | N/A no direct TypeScript7 upgrade | N/A no direct TypeScript7 upgrade | B retain ~6.0.3 | N/A no frontend lint stack | Released parser/utilities8.72.1 require >=4.8.4 <6.1.0; docs/TYPESCRIPT-COMPATIBILITY.md in Macro |

Live settings were independently changed/read back after A source compliance in
all four repositories: read-only workflow token default, workflow-token PR
approvals disabled, SHA pinning required, Actions enabled. `allowed_actions: all`
is intentionally retained for existing workflows; review/source controls remain
necessary. Explicit scoped GitHub App credentials still support configured
reviewers/deployment. PR and Dependabot/fork logic has mocked regression coverage;
no new live fork was generated. Existing immutable CodeQL Dependabot PR
[Macro364](https://github.com/VanillaIceCube/MacroMapper/pull/364) proves update
discovery remains active; it is not silently merged as part of Batch2.

## All 19 ticket dispositions

| Ticket | Disposition and remaining acceptance |
| --- | --- |
| Template239 | Implemented A across four repos; final C integration evidence and external fork limitations remain explicitly recorded. |
| Template52 | Implemented A; verified upstream pins/comments, existing local refs preserved, live enforcement staged after compliance; Dependabot discovery retained. |
| Template243 | Implemented A in three apps; Infrastructure N/A. |
| Template45 | Implemented research decision A: reject new blocking integration under current graph/evidence constraints; no paid service, new secret or implementation project. |
| Notoli612 | Existing default-branch three-language coverage proved; Node24-native dependency-review/token actions adopted, paths-filter already native Node24. No duplicate analyses. Protected tracker remains read-only. |
| Notoli587 | Already satisfied coverage retained and actual Python main/PR attribution verified; protected tracker remains read-only. |
| Notoli864 | Implemented B Router7.18.5; actual Dependabot97/99 fixed at 2026-11-06T05:51:57Z. No SSR runtime exists; SPA behavior tested. |
| Notoli967 | Implemented B by removing Jest's vulnerable deepmerge dependency path; Dependabot141 fixed at the same timestamp. |
| Notoli949 | Implemented A unused re-export removed without changing exception identity; CodeQL65 fixed at 2026-11-06T05:05:36Z. |
| Infra21 | Implemented A explicit raise in ingress request helper; CodeQL1 fixed at 2026-11-06T04:56:07Z. |
| Template49 | Implemented C; reviewed CI required for all app validators, Infrastructure existing equivalent retained. Documentation whitespace checked; no unreliable external-link crawling. |
| Template50 | Implemented C with risk inventory and mocked high-risk paths; Batch1 coverage retained. Real provider/service behavior is a documented external boundary. |
| Template51 | Implemented C across all four; original statuses preserved with bounded early/failure/late evidence. |
| Template44 | Implemented C foundation and minimal existing Notoli domain fixture; no new product behavior. Final reviewed CI and fresh documented setup establish adoption. |
| Notoli563 | Measurement and tuning implemented C; final comparable frontend timing pending. Backend bottlenecks documented, no backend speedup claimed. Protected tracker stays read-only; do not claim an unmeasured improvement. |
| Template64 | Implemented B across all three app dev stacks with real CI volume lifecycle; Infrastructure N/A. |
| Notoli715 | Remaining Jest/Babel test migration implemented B; existing Vite build/env/output interface preserved, all301 tests pass. Protected tracker stays read-only. |
| Macro224 | Blocked upstream; retain supported TypeScript6.0.3 with exact released-peer evidence, no incompatible override/retry. |
| Notoli964 | Implemented A in Infrastructure source and all three pins; approved upgrade positive/unauthorized drift negative pass without weakening parity. |

Trigger-labeled scoped trackers (Notoli612,587,563,715) are read-only. Security
aggregation owns its generated issue lifecycle; scanner evidence above is separate
from issue closure. No jules/codex label was added, removed or replaced.

## Measurements and production boundaries

Supported-runtime independent VM pair: Node24.22.2/npm11.19.1, 0.75 CPU/768MiB,
512MiB heap, cold caches, network disabled for tests. Baseline7f1db4c Jest
63.391s (65.044s container wall); initial B Vitest151.839s (154.103s wall),
all301/32 pass in both. The initial migration is 137% slower. npm installs are
separate (36.021s vs33.019s). Backend190 tests/one existing skip:24.256s vs25.723s.
The final tuned C candidate needs a supported-runtime repeat with the configured
projects (no --pool override); no speedup is claimed from an unrelated local run.

The shared browser foundation observed a pre-existing Notoli maximum-update-depth
route warning. The same journey also passes and emits the warning on baseline
7f1db4c. UI rendering refactoring is outside Batch2; no warning assertion or
coverage was removed. Authenticated production journeys remain untested because
verification must not create real users or mutate production data.

FullStackTemplate has no env-prod production branch and none is created.
Infrastructure A promotion118/run42166006596 accepted source54d1743e8cd0beb98dbc7f8daa0c0f87bb59d98f
with unchanged gateway runtime source6baeaf178811c792639f494a6db202e686a2e1f1;
all five container identities/start times/restart counts/networks stayed unchanged.
App promotions are coalesced after C to avoid repeated releases. The documented
app pipeline rebuilds/deploys changed manifests/build inputs; no new release engine
or advanced rollback feature is introduced.

Independent VM tests used isolated task resources. After disposable DIND work,
the host's default bridge object remained but physical docker0 was absent. Cause
is unconfirmed: temporal association does not establish a deletion actor or prove
shared-network noninterference. Production custom networks/containers and public
health stayed unchanged. No host network repair, restart or indiscriminate pruning
was performed. Registry-only install/audit used scoped host networking; tests ran
with network none. Production recovery paths were inspected, never exercised;
no database restore, production mail/model call or real account mutation occurred.
