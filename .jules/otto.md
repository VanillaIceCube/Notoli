# Otto's Backlog Management Journal

## 2026-09-17 - Direct REST API Backlog Forensic Review and Active Specialist Shielding

**Learning:** When executing in runner environments where `gh` CLI binary is unavailable, direct Python REST API queries (`/repos/:owner/:repo/issues` and `/repos/:owner/:repo/pulls`) offer complete forensic visibility over open issues, PRs, and recent merge history. Active specialist implementation PRs—such as Marty's backend test suite acceleration (#829, #822, #818), Nora's React hook refactoring (#821, #790, #760), Forge's CRUD resilience (#744), and Kira's GitHub App token action alignment (#800)—must be protected from scope rearrangement or ticket restructuring while under review. In addition, upstream adoption epics (#668–#676) explicitly block on FullStackTemplate and must remain as external upstream dependencies rather than being split or prematurely closed.

**Action:** Future Otto runs should leverage Python REST API scripts when `gh` CLI is absent, cross-reference active implementation PRs before making ticket adjustments, and safeguard active agent PRs and upstream-blocked work from unnecessary reorganization or reprioritization.
