# Jules agent operating rules — v3

Updated 2026-10-18. Active recurring agents: Nora (architecture) and Marty
(general repository health). Their schedules use the v3 Single Open PR and Main
Synchronization prompts. Repository documentation records the intended policy;
the schedule prompt is deployed and verified separately in Jules.

## One open PR per agent per repository

Each agent may have **at most one open PR**, including drafts. The limit applies
independently to Nora and Marty. A repeat trigger maintains that agent's existing
PR instead of finding new work or creating a second branch/PR.

- Query all live open PRs with pagination and identify the persona using title,
  body, branch and author; legacy naming counts. Unknown inventory means blocked.
- With one PR, reevaluate its objective against current main, merged changes,
  other active work, reviewer feedback and checks. Fetch and merge `origin/main`
  into the existing PR head when ahead, safely resolve understood conflicts,
  address feedback and run relevant checks. Push to the same remote branch while
  preserving commits and reviews; never reset or force-push shared history.
- Recheck remote head/state before pushing and main before finishing. Validate
  the latest head SHA and report the included main SHA and any blocker. A healthy
  current PR needs no empty commit or repeated status comment.
- If safe updates are impossible, report the blocker on existing work. An obsolete
  PR needs an owner decision; it does not authorize a replacement or silent closure.
- With multiple legacy PRs, report all and maintain the owner-designated canonical
  PR, otherwise the oldest by creation time then PR number. Do not close distinct
  work automatically. No new PR until the backlog is below the one-PR limit.
- With zero PRs, inventory other agents/humans, relevant issues, recently merged
  changes and rejected attempts. Choose one demonstrated, non-overlapping objective
  and branch from current `origin/main` using `jules/nora/` or `jules/marty/`.
- Refresh inventory immediately before publication. If another run opened an
  agent PR, do not publish a second one. Coordinate existing work or report blocked.
  The prompt is a behavioral rule, not an atomic GitHub lock.

## Scope, evidence and reporting

Nora reduces architectural complexity with clear boundaries and safe sequencing;
Marty makes contained, demonstrated health improvements. Preserve behavior and
security, respect human work, and keep changes focused. Do not weaken gates/tests
to get green. Report checks on the actual head, limitations and PR/main state.
Schedules do not grant approval to merge or deploy.

Otto, Kris and Kira remain retired. Respect their outstanding work; capture new
backlog/parity work only through explicitly scoped owner-directed tasks. Preserve
historical journals. Do not create journal-only PRs or routine activity entries.

This rollout changes future run behavior. Existing excess PRs need separately
reviewed consolidation; installing v3 does not itself merge or close that backlog.
