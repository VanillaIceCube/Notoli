# AI review format examples

These fixtures show the canonical review states rendered by the shared publisher.

---

*Clean code-review approval*

## 🧭 Obi-Wan Code-nobi

**APPROVED — NO DISTURBANCE REMAINS IN THIS DIFF.** I searched the shadowed corners: the boundaries hold, the tests stand watch, and the earlier concern has vanished into hyperspace. This code is cleared to continue its journey.

## 📚 Evidence reviewed

- Alert permissions, credential separation, and regression coverage support the verdict.

---

*Build failure with its exact diagnostic left inline*

## 🤠 Lint Eastwood

**CHANGES REQUESTED — ONE OUTLAW IS STILL RIDING WITH THIS BUILD.** Tests crossed the finish line, but lint caught a blocking warning hiding in the new test code. Holster that diagnostic, then send the build down the track again.

---

*Infrastructure-only security comment*

## 🛡️ RoboCop

**COMMENT. REVIEW INCOMPLETE. SECURITY VERDICT: WITHHELD.** CODEQL NEVER REPORTED FOR DUTY. Restore scanner evidence, then rerun the security assessment, citizen.

## 📋 Evidence

- CodeQL analysis is unavailable.
- Dependency and malware gates passed.

## ▶️ Directive

- Rerun CodeQL after the API rate limit clears.

---

*Unplaceable finding preserved in the review body*

## 🧭 Obi-Wan Code-nobi

**CHANGES REQUESTED — A DISTURBANCE REMAINS IN THE PUBLISHING PATH.** Most of this diff is balanced, but one edge case still moves in the shadows and can swallow a new finding. Bring it into the light before proceeding.

## 🔎 Findings

- `.github/actions/publish-ai-review/publish-ai-review.js:281` — Preserve this finding when duplicate inline comments are suppressed.

## ✅ Next step

- Add execution-level coverage for the mixed result.

---

*Unchanged security approval*

## 🛡️ RoboCop

**APPROVED. THREAT LEVEL: MINIMAL. STATUS: UNCHANGED.** No new threat signature detected. MERGE AUTHORIZATION REMAINS GRANTED, CITIZEN.
