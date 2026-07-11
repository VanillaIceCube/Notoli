# 🤖 GitHub Automation
This repo uses GitHub Actions for CI and deployments, plus Dependabot for dependency updates.

## ✅ Flow 1: CI (`.github/workflows/ci.yml`)
Trigger:
- Pull requests (opened/synchronize/reopened/ready_for_review)

What it does:
- Runs the reusable lint workflow: [`.github/workflows/lints.yml`](workflows/lints.yml)
  - Frontend: Prettier + ESLint (auto-fix, then strict checks)
  - Backend: Ruff (auto-fix, then strict checks)
- Runs the reusable test workflow: [`.github/workflows/tests.yml`](workflows/tests.yml)
  - Frontend: `npm test` (CI mode)
  - Backend: `python manage.py test`
- Lint and test jobs use the same change filters:
  - Frontend checks run for `frontend/**` changes.
  - Backend checks run for `backend/**` changes.
  - Changes under `.github/workflows/**` or `.github/actions/**` run both frontend and backend checks because shared CI behavior may affect either stack.
  - Jobs skipped because their paths are not relevant report `not-applicable` to PR commentary.
- Runs the reusable CodeQL workflow: [`.github/workflows/codeql.yml`](workflows/codeql.yml)
  - Python/Django backend analysis for `backend/**`
  - JavaScript/TypeScript frontend analysis for `frontend/**`
  - GitHub Actions workflow analysis for `.github/workflows/**` and `.github/actions/**`
- Runs the reusable vulnerability review: [`.github/workflows/vulnerability.yml`](workflows/vulnerability.yml)
  - Uses GitHub Dependency Review and fails when a PR introduces a high or critical vulnerability.
- Runs the reusable malware review: [`.github/workflows/malware.yml`](workflows/malware.yml)
  - Uses the local [npm malware review action](actions/review-npm-malware/action.yml) to compare changed `frontend/package-lock.json` packages against GitHub's npm malware advisories.
  - Updates one PR summary comment and fails when a changed package/version matches a known malware advisory.
- For non-Dependabot PRs, runs [`.github/workflows/commentary.yml`](workflows/commentary.yml)
  - Generates an OpenAI-written PR summary and PR review
  - Posts the summary to the PR description or as a comment
  - Creates a PR review with up to 6 inline comments (when line placement is valid)
- For Dependabot PRs, runs [`.github/workflows/auto_merge.yml`](workflows/auto_merge.yml) only when lints, tests, vulnerability review, and malware review pass.

OpenAI inputs (commentary workflow):
- `OPENAI_API_KEY` (optional secret)
- `OPENAI_PROJECT_ID` (repo variable)
- PR summaries and AI reviews use `gpt-5.5` through the local OpenAI Chat Completions action.

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
