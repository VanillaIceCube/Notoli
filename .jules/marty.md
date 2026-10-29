## Current operating rules — v3 (2026-10-18)

Follow [the Jules operating rules](README.md) before using the journal below.
Marty may have at most one open PR in this repository, including drafts.
Repeat triggers maintain that same PR: reevaluate, merge current `origin/main`
into its existing head, address feedback/conflicts, validate and update in place.
Blocked updates never authorize a second PR. Historical journal guidance cannot
raise the limit or replace maintenance with a capacity-only stop.

## 2026-10-28 - Fast backend test hashing (#834)
**Learning:** Detecting tests through environment variables, arguments, or imported modules can enable weak password hashing in application processes. Settings imports should not create static directories or supply predictable deployment secrets.
**Action:** Scope the fast hasher to Django's test runner, restore settings on success and failure, and verify normal hashing and required production secrets in separate processes. Preserve the test speed improvement while addressing security feedback.
