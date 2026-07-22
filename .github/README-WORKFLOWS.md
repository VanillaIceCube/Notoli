# 🤖 GitHub Automation
This repo uses GitHub Actions for CI and deployments, plus Dependabot for dependency updates.

## ✅ Flow 1: CI (`.github/workflows/ci-orchestrator.yml`)
Trigger:
- Pull requests (opened/synchronize/reopened/ready_for_review)

What it does:
- Runs the reusable lint gate: [`.github/workflows/gate-lint.yml`](workflows/gate-lint.yml)
  - Frontend: Prettier + ESLint (auto-fix, then strict checks)
  - Backend: Ruff (auto-fix, then strict checks)
  - Auto-fix commits use `Lint Eastwood <41898282+github-actions[bot]@users.noreply.github.com>` as both the author and committer identity when the workflow can push back to the pull request branch.
- Runs the reusable test gate: [`.github/workflows/gate-test.yml`](workflows/gate-test.yml)
  - Frontend: `npm test` (CI mode)
  - Backend: `python manage.py test`
- Lint and test jobs use the same change filters:
  - Frontend checks run for `frontend/**` changes.
  - Backend checks run for `backend/**` changes.
  - Changes to `.github/actions/read-versions/**` run both frontend and backend checks because that shared action controls both toolchains.
  - Other workflow/action changes are validated by Actionlint and CodeQL Actions analysis without forcing application test suites to run.
  - Jobs skipped because their paths are not relevant report `not-applicable` to downstream review workflows.
- Runs the reusable CodeQL gate: [`.github/workflows/gate-codeql.yml`](workflows/gate-codeql.yml)
  - Python/Django backend analysis for `backend/**`
  - JavaScript/TypeScript frontend analysis for `frontend/**`
  - GitHub Actions workflow analysis for `.github/workflows/**` and `.github/actions/**`
- Runs the reusable vulnerability gate: [`.github/workflows/gate-vulnerability.yml`](workflows/gate-vulnerability.yml)
  - Uses GitHub Dependency Review and fails when a PR introduces a high or critical vulnerability.
  - Emits a vulnerability report output for RoboCop instead of posting a standalone PR comment.
- Runs the reusable malware gate: [`.github/workflows/gate-malware.yml`](workflows/gate-malware.yml)
  - Uses the local [npm malware review action](actions/review-npm-malware/action.yml) to compare changed `frontend/package-lock.json` packages against GitHub's npm malware advisories.
  - Emits a malware report output for RoboCop and fails when a changed package/version matches a known malware advisory.
- For non-Dependabot PRs, runs [`.github/workflows/review-code.yml`](workflows/review-code.yml)
  - Runs Obi-Wan Code-nobi, the AI Code Reviewer, for general implementation review
  - Reviews the repository file map, changed-file contents, prior Obi-Wan Code-nobi reviews on the PR, and line-numbered PR diff, then publishes one native PR review with inline comments when line placement is valid.
- After frontend/backend lint and tests complete, runs [`.github/workflows/review-build.yml`](workflows/review-build.yml)
  - Runs Lint Eastwood, the AI Build Sheriff, to interpret lint, test, build, formatting, and CI evidence.
  - Consumes lint/test statuses, log tails, prior Lint Eastwood reviews on the PR, and the line-numbered PR diff before publishing one native PR review.
  - Requests changes when failed lint/test/build evidence appears caused by the PR; approves clean build evidence.
- After the security checks, runs [`.github/workflows/review-security.yml`](workflows/review-security.yml)
  - Runs RoboCop, the AI Security Officer, for every pull request after CodeQL, Dependency/Vulnerability Review, and Malware Review complete.
  - Consumes explicit gate results, vulnerability/malware reports, security check summaries, check annotations, prior RoboCop reviews on the PR, and the line-numbered PR diff before publishing one native PR review.
  - Requests changes for actionable security findings; approves clean security evidence.
  - Dependency Review, malware scanning, and CodeQL remain independent required checks; RoboCop does not replace them.
- For Dependabot PRs, runs AI reviews only when a gate fails: failed lint/test evidence routes to Lint Eastwood, failed CodeQL/vulnerability/malware evidence routes to RoboCop, and Obi-Wan Code-nobi never runs. When all gates pass, no AI review is requested and [`.github/workflows/ci-auto-merge.yml`](workflows/ci-auto-merge.yml) can run.

OpenAI and GitHub App inputs:
- `OPENAI_API_KEY` secret. Triggered AI reviews fail visibly when the key is missing.
- `OPENAI_PROJECT_ID` (repo variable)
- `OBI_WAN_CODE_NOBI_APP_ID` repository variable and `OBI_WAN_CODE_NOBI_PRIVATE_KEY` repository secret authenticate the Obi-Wan Code-nobi GitHub App. Install it with `Contents: read` and `Pull requests: write`.
- `LINT_EASTWOOD_APP_ID` repository variable and `LINT_EASTWOOD_PRIVATE_KEY` repository secret authenticate the Lint Eastwood GitHub App. Install it with `Contents: read` and `Pull requests: write`.
- `ROBOCOP_APP_ID` repository variable and `ROBOCOP_PRIVATE_KEY` repository secret authenticate the RoboCop GitHub App. Install it with `Contents: read`, `Pull requests: write`, `Checks: read`, `Actions: read`, and `Security events: read`.
- AI reviews use `gpt-5.6-luna` through the local OpenAI Responses API action.
- AI personas do not post standalone PR comments. Any bot comments are submitted as part of their native PR review.
- AI personas read prior native reviews authored by their own GitHub App identity, suppress duplicate inline findings when the evidence has not changed, and use concise review bodies with clear section line breaks plus restrained section-heading emojis. Persona voice is prompt-guided only: RoboCop uses procedural security-officer phrasing, Lint Eastwood uses clipped build-sheriff phrasing, and Obi-Wan Code-nobi uses calm senior-reviewer phrasing.

Review personas:
- **RoboCop - AI Security Officer:** owns CodeQL, Dependency/Vulnerability Review, Malware Review, security-sensitive code paths, permissions/auth risk, and security interpretation.
- **Lint Eastwood - AI Build Sheriff:** owns lint failures, test failures, build/workflow failures, formatting/type-check style failures, and CI failure interpretation.
- **Obi-Wan Code-nobi - AI Code Reviewer:** owns general implementation review: correctness, maintainability, architecture, edge cases, missing tests, API/UX concerns, and overall code quality.

Security-alert aggregation:
- Daily workflows collect open CodeQL alerts plus non-urgent Dependabot vulnerability alerts and npm malware-classified Dependabot alerts. Each workflow also supports **Run workflow** from the Actions tab.
- The alert workflows keep scheduling in [`alert-codeql.yml`](workflows/alert-codeql.yml), [`alert-vulnerability.yml`](workflows/alert-vulnerability.yml), and [`alert-malware.yml`](workflows/alert-malware.yml). The fetching, grouping, validation, and synchronization implementation lives in the [Security Alerts composite action](actions/security-alerts/action.yml). The response must be valid JSON and must account for every source alert exactly once; validation happens before any issue is created or updated.
- Generated issues contain a stable marker derived from their feed and source-alert references, so subsequent runs update the same issue. Every issue is assigned to the repository owner and receives exactly one gray feed tag: `codeql`, `vulnerability`, or `malware`. These labels are provisioned on the repository and are not modified during workflow runs.
- Required repository configuration: `OPENAI_API_KEY` secret, `SECURITY_ALERTS_TOKEN` secret, `OPENAI_PROJECT_ID` repository variable, and `SECURITY_ALERTS_PROJECT_ID` repository variable (the node ID of the Notoli GitHub Project v2). `SECURITY_ALERTS_TOKEN` must be a classic token with `repo`, `security_events`, and `project` scopes, or an equivalent GitHub App/fine-grained token that can read CodeQL and Dependabot alerts, write issues, and write to the Project.
- The project must include these fields and options: `Status` → `Backlog`, `Domain` → `CI/CD`, `Type` → `Security`, `Priority` → `P1`/`P2`, `Size` → `M`, and numeric `Estimate` (set to `3`). CodeQL and malware groups use `P1`; non-urgent vulnerability groups use `P2`. The workflows require and write all of them.
- `GITHUB_TOKEN` is limited to `contents: read` for checkout. `SECURITY_ALERTS_TOKEN` performs all alert, issue, label, assignment, and Project v2 API calls, because Project v2 writes require a token with Project access and Dependabot-alert access is token-specific.

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
  - Docker (`/`, `/backend`, `/frontend`)

Auto-merge behavior:
- Dependabot PRs go through CI (`ci-orchestrator.yml`), and if all gates pass, `ci-auto-merge.yml` can enable auto-merge.
- Passing Dependabot PRs do not receive AI reviews. Lint Eastwood runs only when lint or test gates fail; RoboCop runs only when CodeQL, vulnerability, or malware gates fail; Obi-Wan Code-nobi is always skipped for Dependabot.
- Auto-merge is restricted to patch/minor updates.
- If a security alert is present, the workflow requires CVSS <= 6.9.
- The workflow uses `dependabot/fetch-metadata@v2` and can optionally use `DEPENDABOT_PAT` for metadata/alert lookup.
