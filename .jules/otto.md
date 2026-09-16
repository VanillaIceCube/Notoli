# Otto's Backlog Management Journal

## 2026-09-16 - REST API Backlog Auditing and Active Specialist PR Shielding

**Learning:** In runner environments where GitHub CLI (`gh`) is not installed, querying the GitHub REST API (`/repos/:owner/:repo/issues` and `/repos/:owner/:repo/pulls`) allows for complete forensic inspection of open backlog issues, PRs, and recent merge history. Active specialist implementation PRs—such as Nora's architectural refactoring (#821, #760, #790), Marty's test acceleration (#818, #816), and Forge's notification resilience (#744)—must be protected from scope rearrangement or ticket restructuring while under review. Reconciling codebase state (such as existing workflow files like `.github/workflows/gate-codeql.yml`) confirms when backlog goals have already been satisfied.

**Action:** Future Otto runs should utilize direct REST API queries when `gh` CLI is absent, verify codebase artifacts before restructuring tickets, and shield active implementation PRs from casual reprioritization or goalpost shifts.
