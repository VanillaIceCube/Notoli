# Otto's Journal - Backlog & Project Organization Learnings

## 2026-03-31 - Sandboxed Environment GitHub Integration **Learning:** In isolated agent sandboxes lacking the `gh` CLI tool or GitHub API credentials (`GITHUB_TOKEN`/`SECURITY_ALERTS_TOKEN`), external GitHub issues and Project board metadata cannot be directly queried or modified via API commands. **Action:** Perform forensic audits using git commit history, local branch states (`git branch -a`), and documentation files as the local source of truth for development activity and issue reconciliation.
