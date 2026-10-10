# Otto's Backlog Management Journal

## 2026-09-19 - Scheduled-Agent PR Reconciliation Before Active-Work Protection

**Learning:** Scheduled recurring agents (such as Marty 🦀 and Kira 🦐) generate automated PRs on fixed intervals. Over time, multiple open PRs addressing identical objectives accumulate (e.g., Marty test acceleration PRs #834, #829, #822, #818 vs #749-#768, and Kira GitHub App Token action alignment PRs #833, #800, #767). In accordance with Otto's reconciliation mandate, PR deduplication and overlap classification MUST occur prior to applying active-work protection. Blindly protecting every open PR as independent active work conceals duplicate clusters and inflates organizational noise.

**Action:** In all future daily runs, inventory and compare all active PRs first. Group repeated scheduled-agent PRs by underlying objective, surface duplicate clusters under `Attention Needed` (or resolve when conclusively authorized), and protect only distinct, non-duplicate active implementation.
