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
- For non-Dependabot PRs, runs [`.github/workflows/commentary.yml`](workflows/commentary.yml)
  - Generates an OpenAI-written PR summary and PR review
  - Posts the summary to the PR description or as a comment
  - Creates a PR review with up to 6 inline comments (when line placement is valid)
- For Dependabot PRs, runs [`.github/workflows/auto_merge.yml`](workflows/auto_merge.yml) (only if lints + tests pass)

OpenAI inputs (commentary workflow):
- `OPENAI_API_KEY` (optional secret)
- `OPENAI_PROJECT_ID` (repo variable)

Version pins:
- Node version is read from `frontend/package.json` (`engines.node`)
- Python version is read from `backend/environment.yml` (`python=<version>`)

## 🚀 Flow 2: Deploy (`.github/workflows/deploy.yml`)
Trigger:
- Push to the `env-prod` branch
- Manual `workflow_dispatch`

What it does:
- Builds and pushes Docker images to GHCR:
  - `notoli-backend` (from `backend/Dockerfile`)
  - `notoli-frontend` (from `frontend/Dockerfile`)
- Uploads `deploy/docker-compose.yml` and `deploy/nginx-proxy.conf` to the server
- SSHes into the server, writes a `.env` file next to the compose file, then:
  - Prunes Docker images (`docker system prune -af`)
  - Pulls images + recreates containers
  - Runs Django migrations inside the backend container

Deployment prerequisite:
- For Cloudflare Full (strict), the origin must have a Cloudflare Origin Certificate.
- Option A (manual): provision on the server at `certs/origin.pem` and `certs/origin.key` (see `deploy/README.md`).
- Option B (automated): set GitHub Secrets `CLOUDFLARE_ORIGIN_CERT_PEM_B64` and `CLOUDFLARE_ORIGIN_KEY_PEM_B64` so the workflow uploads the files to `certs/` during deploy (raw PEM accepted).

Deploy inputs (GitHub repo vars / secrets):
- Server connection: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`, optional `DEPLOY_PORT`, secret `DEPLOY_SSH_KEY`
- Backend config: `DJANGO_SECRET_KEY` (secret), plus vars like `DJANGO_ALLOWED_HOSTS`, `DJANGO_CORS_ALLOWED_ORIGINS`, `DJANGO_CSRF_TRUSTED_ORIGINS`, `DJANGO_FORCE_SCRIPT_NAME`
- Frontend build arg: `REACT_APP_API_BASE_URL`

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
