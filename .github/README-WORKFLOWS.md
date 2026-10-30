# 🤖 GitHub Automation
This repo uses GitHub Actions for CI and deployments, plus Dependabot for dependency updates.

## ✅ Flow 1: CI (`.github/workflows/ci-orchestrator.yml`)
Trigger:
- Pull requests (opened/synchronize/reopened/ready_for_review)

What it does:
- Runs the reusable lint gate: [`.github/workflows/gate-lint.yml`](workflows/gate-lint.yml)
  - Frontend: Prettier + ESLint (auto-fix, then strict checks)
  - Backend: Ruff (auto-fix, then strict checks)
  - Auto-fix jobs check out code without persisted Git credentials while package installation and lint commands run.
  - Auto-fix commits create the Lint Eastwood GitHub App installation token only after changed files are detected, then use that token to push branch updates.
  - Auto-fix commits resolve Lint Eastwood's bot noreply email at runtime from the app slug and bot user ID, then use `Lint Eastwood <bot-id+lint-eastwood[bot]@users.noreply.github.com>` as both the author and committer identity.
  - The shared [`.github/actions/prepare-lint-commit`](actions/prepare-lint-commit/action.yml) action validates that identity, configures the token only as the Git remote's push URL, and the lint job restores the unauthenticated push URL immediately after the commit step.
  - Auto-fix is enabled only for non-Dependabot pull requests whose head branch belongs to this repository. Those jobs explicitly check out the writable head branch. Fork and Dependabot pull requests use GitHub's standard pull-request checkout, skip mutating lint steps, and still run strict formatting/lint checks against the submitted code. The lint workflow does not receive an App secret from forks; Dependabot review credentials are handled separately below.
- Runs the reusable test gate: [`.github/workflows/gate-test.yml`](workflows/gate-test.yml)
  - Frontend: standalone Jest via `npm test` (CI mode), then `npm run build` (strict ESLint 10 and Vite production build). Build failures fail the existing frontend test gate and remain in its captured diagnostics.
  - Backend: `python manage.py test`
  - Repository automation: Node's built-in test runner executes colocated behavioral tests for upstream major-upgrade evidence, the AI review publisher, the security-alert reconciler, and large dependency-review report transport. Changes to the report helper or vulnerability workflow also select this test job.
- Lint and test jobs use the same change filters:
  - Frontend checks run for `frontend/**` changes.
  - Backend checks run for `backend/**` changes.
  - Changes to `.github/actions/read-versions/**` or `.github/actions/prepare-lint-commit/**` run both frontend and backend checks because those actions are shared by both lint jobs.
  - Changes to the AI review publisher, prior-review and upstream-evidence collectors, OpenAI/diff actions, CI orchestrator, persona review workflows, repository automation test workflow, or security-alert reconciler run the dedicated repository automation test job without coupling GitHub Action behavior to the frontend Jest suite.
  - Other workflow/action changes are validated by Actionlint and CodeQL Actions analysis without forcing application test suites to run.
  - Jobs skipped because their paths are not relevant report `not-applicable` to downstream review workflows.
  - Lint, test, and CodeQL change detection uses the pinned `dorny/paths-filter` action. If its GitHub API request fails, the detector remains failed but adds a titled error annotation and workflow summary explaining that no scope was evaluated and the workflow should be rerun.
- Runs the reusable CodeQL gate: [`.github/workflows/gate-codeql.yml`](workflows/gate-codeql.yml)
  - Python/Django backend analysis for `backend/**`
  - JavaScript/TypeScript frontend analysis for `frontend/**`
  - GitHub Actions workflow analysis for `.github/workflows/**` and `.github/actions/**`
- Runs the reusable vulnerability gate: [`.github/workflows/gate-vulnerability.yml`](workflows/gate-vulnerability.yml)
  - Uses GitHub Dependency Review and fails when a PR introduces a high or critical vulnerability.
  - Emits a bounded vulnerability report output for RoboCop instead of posting a standalone PR comment. Full dependency and vulnerability JSON travels through a file and is retained in the `dependency-review-evidence` artifact; it is not passed through a large environment variable. The report includes change counts, vulnerable entries up to 16 KiB, and an explicit omitted-entry count. Every non-success Dependency Review outcome fails the gate, independently of report size.
- Runs the reusable malware gate: [`.github/workflows/gate-malware.yml`](workflows/gate-malware.yml)
  - Uses the local [npm malware review action](actions/review-npm-malware/action.yml) to compare changed `frontend/package-lock.json` packages against GitHub's npm malware advisories. Queries use GitHub's documented [affects filter](https://docs.github.com/en/rest/security-advisories/global-advisories#list-global-security-advisories) with one unique changed package name per query, following every result page and matching versions locally; API failures still block the gate. This avoids downloading the full global malware corpus for each dependency PR.
  - Follows GitHub's cursor-based advisory pagination and applies a per-request timeout so the gate terminates reliably as the advisory feed grows.
  - Emits a malware report output for RoboCop and fails when a changed package/version matches a known malware advisory.
- For trusted same-repository PRs, including Dependabot, runs [`.github/workflows/review-code.yml`](workflows/review-code.yml)
  - Runs Obi-Wan Code-nobi, the AI Code Reviewer, for general implementation review
  - Reviews the repository file map, changed-file contents, prior Obi-Wan Code-nobi reviews on the PR, and line-numbered PR diff, then publishes one native PR review with inline comments when line placement is valid.
- For trusted same-repository PRs, including Dependabot, runs [`.github/workflows/review-build.yml`](workflows/review-build.yml) after frontend/backend lint and tests complete.
  - Runs Lint Eastwood, the AI Build Sheriff, to interpret lint, test, build, formatting, and CI evidence.
  - Consumes lint/test statuses, log tails, prior Lint Eastwood reviews on the PR, and the line-numbered PR diff before publishing one native PR review.
  - Requests changes when failed lint/test/build evidence appears caused by the PR; approves clean build evidence.
- For trusted same-repository PRs, including Dependabot, runs [`.github/workflows/review-security.yml`](workflows/review-security.yml) after the security checks.
  - Runs RoboCop, the AI Security Officer, after CodeQL, Dependency/Vulnerability Review, and Malware Review complete.
  - Consumes explicit gate results, vulnerability/malware reports, security check summaries, check annotations, prior RoboCop reviews on the PR, and the line-numbered PR diff before publishing one native PR review.
  - Requests changes for actionable security findings; approves clean security evidence.
  - Dependency Review, malware scanning, and CodeQL remain independent required checks; RoboCop does not replace them.
- All three AI persona workflows run for trusted same-repository pull requests, including Dependabot. Fork PRs remain excluded from secret-dependent reviews and rely on the independent lint, test, CodeQL, vulnerability, and malware gates. Dependabot lint auto-fixes remain disabled; eligible patch/minor updates retain their existing independent-gate auto-merge policy.

### Dependabot major upgrade briefs

For `version-update:semver-major` updates, Obi-Wan publishes a **Major upgrade brief** in its native review, matching MacroMapper's format. The brief identifies the dependency and version transition, explains the upstream breaking change and material gains, cites exact Notoli paths affected, gives a merge/hold/migration recommendation, and links the primary sources used. It does not add a standalone comment or a new required check, and major updates remain excluded from automatic merging.

The workflow uses pinned Dependabot metadata, the target and first release in the new major line from GitHub Releases, npm/PyPI repository metadata, the bounded Dependabot PR description, a bounded exact-match search of tracked repository text, and [Responses API web search](https://developers.openai.com/api/docs/guides/tools-web-search). Search runs only for semver-major code reviews; other reviews have no web tool. Missing releases, unsupported ecosystems such as Docker, registry and API failures are recorded as evidence gaps so the reviewer can search official sources and explain uncertainty rather than invent release rationale.

Upstream release notes are capped at 12,000 characters per release, repository usage evidence at 30,000 bytes, and the PR description at 12,000 characters. The shared diff action follows MacroMapper's 512 KiB budget and excludes generated npm, Yarn, pnpm, and Poetry lockfiles from the diff for all three reviewers; Obi-Wan's separately bounded changed-file context retains MacroMapper's behavior. Each persona publishes an incomplete-review `COMMENT` and fails its check when the source diff is truncated, withholding the normal model call and verdict. This also ports the complete-diff behavior tracked in [#660](https://github.com/VanillaIceCube/Notoli/issues/660).

The publisher requires all major-brief fields before publishing a normal major-upgrade review. An incomplete brief produces one unavailable notice per persona/commit and fails the review job. An unchanged verdict retains its brief rather than collapsing to a summary. A native `REQUEST_CHANGES` review fails the corresponding reviewer check, matching MacroMapper. OpenAI requests cap combined reasoning and visible output at 16,000 tokens; invalid credentials, quota errors, and unusable model responses retain the existing visible failure behavior.

The port uses MacroMapper main `9075aab874ea92dbac1656458b893a3221a6ca07` as its reference. A shared dependency-usage loop bug omits the final dependency (and all usage evidence for a single-package update); its coordinated fix and behavioral coverage are tracked in [Notoli #890](https://github.com/VanillaIceCube/Notoli/issues/890), [MacroMapper #230](https://github.com/VanillaIceCube/MacroMapper/issues/230), and [FullStackTemplate #195](https://github.com/VanillaIceCube/FullStackTemplate/issues/195). This parity port does not introduce a separate Notoli-only fix. Additional verified shared issues are tracked in #891 (suppressed inline duplicates can hide independent body findings), #892 (grouped versions and bare Actions release references), and #893 (invalid source values can satisfy the required-brief check). Matching tickets exist in MacroMapper and FullStackTemplate; the PR links each coordinated set.

OpenAI and GitHub App inputs:
- `OBI_WAN_OPENAI_API_KEY`, `LINT_EASTWOOD_OPENAI_API_KEY`, and `ROBOCOP_OPENAI_API_KEY` secrets. Triggered AI reviews fail visibly when the key is missing or the OpenAI request cannot produce a usable response.
- `OPENAI_REVIEWERS_PROJECT_ID` (repo variable)
- Configure `OBI_WAN_OPENAI_API_KEY`, `LINT_EASTWOOD_OPENAI_API_KEY`, `ROBOCOP_OPENAI_API_KEY`, `OBI_WAN_CODE_NOBI_PRIVATE_KEY`, `LINT_EASTWOOD_PRIVATE_KEY`, and `ROBOCOP_PRIVATE_KEY` in both the Actions and Dependabot secret stores. Dependabot-triggered workflows use Dependabot secrets; repository variables supply the same App IDs and OpenAI project ID. Missing/invalid review credentials fail visibly rather than falling back to another author or granting an approval. Fork PRs receive neither secret store through these reviewer jobs.
- `OBI_WAN_CODE_NOBI_APP_ID` repository variable and `OBI_WAN_CODE_NOBI_PRIVATE_KEY` repository secret authenticate the Obi-Wan Code-nobi GitHub App. Install it with `Contents: read` and `Pull requests: write`.
- `LINT_EASTWOOD_APP_ID` repository variable and `LINT_EASTWOOD_PRIVATE_KEY` repository secret authenticate the Lint Eastwood GitHub App. Install it on this repository with `Contents: write` so lint auto-fix commits can be pushed, and `Pull requests: write` so build reviews can be published. The CI orchestrator passes only `LINT_EASTWOOD_PRIVATE_KEY` into the reusable lint workflow. The secret is optional so untrusted/fork and Dependabot pull requests can take the strict-check-only path; when auto-fix is enabled, a missing secret, invalid app identity, or insufficient app permission fails the auto-fix job instead of falling back to `GITHUB_TOKEN` attribution.
- `ROBOCOP_APP_ID` repository variable and `ROBOCOP_PRIVATE_KEY` repository secret authenticate the RoboCop GitHub App. Install it with `Contents: read`, `Pull requests: write`, `Checks: read`, `Actions: read`, `Code scanning alerts: read`, `Dependabot alerts: read`, and `Issues: write`. The CodeQL alert workflow narrows its short-lived installation token to `Code scanning alerts: read` and `Issues: write`; the vulnerability and malware workflows additionally request `Dependabot alerts: read` through the token action's `vulnerability-alerts` input. The other permissions remain available only to RoboCop's PR-review workflow.
- AI reviews use `gpt-5.6-luna` through the local OpenAI Responses API action.
- AI personas do not post standalone PR comments. Any bot comments are submitted as part of their native PR review.
- If OpenAI quota or tokens are exhausted, credentials are invalid, the service is unavailable, or the model response is unusable, the affected persona publishes one native `COMMENT` review per commit explaining that no AI approval or finding was produced. The workflow remains failed until it can be rerun successfully; independent lint, test, CodeQL, vulnerability, and malware gates remain authoritative.
- AI personas return one shared structured contract: native review event, characterful summary, unchanged status, body findings, material evidence, author actions, and inline comments. The model authors the complete verdict prose, while the shared publisher owns canonical GitHub Markdown, renders every visible identity or group label as an underlined `##` heading, and omits empty groups.
- Each review keeps a recognizable emoji-led identity and persona-specific group labels: Obi-Wan Code-nobi uses `🧭` with `🔎 Findings`, `📚 Evidence reviewed`, and `✅ Next step`; Lint Eastwood uses `🤠` with `🔧 Build findings`, `🧾 Check evidence`, and `🛠️ Fix`; RoboCop uses `🛡️` with `⚠️ Security findings`, `📋 Evidence`, and `▶️ Directive`. Prompt-guided summaries give Obi-Wan and Lint Eastwood a natural, lightly characterful voice without forced metaphors, while RoboCop keeps the bolder enforcement-terminal framing, controlled all-caps, and playful directives. Technical findings and inline comments stay concise, professional, and evidence-backed.
- AI personas read prior native reviews authored by their own GitHub App identity and suppress duplicate inline findings when the evidence has not changed. Unchanged reviews retain their native event, use a fresh persona-specific summary, and omit repeated findings, evidence, and actions.
- AI review publishing only sends inline comments that target valid added diff lines. Every finding that cannot be placed inline is preserved under the normal Findings group with file and line context; duplicate, placement, and malformed-comment diagnostics are recorded in workflow logs instead of visible automation notes. The publishing logic, visual Markdown examples, and Node regression tests are colocated under `.github/actions/publish-ai-review/`.

Review personas:
- **RoboCop - AI Security Officer:** owns CodeQL, Dependency/Vulnerability Review, Malware Review, security-sensitive code paths, permissions/auth risk, and security interpretation.
- **Lint Eastwood - AI Build Sheriff:** owns lint failures, test failures, build/workflow failures, formatting/type-check style failures, and CI failure interpretation.
- **Obi-Wan Code-nobi - AI Code Reviewer:** owns general implementation review: correctness, maintainability, architecture, edge cases, missing tests, API/UX concerns, and overall code quality.

Security-alert aggregation:
- Daily workflows collect open CodeQL alerts plus non-urgent Dependabot vulnerability alerts and npm malware-classified Dependabot alerts. Each workflow also supports **Run workflow** from the Actions tab.
- The alert workflows keep scheduling in [`alert-codeql.yml`](workflows/alert-codeql.yml), [`alert-vulnerability.yml`](workflows/alert-vulnerability.yml), and [`alert-malware.yml`](workflows/alert-malware.yml). The fetching, grouping, validation, and synchronization implementation lives in the [Security Alerts composite action](actions/security-alerts/action.yml). The response must be valid JSON and must account for every source alert exactly once; validation happens before any issue is created or updated.
- OpenAI request failures, including exhausted quota/tokens, missing credentials, transport errors, and unusable responses, produce a warning and workflow summary with recovery guidance. Alert synchronization then fails validation before changing tickets.
- Generated issues contain a stable marker derived from their feed and source-alert references. Reconciliation also parses the underlying references from every open workflow-managed issue, so changing AI prose or group order updates the same tickets and split or merged groups reuse a deterministic overlapping canonical ticket instead of creating overlapping coverage.
- Every current source alert appears in exactly one open managed issue. Reused issues retain their existing GitHub Project fields, labels, and assignees while the workflow ensures the repository owner and the correct gray feed tag (`codeql`, `vulnerability`, or `malware`) remain present. New issues, and existing issues newly added to the Project, receive the documented default fields.
- Superseded managed issues are closed as completed after all of their still-open source alerts move to current canonical tickets. Resolved or no-longer-eligible alerts are removed when a canonical issue is refreshed; a managed issue with no current coverage is closed even when the feed has zero alerts. Closed bodies retain their source-alert links and gain a lifecycle note pointing to replacement tickets when applicable. Their Project status moves to `Done`, with `End date` recorded when that field exists.
- Required repository configuration: `ROBOCOP_OPENAI_API_KEY`, `ROBOCOP_PRIVATE_KEY`, and `SECURITY_ALERTS_TOKEN` secrets; `ROBOCOP_APP_ID`, `OPENAI_REVIEWERS_PROJECT_ID`, and `SECURITY_ALERTS_PROJECT_ID` repository variables; and a RoboCop installation on Notoli. `SECURITY_ALERTS_PROJECT_ID` is the node ID of the personal Notoli GitHub Project v2.
- RoboCop must have `Issues: write` for issue creation, edits, labels, assignment, comments, and closure; `Code scanning alerts: read` (the `security-events` workflow input) for CodeQL reads; and `Dependabot alerts: read` (the token action's `vulnerability-alerts` input) for vulnerability and malware reads. After changing the App registration, approve the requested permission update on the existing installation. Each workflow explicitly narrows the one-hour installation token to the permissions its feed needs and to the Notoli repository.
- `SECURITY_ALERTS_TOKEN` remains separate because the Notoli board is a personal Project v2. It is passed only to the Project GraphQL client and needs `project` access plus whatever repository visibility GitHub requires for the Project's issue content. It is no longer used to read security alerts or mutate issues.
- The project must include these fields and options: `Status` → `Backlog`, `Domain` → `CI/CD`, `Type` → `Security`, `Priority` → `P1`/`P2`, `Size` → `M`, and numeric `Estimate` (set to `3`). CodeQL and malware groups use `P1`; non-urgent vulnerability groups use `P2`. The workflows require and write all of them.
- `GITHUB_TOKEN` is limited to `contents: read` for checkout and is not persisted in the Git remote. RoboCop performs all alert reads and issue operations. `SECURITY_ALERTS_TOKEN` performs only Project v2 reads and writes; the shared action rejects empty credentials or a shared RoboCop/Project credential instead of falling back to `GITHUB_TOKEN` or the personal token for issue authoring.
- Missing or invalid RoboCop App IDs, private keys, installations, or requested permissions fail during installation-token creation. The shared action also emits an actionable error for missing tokens, a missing Project ID, or credential reuse before fetching alerts or changing tickets.
- A safe attribution check is to run one alert workflow manually against current alerts after approving the App permission update. Reference-based reconciliation reuses current managed tickets, so the run exercises RoboCop-authored edits without creating duplicate production tickets. Confirm the workflow actor in an edited ticket's history and verify Project synchronization remains successful.
- Run the repository automation coverage locally with `node --test .github/actions/collect-upstream-major-upgrade-evidence/collect-upstream-major-upgrade-evidence.test.js .github/actions/publish-ai-review/publish-ai-review.test.js .github/actions/security-alerts/sync-security-alerts.test.js`. Major-upgrade coverage exercises npm, PyPI, and GitHub Actions sources, target/first-major releases, release-note bounds, lookup failures, complete/incomplete briefs, preservation on unchanged reviews, blocking review checks, the shared diff budget and incomplete-review wiring, bounded OpenAI request configuration, and major-only evidence/web-search wiring. Workflow coverage follows MacroMapper's tests; the dependency-usage loop regression is tracked separately in #890. AI review coverage includes persona-specific clean approvals, populated semantic groups, infrastructure-only comments, exact-line comments, unchanged reviews, duplicate suppression, preservation of multiple unplaceable findings, malformed-response diagnostics, unavailable notices, and synchronization of the rendered [`review-output-examples.md`](actions/publish-ai-review/review-output-examples.md) fixture. Security-alert coverage includes credential separation and RoboCop-only issue mutations; reconciliation across unchanged and reordered groups, splits, merges, added alerts, resolved alerts, empty feeds; and the known stale-ticket set from issue #633.

Version pins:
- Node version is read from `frontend/package.json` (`engines.node`)
- Python version is read from `backend/environment.yml` (`python=<version>`)
- Third-party `dorny/paths-filter` workflow steps are pinned to an immutable commit hash.

CodeQL details:
- Pull requests run CodeQL through `ci-orchestrator.yml`, keeping PR feedback under the main CI workflow.
- Pull request CodeQL uses the reusable workflow's change-detection job, following the same skip-by-scope pattern as linting and testing; documentation-only and unrelated pull requests run the detector but skip analysis jobs.
- For a CodeQL-relevant pull request, Python and JavaScript/TypeScript analysis use language-specific filters, while GitHub Actions analysis runs so the `/language:actions` configuration remains present for code-scanning comparisons.
- CI ignores pull requests targeting `env-prod`, so CodeQL is not invoked for that deployment branch.
- Pushes to `main`, weekly scheduled scans, and manual `workflow_dispatch` runs are supported directly by `gate-codeql.yml`.
- CodeQL uploads SARIF results to GitHub Code Scanning with scoped permissions: `contents: read`, `pull-requests: read`, `actions: read`, and `security-events: write`.
- Results appear in PR checks and under GitHub Security -> Code scanning when code scanning is enabled for the repository.
- CodeQL uses the `security-extended` and `security-and-quality` query suites for Python, JavaScript/TypeScript, and GitHub Actions workflow analysis.
- CodeQL is not a scanner for Dockerfiles, Nginx config, or env example files. Those remain covered by Dependabot updates, review, and deployment validation unless a separate scanner is added.

Merge blocking:
- The active `main` ruleset requires the exact checks listed below, including CodeQL scope detection, the three analyzers, Vulnerability, and Malware.
- Dependency vulnerability review fails at `high` severity or above and posts its summary directly on the PR.
- Dependency malware review is npm-focused because GitHub's malware advisory coverage is currently npm-focused; it checks only changed lockfile package versions.
- The workflow reports CodeQL findings, and CodeQL must pass before `ci-auto-merge.yml` can run.
- Dependabot auto-merge requires lint, test, CodeQL, vulnerability, and malware checks to pass.
- To make serious CodeQL findings block merges, configure GitHub branch protection or a repository ruleset to require the relevant CodeQL check after validating runtime and alert noise.
- Recommended staged policy: block high/critical security findings first; allow medium, low, and note-level findings to report until the false-positive rate is understood.
- When code fixes remove a finding, GitHub closes the matching code scanning alert after the protected branch is reanalyzed. False positives or accepted risks should be dismissed in GitHub Code Scanning with a clear reason.

### Main branch required checks

The active [Main Branch Protection ruleset](https://github.com/VanillaIceCube/Notoli/rules/12154610) requires these exact status contexts:

| Gate | Required contexts |
| --- | --- |
| Lint | `Lints / Detect Changes`, `Lints / Lint Frontend (ESLint + Prettier)`, `Lints / Lint Backend (Ruff)`, `Lints / Lint Results` |
| Tests | `Tests / Detect Changes`, `Tests / Frontend Tests (React)`, `Tests / Backend Tests (Django)`, `Tests / Test Results` |
| CodeQL | `CodeQL / Detect CodeQL Scope`, `CodeQL / Analyze Python`, `CodeQL / Analyze JavaScript/TypeScript`, `CodeQL / Analyze GitHub Actions` |
| Dependencies | `Vulnerability / Vulnerability`, `Malware / Malware` |
| AI reviewers | `AI Code Review / Obi-Wan Code-nobi code review`, `AI Build Sheriff Review / Lint Eastwood build sheriff review`, `AI Security Review / RoboCop security review` |

The standalone `CodeQL` Code Scanning results context is intentionally excluded. Historically it was required alongside the four explicit workflow jobs, but GitHub only emits it when analysis uploads results. A documentation-only PR such as [#844](https://github.com/VanillaIceCube/Notoli/pull/844) passes scope detection and skips all analyzers, leaving that standalone requirement pending forever. This policy matches the scope-aware configuration used by MacroMapper and FullStackTemplate.

GitHub accepts skipped analyzer jobs as satisfying required checks. Scope-detection failures and failed in-scope analyzers remain merge blockers. Findings remain visible in Code Scanning and PR results when analysis runs; severity-based blocking is a separate Code Scanning policy, as described above. Removing the standalone context does not introduce a new findings-severity gate.

When editing or recreating the ruleset, retain all 17 contexts above and exclude the standalone `CodeQL` context. Preserve the remaining ruleset settings, conditions, and bypass actors. Validate the live context list with `gh api repos/VanillaIceCube/Notoli/rules/branches/main` and inspect `gh pr checks` for both a documentation-only PR and a code-changing PR.

The three reviewer requirements were activated for [#946](https://github.com/VanillaIceCube/Notoli/issues/946) after verifying exact emitted names on human PR #944 and same-repository Dependabot PR #941, the six reviewer secret names in both credential stores, and app/project variable names. [The dated evidence snapshot](review-gating-evidence.json) records the original and updated rules, successful runs, and PR #942's genuine requested-changes/failing-check followed by approval/passing-check. The existing 14 requirements and all other ruleset settings were preserved.

A published `REQUEST_CHANGES` fails each persona's job, including repeated or unchanged verdicts. Valid `APPROVE` and `COMMENT` succeed; missing credentials, malformed/invalid output, incomplete major briefs and oversized diffs fail visibly. Build/security reviews use `always()` so upstream failures or skipped gates do not suppress them. No reviewer path filters exclude documentation changes. Forks receive no private credentials; review from a trusted same-repository branch is required.

Missing required contexts remain pending; failed or cancelled checks require a successful rerun on the current head. GitHub accepts skipped jobs as satisfying requirements, so a skipped reviewer must never be treated as review evidence. The regression tests preserve reviewer eligibility and the publishing/incomplete-review paths. The read-only audit below rejects missing, skipped, cancelled, neutral and non-success reviewer results; it does not publish an aggregator or change protection.

```powershell
gh api repos/VanillaIceCube/Notoli/rulesets/12154610 > ruleset.json
gh api "repos/VanillaIceCube/Notoli/commits/<HEAD_SHA>/check-runs?per_page=100" > head-check-runs.json
node .github/actions/publish-ai-review/verify-gates.js ruleset.json head-check-runs.json
node --test .github/actions/publish-ai-review/*.test.js
actionlint
```

## 🚀 Deployment
The automation test gate verifies pinned shared-source parity before the common
deployment tests; deployment builds also verify the standard before publishing.
The production workflow runs on `env-prod` pushes or a manual dispatch selecting
that branch. It serializes runs with `cancel-in-progress: false` and pins every
external action, including checkout, to an immutable commit SHA. Merging `main`
does not activate it; production activation requires separate owner approval.

See the [canonical production guide](../deploy/production/README.md) for required
variables/secrets, host preparation, activation order, release behavior and recovery.

## 📦 Flow 3: Dependabot (`.github/dependabot.yml` + CI/Auto Merge)
Dependabot configuration:
- [`.github/dependabot.yml`](dependabot.yml) opens daily PRs for:
  - npm (`/frontend`)
  - pip (`/backend`)
  - GitHub Actions (`/`)
  - Docker (`/backend`, `/frontend`)

Auto-merge behavior:
- Dependabot PRs go through CI (`ci-orchestrator.yml`), and if all gates pass, `ci-auto-merge.yml` can enable auto-merge.
- Dependabot PRs receive the three required same-repository AI reviews using Dependabot secrets. Major updates additionally receive Obi-Wan's upgrade brief and remain a human merge decision. [#656](https://github.com/VanillaIceCube/Notoli/issues/656) owns the existing Dependabot eligibility implementation; [#946](https://github.com/VanillaIceCube/Notoli/issues/946) adds the missing reviewer requirements. Independent lint, test, CodeQL, vulnerability, and malware gates continue to block auto-merge when any gate fails.
- Auto-merge is restricted to patch/minor updates.
- If a security alert is present, the workflow requires CVSS <= 6.9.
- The workflow uses `dependabot/fetch-metadata@25dd0e34f4fe68f24cc83900b1fe3fe149efef98` (`v3.1.0`) and can optionally use `DEPENDABOT_PAT` for metadata/alert lookup.

AI review context includes bounded recent owner/collaborator reviews and replies to prior findings as discussion evidence. Prior bot verdicts must be rechecked against current source/scanners; the diff legend distinguishes active added/context lines from deleted old code. This does not change reviewer verdict rules or authorize merges/deployments.

External GitHub Actions use immutable commit SHAs with version comments.
Keep that convention when updating workflows or composite actions; preserve
review/scanner failure gates and do not treat action updates as deployment approval.

When updating the pinned `actions/create-github-app-token` revision, update the
security-alert workflow assertion in
`.github/actions/security-alerts/sync-security-alerts.test.js` and rerun the
repository automation tests. The current reviewed action revision is
`64ab729a6294000f5aa4a4bc0b73d1f32bc45510` (v3.3.0).

The shared release pin includes template-policy regression coverage coordinated
with [FullStackTemplate #217](https://github.com/VanillaIceCube/FullStackTemplate/issues/217)
and [Infrastructure #26](https://github.com/VanillaIceCube/JudeAndrewAlabaInfrastructure/pull/26).
It derives common preflight fixtures from app policy while retaining this app's
existing trust, networks, environment requirements, workflow and runtime bytes.
The same immutable source commit is proposed for all three consumers. These
source-pin PRs do not authorize merging, promotion, or deployment.

## 🔑 Separate OpenAI reviewer credentials

Credential provisioning is a separate operator step. Configure the new secrets
and project variable before activating these workflows. Missing keys fail
visibly; there is no fallback to the old shared `OPENAI_API_KEY`.

Use a dedicated **Notoli · AI Reviewers** OpenAI project (or the
repository's existing reviewer-only project). Never share credentials between
repositories. Create three distinct keys with these exact display names:

| OpenAI key display name | GitHub secret | Consumer |
| --- | --- | --- |
| `CI · Obi-Wan · Code Review` | `OBI_WAN_OPENAI_API_KEY` | Obi-Wan PR reviews |
| `CI · Lint Eastwood · Build Review` | `LINT_EASTWOOD_OPENAI_API_KEY` | Lint Eastwood PR reviews |
| `CI · RoboCop · Security Review` | `ROBOCOP_OPENAI_API_KEY` | RoboCop PR reviews and all three scheduled/manual alert feeds |

In this repository, add all three keys as **Actions repository secrets** and
also as **Dependabot repository secrets**, with identical names and values in
both stores. Keep the three existing GitHub App private-key secrets in both
stores as well (six review secrets total).

1. In OpenAI Platform, select the repository's reviewer project, open its API
   keys page, and create the three keys above. Restrict each key to the API
   permissions needed for Responses requests; retain model access and Obi-Wan's
   existing semver-major web-search capability. Choose an expiration under your
   rotation policy and record when replacement is due.
2. In GitHub **Settings → Secrets and variables → Actions → Secrets**, add the
   exact secret names in the table. Each value is the full secret key from its
   matching OpenAI entry, not its display name or key ID. Use Dependabot's
   separate secret settings too where specified above.
3. In **Actions → Variables**, set `OPENAI_REVIEWERS_PROJECT_ID` to that same OpenAI
   project's actual `proj_...` ID. All three keys and the project header must
   match. This is an OpenAI project ID; `SECURITY_ALERTS_PROJECT_ID` is a separate
   GitHub Project node ID and stays unchanged. App identity variables/private
   keys and deployment credentials also stay unchanged.
4. Run a same-repository PR smoke test for all three reviewers. Where supported,
   also verify a Dependabot PR using its separate secret store. After an
   approved merge, manually run CodeQL Alert, Vulnerability Alert, and Malware
   Alert on the default branch and observe their next scheduled runs. Do not
   run production deployment to test reviewer credentials.
5. In OpenAI Usage, filter by the reviewer project and individual API key to
   confirm each persona's attribution. An empty alert feed may make no model
   call; record that outcome rather than assuming usage was verified.
6. Stage the new secrets and `OPENAI_REVIEWERS_PROJECT_ID` while leaving the
   legacy `OPENAI_API_KEY` and `OPENAI_PROJECT_ID` unchanged. Existing default-
   branch jobs can continue using the legacy pair until the source is merged.
   Keep old keys valid until every affected consumer has verified the new keys;
   retain any Default-project key still used elsewhere. To reverse the source
   change, revert the workflow change; the retained legacy pair remains usable.
   Do not place a shared legacy key into the three new secret slots or expose
   key values in logs/issues.

See [OpenAI key security, expiration and usage guidance](https://developers.openai.com/api/docs/guides/production-best-practices#api-keys).


## 🔌 Shared MCP framework

The backend test gate checks the pinned MCP framework manifest. Template/MacroMapper run both ordinary tests and an isolated MCP-enabled sample profile; production remains disabled there. Notoli runs its existing enabled protocol/domain suite. See [the framework guide](../docs/MCP-FRAMEWORK.md).

## 🛡️ Dependency evidence and alert lifecycle parity

The reusable baseline is FullStackTemplate's `.github/actions/prepare-vulnerability-report`.
MacroMapper, Notoli and Infrastructure carry the same report implementation and
regression contract. Dependency Review still blocks high/critical additions;
every non-success scanner outcome, missing/malformed output or failed evidence
preparation fails the independent Vulnerability check. No empty-array fallback
may turn unavailable evidence into a clean scan. RoboCop receives at most 16 KiB
of package/severity/manifest context, with omitted-entry counts. The
`dependency-review-evidence` artifact retains every structured entry for seven
days, excluding untrusted free text and arbitrary URLs; unavailable evidence is
retained as structured diagnostics. Artifacts have the repository's Actions
access controls, not an additional private storage boundary.

Alert synchronization saves source history/replacement links first, ensures
Project membership, then writes End date before Status Done. Done can trigger
Project auto-close. The issue client re-reads state before a separate state-only
close. Only GitHub's observed HTTP 422 `Validation Failed` with an empty errors
array is eligible for recovery, and only if another read proves closed/completed
with the exact saved lifecycle body. Other failures propagate. Partial Project
failures leave the issue open for rerun; issue mutations remain attributed to
RoboCop and Project writes use the separate Project credential. New items use
the live `Work type` field. No credentials, branch protections or deployments
change.

Historical evidence: FullStackTemplate #192 closed at 2026-10-11 16:40:51 UTC,
before run 38156425534's state-close PATCH returned 422 at 16:40:52 UTC with
`errors: []`. Notoli #825 has the same earlier pattern. All four Projects have
Auto-close issue enabled (read-only verification 2026-10-20). This establishes
the competing-close ordering; GitHub's internal validation cause is not exposed.
Mocks reproduce that interleaving and reject unrelated errors. Empty scheduled
feeds do not establish that a live close race occurred.

CodeQL now forwards `scope_status`, `scope_python`, `scope_javascript` and
`scope_actions` to RoboCop's shared evidence collector. A PR language skip is
expected only with successful, known scope and a completed matching default-
branch baseline. Missing, failed or unavailable evidence stays an explicit gap.
Main pushes and scheduled/manual scans still analyze every language. Existing
check names, categories, queries and ruleset requirements remain unchanged;
this does not independently resolve the historical default-branch/attribution
acceptance in #612 or #587.

## 🔄 Shared deployment action update

Notoli's app policy now fixes central MCP mode and requires the Actions secret
`MCP_INTROSPECTION_CLIENT_SECRET`. Its generated `extra_env` entry sends the
Notoli-only introspection credential to the existing private `.backend.env`
bundle; no shared release-engine change, mount or CI artifact is added. Host root
and Docker administrators can read the effective environment and retained
recovery files. Keep these privileged and out of logs/tickets. Missing secrets
fail bundle creation. `env-prod` promotion is the live OAuth cutover and remains
held until real YNAB ChatGPT/Codex acceptance and the Infrastructure root
checkpoint. See the [consumer migration plan](../deploy/production/central-mcp.md).

Docker login v4.7.0 is rendered from Infrastructure commit
`f3f049830fcd5e5869d1ae120c57d9ccb6c99200`. Keep `deploy/shared-source.json` and
the generated workflow synchronized; deployment parity remains mandatory.
