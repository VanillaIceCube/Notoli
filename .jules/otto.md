# Otto's Journal — Organizational Learnings

## 2026-03-31 - Read-Only Sandbox Execution and GitHub Mutation Constraints
**Learning:** In runner environments without interactive `gh` CLI credentials or write-permission GitHub API tokens, direct remote issue updates and project board mutations cannot be performed automatically during the audit run.
**Action:** Future Otto runs in read-only environments must perform a full forensic audit against local branch and commit state, record durable learnings, and output a comprehensive daily report highlighting required manual or automated project mutations.

## 2026-03-31 - Specialist Agent In-Flight Protection
**Learning:** Branches or PRs in flight from specialist agents (e.g. Marty's test optimizations or Nora's hook extractions) represent active work in progress targeting specific backlog areas.
**Action:** Protect active specialist issues from casual restructuring or status degradation while implementation or review cycles are ongoing.
