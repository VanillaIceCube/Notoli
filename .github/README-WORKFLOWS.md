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
  - Auto-fix is enabled only for non-Dependabot pull requests whose head branch belongs to this repository. Those jobs explicitly check out the writable head branch. Fork and Dependabot pull requests receive no App secret, use GitHub's standard pull-request checkout, skip mutating lint steps, and still run strict formatting/lint checks against the submitted code.
- Runs the reusable test gate: [`.github/workflows/gate-test.yml`](workflows/gate-test.yml)
  - Frontend: `npm test` (CI mode)
  - Backend: `python manage.py test`
  - Repository automation: Node's built-in test runner executes colocated behavioral tests for the AI review publisher and security-alert reconciler.
- Lint and test jobs use the same change filters:
  - Frontend checks run for `frontend/**` changes.
  - Backend checks run for `backend/**` changes.
  - Changes to `.github/actions/read-versions/**` or `.github/actions/prepare-lint-commit/**` run both frontend and backend checks because those actions are shared by both lint jobs.
  - Changes to the AI review publisher, prior-review collector, persona review workflows, repository automation test workflow, or security-alert reconciler run the dedicated repository automation test job without coupling GitHub Action behavior to the frontend Jest suite.
  - Other workflow/action changes are validated by Actionlint and CodeQL Actions analysis without forcing application test suites to run.
  - Jobs skipped because their paths are not relevant report `not-applicable` to downstream review workflows.
  - Lint, test, and CodeQL change detection uses the pinned `dorny/paths-filter` action. If its GitHub API request fails, the detector remains failed but adds a titled error annotation and workflow summary explaining that no scope was evaluated and the workflow should be rerun.
- Runs the reusable CodeQL gate: [`.github/workflows/gate-codeql.yml`](workflows/gate-codeql.yml)
  - Python/Django backend analysis for `backend/**`
  - JavaScript/TypeScript frontend analysis for `frontend/**`
  - GitHub Actions workflow analysis for `.github/workflows/**` and `.github/actions/**`
- Runs the reusable vulnerability gate: [`.github/workflows/gate-vulnerability.yml`](workflows/gate-vulnerability.yml)
  - Uses GitHub Dependency Review and fails when a PR introduces a high or critical vulnerability.
  - Emits a vulnerability report output for RoboCop instead of posting a standalone PR comment.
- Runs the reusable malware gate: [`.github/workflows/gate-malware.yml`](workflows/gate-malware.yml)
  - Uses the local [npm malware review action](actions/review-npm-malware/action.yml) to compare changed `frontend/package-lock.json` packages against GitHub's npm malware advisories.
  - Follows GitHub's cursor-based advisory pagination and applies a per-request timeout so the gate terminates reliably as the advisory feed grows.
  - Emits a malware report output for RoboCop and fails when a changed package/version matches a known malware advisory.
- For trusted same-repository, non-Dependabot PRs, runs [`.github/workflows/review-code.yml`](workflows/review-code.yml)
  - Runs Obi-Wan Code-nobi, the AI Code Reviewer, for general implementation review
  - Reviews the repository file map, changed-file contents, prior Obi-Wan Code-nobi reviews on the PR, and line-numbered PR diff, then publishes one native PR review with inline comments when line placement is valid.
- For trusted same-repository, non-Dependabot PRs, runs [`.github/workflows/review-build.yml`](workflows/review-build.yml) after frontend/backend lint and tests complete.
  - Runs Lint Eastwood, the AI Build Sheriff, to interpret lint, test, build, formatting, and CI evidence.
  - Consumes lint/test statuses, log tails, prior Lint Eastwood reviews on the PR, and the line-numbered PR diff before publishing one native PR review.
  - Requests changes when failed lint/test/build evidence appears caused by the PR; approves clean build evidence.
- For trusted same-repository, non-Dependabot PRs, runs [`.github/workflows/review-security.yml`](workflows/review-security.yml) after the security checks.
  - Runs RoboCop, the AI Security Officer, after CodeQL, Dependency/Vulnerability Review, and Malware Review complete.
  - Consumes explicit gate results, vulnerability/malware reports, security check summaries, check annotations, prior RoboCop reviews on the PR, and the line-numbered PR diff before publishing one native PR review.
  - Requests changes for actionable security findings; approves clean security evidence.
  - Dependency Review, malware scanning, and CodeQL remain independent required checks; RoboCop does not replace them.
- AI persona workflows run only for trusted same-repository, non-Dependabot pull requests because their GitHub App private keys are unavailable to fork and Dependabot-triggered workflows. Fork and Dependabot pull requests rely on the independent lint, test, CodeQL, vulnerability, and malware check output; a failed gate remains visible and blocks merge without attempting a secret-dependent AI review. Healthy Dependabot pull requests can continue to [`.github/workflows/ci-auto-merge.yml`](workflows/ci-auto-merge.yml).

OpenAI and GitHub App inputs:
- `OPENAI_API_KEY` secret. Triggered AI reviews fail visibly when the key is missing or the OpenAI request cannot produce a usable response.
- `OPENAI_PROJECT_ID` (repo variable)
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
- Required repository configuration: `OPENAI_API_KEY`, `ROBOCOP_PRIVATE_KEY`, and `SECURITY_ALERTS_TOKEN` secrets; `ROBOCOP_APP_ID`, `OPENAI_PROJECT_ID`, and `SECURITY_ALERTS_PROJECT_ID` repository variables; and a RoboCop installation on Notoli. `SECURITY_ALERTS_PROJECT_ID` is the node ID of the personal Notoli GitHub Project v2.
- RoboCop must have `Issues: write` for issue creation, edits, labels, assignment, comments, and closure; `Code scanning alerts: read` (the `security-events` workflow input) for CodeQL reads; and `Dependabot alerts: read` (the token action's `vulnerability-alerts` input) for vulnerability and malware reads. After changing the App registration, approve the requested permission update on the existing installation. Each workflow explicitly narrows the one-hour installation token to the permissions its feed needs and to the Notoli repository.
- `SECURITY_ALERTS_TOKEN` remains separate because the Notoli board is a personal Project v2. It is passed only to the Project GraphQL client and needs `project` access plus whatever repository visibility GitHub requires for the Project's issue content. It is no longer used to read security alerts or mutate issues.
- The project must include these fields and options: `Status` → `Backlog`, `Domain` → `CI/CD`, `Type` → `Security`, `Priority` → `P1`/`P2`, `Size` → `M`, and numeric `Estimate` (set to `3`). CodeQL and malware groups use `P1`; non-urgent vulnerability groups use `P2`. The workflows require and write all of them.
- `GITHUB_TOKEN` is limited to `contents: read` for checkout and is not persisted in the Git remote. RoboCop performs all alert reads and issue operations. `SECURITY_ALERTS_TOKEN` performs only Project v2 reads and writes; the shared action rejects empty credentials or a shared RoboCop/Project credential instead of falling back to `GITHUB_TOKEN` or the personal token for issue authoring.
- Missing or invalid RoboCop App IDs, private keys, installations, or requested permissions fail during installation-token creation. The shared action also emits an actionable error for missing tokens, a missing Project ID, or credential reuse before fetching alerts or changing tickets.
- A safe attribution check is to run one alert workflow manually against current alerts after approving the App permission update. Reference-based reconciliation reuses current managed tickets, so the run exercises RoboCop-authored edits without creating duplicate production tickets. Confirm the workflow actor in an edited ticket's history and verify Project synchronization remains successful.
- Run the repository automation coverage locally with `node --test .github/actions/publish-ai-review/publish-ai-review.test.js .github/actions/security-alerts/sync-security-alerts.test.js`. AI review coverage includes persona-specific clean approvals, populated semantic groups, infrastructure-only comments, exact-line comments, unchanged reviews, duplicate suppression, preservation of multiple unplaceable findings, malformed-response diagnostics, unavailable notices, and synchronization of the rendered [`review-output-examples.md`](actions/publish-ai-review/review-output-examples.md) fixture. Security-alert coverage includes credential separation and RoboCop-only issue mutations; reconciliation across unchanged and reordered groups, splits, merges, added alerts, resolved alerts, empty feeds; and the known stale-ticket set from issue #633.

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
- The active `main` ruleset requires the Vulnerability and Malware checks alongside the existing lint, test, and CodeQL checks.
- Dependency vulnerability review fails at `high` severity or above and posts its summary directly on the PR.
- Dependency malware review is npm-focused because GitHub's malware advisory coverage is currently npm-focused; it checks only changed lockfile package versions.
- The workflow reports CodeQL findings, and CodeQL must pass before `ci-auto-merge.yml` can run.
- Dependabot auto-merge requires lint, test, CodeQL, vulnerability, and malware checks to pass.
- To make serious CodeQL findings block merges, configure GitHub branch protection or a repository ruleset to require the relevant CodeQL check after validating runtime and alert noise.
- Recommended staged policy: block high/critical security findings first; allow medium, low, and note-level findings to report until the false-positive rate is understood.
- When code fixes remove a finding, GitHub closes the matching code scanning alert after the protected branch is reanalyzed. False positives or accepted risks should be dismissed in GitHub Code Scanning with a clear reason.

## 🚀 Flow 2: Deploy (`.github/workflows/ci-deploy.yml`)
Trigger:
- Push to the `env-prod` branch
- Manual `workflow_dispatch`

What it does:
- Builds and pushes Docker images to GHCR:
  - `notoli-backend` (from `backend/Dockerfile`)
  - `notoli-frontend` (from `frontend/Dockerfile`)
- Uploads `deploy/docker-compose.yml` and `deploy/nginx-proxy.conf` to the server
- SSHes into the server, writes a `.env` file next to the compose file (leaving `DJANGO_FORCE_SCRIPT_NAME` blank by default for subdomain-root routing), then:
  - Prunes Docker images (`docker system prune -af`)
  - Pulls images + recreates containers
  - Runs Django migrations inside the backend container

Deployment prerequisite:
- For Cloudflare Full (strict), the origin must have a Cloudflare Origin Certificate.
- Option A (manual): provision on the server at `certs/origin.pem` and `certs/origin.key` (see `deploy/README.md`).
- Option B (automated): set GitHub Secrets `CLOUDFLARE_ORIGIN_CERT_PEM` and `CLOUDFLARE_ORIGIN_KEY_PEM` so the workflow uploads the files to `certs/` during deploy.

Deploy inputs (GitHub repo vars / secrets):
- Server connection: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`, optional `DEPLOY_PORT`, secret `DEPLOY_SSH_KEY`
- Backend config:
  - Secret: `DJANGO_SECRET_KEY`
  - Secret: `DJANGO_EMAIL_HOST_KEY`
  - Vars: `DJANGO_DEBUG`, `DJANGO_SQLITE_PATH`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_CORS_ALLOWED_ORIGINS`, `DJANGO_CSRF_TRUSTED_ORIGINS`, optional `DJANGO_FORCE_SCRIPT_NAME` (blank for subdomain-root deploys), `DJANGO_FRONTEND_BASE_URL`, `DJANGO_EMAIL_BACKEND`, `DJANGO_EMAIL_TIMEOUT`, `DJANGO_DEFAULT_FROM_EMAIL`
  - SMTP-only vars when `DJANGO_EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend`: `DJANGO_EMAIL_HOST`, `DJANGO_EMAIL_PORT`, `DJANGO_EMAIL_USE_TLS`, `DJANGO_EMAIL_HOST_USER`
- Frontend build arg: optional `REACT_APP_API_BASE_URL` (leave blank/unset for same-origin subdomain calls on `https://notoli.judeandrewalaba.com`; use `https://notoli.judeandrewalaba.com` only if an absolute URL is required)

## 📦 Flow 3: Dependabot (`.github/dependabot.yml` + CI/Auto Merge)
Dependabot configuration:
- [`.github/dependabot.yml`](dependabot.yml) opens daily PRs for:
  - npm (`/frontend`)
  - pip (`/backend`)
  - GitHub Actions (`/`)
  - Docker (`/backend`, `/frontend`)

Auto-merge behavior:
- Dependabot PRs go through CI (`ci-orchestrator.yml`), and if all gates pass, `ci-auto-merge.yml` can enable auto-merge.
- Dependabot PRs do not receive secret-dependent AI reviews. Their independent lint, test, CodeQL, vulnerability, and malware gates provide failure details and block auto-merge when any gate fails.
- Auto-merge is restricted to patch/minor updates.
- If a security alert is present, the workflow requires CVSS <= 6.9.
- The workflow uses `dependabot/fetch-metadata@25dd0e34f4fe68f24cc83900b1fe3fe149efef98` (`v3.1.0`) and can optionally use `DEPENDABOT_PAT` for metadata/alert lookup.
