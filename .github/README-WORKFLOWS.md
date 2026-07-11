# 🤖 GitHub Automation
This repo uses GitHub Actions for CI and deployments, plus Dependabot for dependency updates.

## ✅ Flow 1: CI (`.github/workflows/ci.yml`)
Trigger:
- Pull requests (opened/synchronize/reopened/ready_for_review)

What it does:
- Runs the reusable lint gate: [`.github/workflows/lint-gate.yml`](workflows/lint-gate.yml)
  - Frontend: Prettier + ESLint (auto-fix, then strict checks)
  - Backend: Ruff (auto-fix, then strict checks)
- Runs the reusable test gate: [`.github/workflows/test-gate.yml`](workflows/test-gate.yml)
  - Frontend: `npm test` (CI mode)
  - Backend: `python manage.py test`
- Lint and test jobs use the same change filters:
  - Frontend checks run for `frontend/**` changes.
  - Backend checks run for `backend/**` changes.
  - Changes to `.github/actions/read-versions/**` run both frontend and backend checks because that shared action controls both toolchains.
  - Other workflow/action changes are validated by Actionlint and CodeQL Actions analysis without forcing application test suites to run.
  - Jobs skipped because their paths are not relevant report `not-applicable` to PR commentary.
- Runs the reusable CodeQL gate: [`.github/workflows/codeql-gate.yml`](workflows/codeql-gate.yml)
  - Python/Django backend analysis for `backend/**`
  - JavaScript/TypeScript frontend analysis for `frontend/**`
  - GitHub Actions workflow analysis for `.github/workflows/**` and `.github/actions/**`
- Runs the reusable vulnerability gate: [`.github/workflows/vulnerability-gate.yml`](workflows/vulnerability-gate.yml)
  - Uses GitHub Dependency Review and fails when a PR introduces a high or critical vulnerability.
- Runs the reusable malware gate: [`.github/workflows/malware-gate.yml`](workflows/malware-gate.yml)
  - Uses the local [npm malware review action](actions/review-npm-malware/action.yml) to compare changed `frontend/package-lock.json` packages against GitHub's npm malware advisories.
  - Updates one PR summary comment and fails when a changed package/version matches a known malware advisory.
- For non-Dependabot PRs, and for Dependabot PRs with a failed lint or test area, runs [`.github/workflows/commentary.yml`](workflows/commentary.yml)
  - Generates an OpenAI-written PR summary for non-Dependabot PRs
  - Generates an AI code review for Dependabot PRs only when frontend/backend lint or tests fail, avoiding token use for healthy dependency updates
  - Posts the summary to the PR description or as a comment
  - Creates a PR review with up to 6 inline comments (when line placement is valid)
- Runs [`.github/workflows/security-review.yml`](workflows/security-review.yml) after the CI checks. RoboCop aggregates available security comments/check summaries plus lint/test status and logs, then publishes one native review through the RoboCop GitHub App. Dependency Review, malware, and CodeQL remain independent checks and are not replaced by this review.
- For Dependabot PRs, runs [`.github/workflows/auto_merge.yml`](workflows/auto_merge.yml) only when lints, tests, vulnerability review, and malware review pass. CodeQL or security-only failures do not invoke the conditional Dependabot AI review.

OpenAI inputs (commentary workflow):
- `OPENAI_API_KEY` (optional secret)
- `OPENAI_PROJECT_ID` (repo variable)
- `LINT_EASTWOOD_APP_ID` repository variable and `LINT_EASTWOOD_PRIVATE_KEY` repository secret authenticate the Lint Eastwood GitHub App for native PR reviews.
- Install Lint Eastwood on the repository with only `Contents: read` and `Pull requests: write`. The App publishes the AI code review; the optional PR summary remains a regular workflow comment.
- PR summaries and AI reviews use `gpt-5.6-luna` through the local OpenAI Responses API action.

Security-review inputs:
- `ROBOCOP_APP_ID` repository variable and `ROBOCOP_PRIVATE_KEY` repository secret authenticate the RoboCop GitHub App.
- RoboCop requires `OPENAI_API_KEY` and `OPENAI_PROJECT_ID`.
- RoboCop must be installed on the repository. Give it only `Contents: read`, `Pull requests: write`, `Checks: read`, `Actions: read`, and `Security events: read`. Store the complete PEM private key in Actions secrets; never commit or print it.
- The security-review job waits for lint, test, CodeQL, vulnerability, and malware jobs because it consumes their outputs and summaries. `always()` allows it to review failures; those jobs do not need to pass for the review to run. RoboCop is called only when a failure or security signal exists, so a clean run still avoids the extra model call.

Review personas:
- **RoboCop — AI Security Officer:** aggregates evidence from CodeQL, Dependency Review, malware checks, and failed CI, then writes an evidence-backed native security review with valid inline comments where needed. It does not replace the underlying scanners.
- **Lint Eastwood — AI Code Reviewer:** reviews code quality, correctness, and maintainability, with a pragmatic focus on actionable inline feedback. It publishes its native PR reviews through the Lint Eastwood GitHub App identity.

Security-alert aggregation:
- Daily workflows collect open CodeQL alerts plus non-urgent Dependabot vulnerability alerts and npm malware-classified Dependabot alerts. Each workflow also supports **Run workflow** from the Actions tab.
- The reusable [security-alert workflow](workflows/security-alerts.yml) is intentionally small; the fetching, grouping, validation, and synchronization implementation lives in the [Security Alerts composite action](actions/security-alerts/action.yml). The response must be valid JSON and must account for every source alert exactly once; validation happens before any issue is created or updated. Its callers are [`codeql-alert.yml`](workflows/codeql-alert.yml), [`vulnerability-alert.yml`](workflows/vulnerability-alert.yml), and [`malware-alert.yml`](workflows/malware-alert.yml).
- Generated issues contain a stable marker derived from their feed and source-alert references, so subsequent runs update the same issue. Every issue is assigned to the repository owner and receives exactly one gray feed tag: `codeql`, `vulnerability`, or `malware`. These labels are provisioned on the repository and are not modified during workflow runs.
- Required repository configuration: `OPENAI_API_KEY` secret, `SECURITY_ALERTS_TOKEN` secret, `OPENAI_PROJECT_ID` repository variable, and `SECURITY_ALERTS_PROJECT_ID` repository variable (the node ID of the Notoli GitHub Project v2). `SECURITY_ALERTS_TOKEN` must be a classic token with `repo`, `security_events`, and `project` scopes, or an equivalent GitHub App/fine-grained token that can read CodeQL and Dependabot alerts, write issues, and write to the Project.
- The project must include these fields and options: `Status` → `Backlog`, `Domain` → `Security`, `Type` → `Maintenance / Automation`, `Priority` → `Medium`/`High`, `Size` → `Medium`, and numeric `Estimate` (set to `3`). The workflows require and write all of them.
- `GITHUB_TOKEN` is limited to `contents: read` for checkout. `SECURITY_ALERTS_TOKEN` performs all alert, issue, label, assignment, and Project v2 API calls, because Project v2 writes require a token with Project access and Dependabot-alert access is token-specific.

Version pins:
- Node version is read from `frontend/package.json` (`engines.node`)
- Python version is read from `backend/environment.yml` (`python=<version>`)
- Third-party `dorny/paths-filter` workflow steps are pinned to an immutable commit hash.

CodeQL details:
- Pull requests run CodeQL through `ci.yml`, keeping PR feedback under the main CI workflow.
- Pull request CodeQL uses the reusable workflow's change-detection job, following the same skip-by-scope pattern as linting and testing; documentation-only and unrelated pull requests run the detector but skip analysis jobs.
- For a CodeQL-relevant pull request, Python and JavaScript/TypeScript analysis use language-specific filters, while GitHub Actions analysis runs so the `/language:actions` configuration remains present for code-scanning comparisons.
- CI ignores pull requests targeting `env-prod`, so CodeQL is not invoked for that deployment branch.
- Pushes to `main`, weekly scheduled scans, and manual `workflow_dispatch` runs are supported directly by `codeql.yml`.
- CodeQL uploads SARIF results to GitHub Code Scanning with scoped permissions: `contents: read`, `pull-requests: read`, `actions: read`, and `security-events: write`.
- Results appear in PR checks and under GitHub Security -> Code scanning when code scanning is enabled for the repository.
- CodeQL uses the `security-extended` and `security-and-quality` query suites for Python, JavaScript/TypeScript, and GitHub Actions workflow analysis.
- CodeQL is not a scanner for Dockerfiles, Nginx config, or env example files. Those remain covered by Dependabot updates, review, and deployment validation unless a separate scanner is added.

Merge blocking:
- The active `main` ruleset requires the Vulnerability and Malware checks alongside the existing lint, test, and CodeQL checks.
- Dependency vulnerability review fails at `high` severity or above and posts its summary directly on the PR.
- Dependency malware review is npm-focused because GitHub's malware advisory coverage is currently npm-focused; it checks only changed lockfile package versions.
- The workflow reports CodeQL findings, but this repository has not intentionally made CodeQL a Dependabot auto-merge prerequisite in `auto_merge.yml` yet.
- Dependabot auto-merge requires lint, test, vulnerability, and malware checks to pass. CodeQL runs in the same CI graph so its check is visible before merge decisions, but it is not an auto-merge prerequisite.
- To make serious CodeQL findings block merges, configure GitHub branch protection or a repository ruleset to require the relevant CodeQL check after validating runtime and alert noise.
- Recommended staged policy: block high/critical security findings first; allow medium, low, and note-level findings to report until the false-positive rate is understood.
- When code fixes remove a finding, GitHub closes the matching code scanning alert after the protected branch is reanalyzed. False positives or accepted risks should be dismissed in GitHub Code Scanning with a clear reason.

## 🚀 Flow 2: Deploy (`.github/workflows/deploy.yml`)
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
  - Docker (`/`, `/backend`, `/frontend`)

Auto-merge behavior:
- Dependabot PRs go through CI (`ci.yml`), and if lints/tests pass, `auto_merge.yml` can enable auto-merge.
- Auto-merge is restricted to patch/minor updates.
- If a security alert is present, the workflow requires CVSS <= 6.9.
- The workflow uses `dependabot/fetch-metadata@v2` and can optionally use `DEPENDABOT_PAT` for metadata/alert lookup.
