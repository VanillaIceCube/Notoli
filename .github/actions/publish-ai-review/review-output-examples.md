# AI review format examples

These fixtures show the canonical review states rendered by the shared publisher.

---

*Clean code-review approval*

## 🧭 Obi-Wan Code-nobi

**Approved.** The credential boundaries are clear, the reconciliation path is well tested, and the earlier concerns are resolved. The path is open.

## 📚 Evidence reviewed

- Alert permissions, credential separation, and regression coverage support the verdict.

---

*Build failure with its exact diagnostic left inline*

## 🤠 Lint Eastwood

**Changes requested.** The tests made it through town, but lint caught one outlaw in the new test code. The gate stays shut until the inline finding is fixed.

---

*Infrastructure-only security comment*

## 🛡️ RoboCop

**COMMENT — REVIEW INCOMPLETE.** CodeQL scope detection failed before the analyzers ran. Approval is not authorized without that evidence.

## 📋 Evidence

- CodeQL analysis is unavailable.
- Dependency and malware gates passed.

## ▶️ Directive

- Rerun CodeQL after the API rate limit clears.

---

*Unplaceable finding preserved in the review body*

## 🧭 Obi-Wan Code-nobi

**Changes requested.** Most of the path is sound, but one publishing edge case still lurks in the shadows and can hide a new finding.

## 🔎 Findings

- `.github/actions/publish-ai-review/publish-ai-review.js:281` — Preserve this finding when duplicate inline comments are suppressed.

## ✅ Next step

- Add execution-level coverage for the mixed result.

---

*Unchanged security approval*

## 🛡️ RoboCop

**APPROVED — SECURITY POSTURE UNCHANGED.** The current diff presents no new threat signature. Existing clearance remains in force.
