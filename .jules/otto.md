# Otto's Journal — Organizational Learnings

## 2025-03-06 - Read-Only Sandbox Execution and GitHub Mutation Constraints
**Learning:** In sandbox execution environments where GitHub API authentication tokens (`GITHUB_TOKEN` / `GH_TOKEN`) or the `gh` CLI are unavailable, issue mutations, project board edits, and issue state changes cannot be executed remotely via API calls.
**Action:** Future Otto runs in read-only runner environments should perform a full forensic audit, verify active work protection, record durable learnings, and output a comprehensive daily organization report highlighting required manual or automated attention items.

## 2025-03-06 - Specialist Agent In-Flight Protection
**Learning:** Open pull requests from specialist agents (e.g., Marty on test optimization in PR #749/#750, Forge on notification resilience in PR #744) represent active work in progress targeting specific issues (e.g., #563).
**Action:** Protect active specialist issues from casual restructuring, re-scoping, or status degradation while implementation or review cycles are ongoing.
