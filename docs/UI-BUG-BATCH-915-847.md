# Menu dismissal and pull-to-refresh

## Scope and causes

Issue #915's Share/Rename/Remove symptom belongs to the board drawer menu.
Task rows instead expose Rename/Reorder/Remove. Closing the drawer menu cleared
`selectedBoard` before MUI Grow completed its exit, immediately removing the two
owner-only actions. Selection now survives until `onExited`; reopening replaces
selection and cancels the old exit. Direct menu children preserve MUI keyboard
navigation, and a named, focusable action button receives restored focus.
Task row actions retain their existing behavior and receive browser coverage.

Issue #847's notepad shell moved content in three independent ways: a translated
wrapper, changing paper bottom padding, and the indicator's animated height/margin.
Releasing a pull reset translation/padding while the indicator was still changing
height. A single proportional indicator spacer now owns displacement, holds space
during refresh, and collapses on completion. Paper padding stays constant.
The existing touch hook and request callbacks remain in use. Cancellation cannot
trigger refresh; overlapping refreshes are ignored; thrown/rejected callbacks
settle; nested/document scrolling is respected; inactive route slots cannot
refresh. Mobile custom refresh temporarily suppresses competing native root
overscroll through the pending request, even though loading disables new
gestures. Route activity is separate: leaving the page or unmounting restores
the prior policy immediately; a settled disabled hook also restores it.

## Shared implementation comparison

Compared fetched `origin/main` in FullStackTemplate and MacroMapper before
implementation. Neither contains Notoli's `usePullToRefresh`, indicator, or
notepad shell. Template profile menus close their anchor without destroying
permission-dependent selection. MacroMapper meal/diary menus retain their item
context while closing. These defects are Notoli-specific; no template or
MacroMapper changes are appropriate.

## Verification

- Real MUI transition tests retain every owner action through outside/Escape
  dismissal, restore trigger focus, exercise rapid reopen and keyboard selection.
  Against pre-change `7a3a15a`, both dismissal regressions fail because the exiting
  menu no longer contains its original owner actions. The proportional spacer
  and cancellation regressions also fail against that exact source.
  Read-only intercepted fixtures against the deployed pre-release frontend
  reproduce excessive displacement in both light/dark browser preferences.
  The reviewer follow-up holds the full-pull and pending spacer at the same
  33.6px, avoiding an additional release-time movement.
- Hook tests cover cancellation, nested scrolling, failure/retry, duplicate pulls,
  and disable/overscroll cleanup. Existing board/task page tests cover successful
  and failed refreshes while retaining content.
- Playwright `e2e/ui-dismiss-refresh.spec.js` samples exit-frame menu item counts
  on desktop/mobile, checks task actions, and measures one proportional refresh
  displacement with pending/success/failure/cancel paths under light/dark browser
  preferences. The app's existing palette is preserved; no theme switch is added.
  Chromium and Windows WebKit journeys are available; WebKit's mobile fixture
  explicitly supplies `maxTouchPoints` because Windows WebKit reports zero even
  with Playwright touch emulation. This does not emulate physical iOS overscroll.
- Visual fixtures intercept API requests and supply a synthetic session. They
  may be used against deployed frontend assets without accessing customer data;
  they do not prove authenticated production backend journeys or physical iOS
  rubber-band behavior. Browser and CI outcomes are recorded in the PR/issues.
  The pre-existing `NotepadRoutes` maximum-update-depth warning documented in
  the frontend README remains outside this batch; the visual journeys run and
  assert menu/refresh behavior despite that warning.

Production promotion must contain only this batch relative to the current
`env-prod` tree, pass existing protection/reviews, and use the immutable app-only
release pipeline. Independent VM verification compares release/image identities,
gateway/MacroMapper invariance, routing, and sanitized error counts. VM health is
separate evidence from the frontend interaction assertions.
