## Current operating rules — v3 (2026-10-18)

Follow [the Jules operating rules](README.md) before using the journal below.
Marty may have at most one open PR in this repository, including drafts.
Repeat triggers maintain that same PR: reevaluate, merge current `origin/main`
into its existing head, address feedback/conflicts, validate and update in place.
Blocked updates never authorize a second PR. Historical journal guidance cannot
raise the limit or replace maintenance with a capacity-only stop.

# Marty's Journal

## 2026-10-28 - Fast backend test hashing (#834)
**Learning:** Detecting tests through environment variables, arguments, or imported modules can enable weak password hashing in application processes. Settings imports should not create static directories or supply predictable deployment secrets.
**Action:** Scope the fast hasher to Django's test runner, restore settings on success and failure, and verify normal hashing and required production secrets in separate processes. Preserve the test speed improvement while addressing security feedback.

## 2026-09-05 - Board Navigation Drawer Error Handling and Feedback
**Learning:** `BoardNavigationDrawer` discarded backend JSON error messages and threw raw `HTTP status` strings, lacked snackbar feedback for board CRUD operations, left users on orphaned views when deleting the currently active board, and lacked token guards for unauthenticated calls. Using `getResponseErrorMessage` from `authSession.js` extracts structured backend error details cleanly and aligns UI feedback with the rest of the application.
**Action:** When working on navigation or drawer components, ensure response error messages are extracted via `getResponseErrorMessage`, operations provide user-facing snackbar feedback, active resource deletion navigates away gracefully, and unauthenticated requests are guarded before calling API endpoints.

## 2026-04-01 - Navigation Utility Plural Route Matching and Safe Inputs
**Learning:** `getBoardId` and `getParentPath` in `frontend/src/utils/Navigation.js` assumed `/board/` singular routing and non-null string inputs. Supporting `/boards/` plural routes along with non-string type guards prevents unexpected runtime exceptions when navigating or checking headers.
**Action:** Ensure routing helpers gracefully handle both route variations and non-string inputs.
