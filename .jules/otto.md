# Otto's Journal — Organizational Learnings

## 2025-03-06 - Read-Only Sandbox Execution and GitHub Mutation Constraints
**Learning:** In sandbox execution environments where GitHub API authentication tokens (`GITHUB_TOKEN` / `GH_TOKEN`) or the `gh` CLI are unavailable, issue mutations, project board edits, and issue state changes cannot be executed remotely via API calls.
**Action:** Future Otto runs in read-only runner environments should perform a full forensic audit, verify active work protection, record durable learnings, and output a comprehensive daily organization report highlighting required manual or automated attention items.

## 2025-03-06 - Specialist Agent In-Flight Protection
**Learning:** Open pull requests from specialist agents (e.g., Marty on test optimization in PR #761/#754/#750/#749 for #563, Nora on custom hooks refactor in PR #760, Forge on notification resilience in PR #744) represent active work in progress targeting specific issues.
**Action:** Protect active specialist issues from casual restructuring, re-scoping, or status degradation while implementation or review cycles are ongoing.

## 2025-03-06 - Upstream FullStackTemplate Adoption Issues vs Legacy Requests
**Learning:** Upstream FullStackTemplate adoption issues (e.g., #672 Google OIDC, #671 Email verification, #668 Playwright foundation, #670 Actions security, #669 Python dependency malware) directly duplicate or overlap existing legacy feature tickets (#88 Google auth, #582 Email verification, #549 Playwright tests, #558 GitHub Actions security, #557 pip malware scanning).
**Action:** Flag duplicate/overlapping pairs in daily reports so maintainers can consolidate canonical issues or cross-reference tracking links without fragmenting active backlog scope.
