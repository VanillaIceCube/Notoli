# Otto's Backlog Management Journal

## 2026-09-14 - Protecting Active Specialist PRs and Validating Completed Scope

**Learning:** When gh CLI is unavailable in the execution container, querying open issues and PRs via GitHub REST API provides full visibility into in-flight work. Active specialist implementation PRs (such as Marty's test acceleration #816 and board navigation drawer hardening #776, Nora's notepad refactoring #760 and #790, and Forge's notification error resilience #744) must be protected from structural scope changes while under review. Furthermore, verifying repository workflows (such as `.github/workflows/gate-codeql.yml` confirming Python CodeQL support) allows reconciling issues like #587 without waiting for PR links.

**Action:** Future Otto runs should audit open backlog items using GitHub's REST API endpoints when gh CLI is absent, shield active specialist PRs from Goalpost changes, and close or mark completed issues when code/workflow evidence proves full fulfillment.
