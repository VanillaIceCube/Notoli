# Otto's Backlog Management Journal

## 2026-09-15 - Protecting Active Specialist PRs and Validating Completed Workflow State

**Learning:** When gh CLI is unavailable in the execution container, querying open backlog issues and PRs via GitHub REST API (`/repos/:owner/:repo/issues` and `/repos/:owner/:repo/pulls`) provides complete visibility into in-flight work and backlog state. Active specialist implementation PRs (such as Marty's test acceleration #816, Nora's notepad refactoring #760 and #790, Kira's token action alignment #800, and Forge's notification resilience #744) must be protected from structural scope changes while under review. Furthermore, verifying existing repository code and workflows (e.g., `.github/workflows/gate-codeql.yml` confirming Python CodeQL support) allows recognizing completed work (such as Issue #587) even when PR links or gh CLI are absent.

**Action:** Future Otto runs should audit open backlog items using GitHub's REST API endpoints when gh CLI is absent, shield active specialist PRs from goalpost changes, and reconcile issue status against actual codebase and workflow evidence.
