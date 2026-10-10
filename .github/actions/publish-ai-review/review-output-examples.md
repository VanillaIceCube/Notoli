# AI review format examples

These fixtures show the canonical review states rendered by the shared publisher.

---

*Clean code-review approval*

## 🧭 Obi-Wan Code-nobi

**Approved.** The credential boundaries hold, the tests cover the risky paths, and the earlier concern is resolved. The course looks clear from here.

## 📚 Evidence reviewed

- Alert permissions, credential separation, and regression coverage support the verdict.

---

*Build failure with its exact diagnostic left inline*

## 🤠 Lint Eastwood

**Changes requested.** Tests made it through, but lint caught one blocking warning in the new test code. Fix that holdout and send the build through again.

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

**Changes requested.** Most of the publishing path is sound, but one edge case can still swallow a new finding. Bring that case into the light before proceeding.

## 🔎 Findings

- `.github/actions/publish-ai-review/publish-ai-review.js:281` — Preserve this finding when duplicate inline comments are suppressed.

## ✅ Next step

- Add execution-level coverage for the mixed result.

---

*Unchanged security approval*

## 🛡️ RoboCop

**APPROVED. THREAT LEVEL: MINIMAL. STATUS: UNCHANGED.** No new threat signature detected. MERGE AUTHORIZATION REMAINS GRANTED, CITIZEN.
