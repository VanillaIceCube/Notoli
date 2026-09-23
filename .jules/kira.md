# Kira's Parity Journal — Notoli

## 2026-09-11 - Align create-github-app-token to v3
**Learning:** Reusable actions in `.github/actions/` like `prepare-lint-commit` must be pinned to the same GitHub Action major version (`actions/create-github-app-token@v3`) as the top-level workflows (`alert-codeql.yml`, `review-security.yml`, etc.) to prevent version drift across CI automation.
**Action:** When updating `actions/create-github-app-token` across workflows, ensure composite action definitions under `.github/actions/` and their corresponding test suite assertions in `sync-security-alerts.test.js` are updated in lockstep.
