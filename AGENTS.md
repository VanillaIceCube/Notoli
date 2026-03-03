# AGENTS.md

This repo uses manual setup steps so Codex does not assume Django or Node are installed.
Follow one of the setup paths below before running the app.

Documentation: When you change setup, routing, env vars, or deploy steps, update `AGENTS.md`.
Also update the relevant README(s):
- Root overview: `README.md`
- Backend/API/auth: `backend/README.md`
- Frontend/routing/API base URL: `frontend/README.md`
- Deployment/Docker/Nginx: `deploy/README.md`
- CI/CD, Dependabot, workflows: `.github/README-WORKFLOWS.md`
Also update `CHANGELOG.md`.

## Changelog format
When updating `CHANGELOG.md`, add a new dated section at the top and group entries under:
- `### Added`
- `### Fixed`
- `### Changed`
- `### Removed`
Omit any empty groups (do not include a heading if there are no entries for it).
Keep headings in that order and ensure each entry is filed under the correct group.

Template:

```md
## YYYY-MM-DD
### Added
- ...
### Fixed
- ...
### Changed
- ...
### Removed
- ...
```

Infra: Production runs behind Cloudflare (DNS/proxy) on a DigitalOcean VM. If you change domains, paths (e.g. `/apps/notoli`), or add new backend routes, also review:
- Cloudflare DNS/proxy settings and any Redirect/WAF/Caching rules
- Origin reverse-proxy config: `deploy/nginx-proxy.conf`
- Deploy-time env/vars: `DJANGO_ALLOWED_HOSTS`, `DJANGO_CORS_ALLOWED_ORIGINS`, `DJANGO_CSRF_TRUSTED_ORIGINS`, `REACT_APP_API_BASE_URL`
  - Password reset mail vars: `DJANGO_FRONTEND_BASE_URL`, `DJANGO_EMAIL_BACKEND`, `DJANGO_EMAIL_HOST`, `DJANGO_EMAIL_PORT`, `DJANGO_EMAIL_USE_TLS`, `DJANGO_EMAIL_HOST_USER`, `DJANGO_EMAIL_HOST_PASSWORD`, `DJANGO_DEFAULT_FROM_EMAIL`

## Setup (local dev with Conda)
1) Create or update the Conda environment:
   - create: `conda env create -f backend/environment.yml`
   - update: `conda env update --file backend/environment.yml --prune`
2) Activate: `conda activate notoli_env`
3) Optional backend `.env` for local non-Docker runs:
   - `backend/.env` is auto-loaded by Django settings (`python-dotenv`).
   - Add `DJANGO_*` keys there if you don't want to set shell vars manually.
4) Optional env vars (defaults are used if unset):
   - `DJANGO_SECRET_KEY` (default: `default-key`)
   - `DJANGO_DEBUG` (default: `1`)
   - `DJANGO_SQLITE_PATH` (default: `backend/db.sqlite3`)
   - `DJANGO_ALLOWED_HOSTS` (comma-separated)
   - `DJANGO_CORS_ALLOWED_ORIGINS` (comma-separated)
   - `DJANGO_CSRF_TRUSTED_ORIGINS` (comma-separated)
   - `DJANGO_FORCE_SCRIPT_NAME` (default: unset; set to `/apps/notoli` for path-based routing)
   - `DJANGO_FRONTEND_BASE_URL` (default: `http://localhost:3000`; used in password-reset email links)
   - `DJANGO_EMAIL_BACKEND` (default: `django.core.mail.backends.console.EmailBackend`)
   - `DJANGO_EMAIL_HOST` (default: `smtp.resend.com`)
   - `DJANGO_EMAIL_PORT` (default: `587`)
   - `DJANGO_EMAIL_USE_TLS` (default: `1`)
   - `DJANGO_EMAIL_HOST_USER` (default: `resend`)
   - `DJANGO_EMAIL_HOST_PASSWORD` (Resend API key when using SMTP backend)
   - `DJANGO_DEFAULT_FROM_EMAIL` (default: `notoli@example.com`)
5) Run backend migrations: `python backend/manage.py migrate`
6) Start backend: `python backend/manage.py runserver 8000`
7) Frontend setup:
   - `cd frontend`
   - `npm install`
   - Optional: set `REACT_APP_API_BASE_URL` (default: `http://localhost:8000`)
     - For production builds, set this to `https://judeandrewalaba.com/apps/notoli`
   - `npm start`

## Setup (Docker)
1) Create a `.env` in `deploy/` (see `deploy/backend.env` for keys).
   - On servers, ensure the `.env` lives next to `docker-compose.yml` (it is hidden).
2) Ensure the TLS cert files exist for the reverse proxy:
   - Production (Cloudflare Origin Certificate):
     - `/root/apps/notoli/certs/origin.pem`
     - `/root/apps/notoli/certs/origin.key`
   - Optional (automated deploy): store raw PEM values in GitHub Secrets:
     - `CLOUDFLARE_ORIGIN_CERT_PEM` (raw PEM of `origin.pem`)
     - `CLOUDFLARE_ORIGIN_KEY_PEM` (raw PEM of `origin.key`)
   - These are mounted into the proxy container as `/etc/nginx/certs` (see `deploy/docker-compose.yml`).
3) Ensure the SQLite file exists when using the bind mount:
   - `cd deploy`
   - `touch db.sqlite3` (prevents Docker from creating a directory named `db.sqlite3`).
4) Start:
   - `cd deploy`
   - `docker compose up -d`
5) The included reverse proxy serves the frontend at:
   - `https://localhost/apps/notoli/` (HTTP redirects to HTTPS)
   Backend is exposed on the direct port:
   - `http://localhost:8000`
   Frontend is still available at `http://localhost:3000`.

## Production Routing Notes
- Public URLs (path-based):
  - Frontend: `https://judeandrewalaba.com/apps/notoli`
  - Backend:
    - `https://judeandrewalaba.com/apps/notoli/api`
    - `https://judeandrewalaba.com/apps/notoli/auth`
    - `https://judeandrewalaba.com/apps/notoli/admin`
  - Frontend public auth routes:
    - `https://judeandrewalaba.com/apps/notoli/login`
    - `https://judeandrewalaba.com/apps/notoli/register`
    - `https://judeandrewalaba.com/apps/notoli/forgot-password`
    - `https://judeandrewalaba.com/apps/notoli/reset-password`
- Cloudflare -> origin TLS (Full strict):
  - Generate a Cloudflare Origin Certificate for `judeandrewalaba.com` and `*.judeandrewalaba.com`.
  - Save it on the droplet at:
    - `/root/apps/notoli/certs/origin.pem`
    - `/root/apps/notoli/certs/origin.key`
  - Set Cloudflare SSL/TLS mode to `Full (strict)`.
- Required env vars for the path-based backend:
  - `DJANGO_FORCE_SCRIPT_NAME=/apps/notoli`
  - `DJANGO_ALLOWED_HOSTS=judeandrewalaba.com,www.judeandrewalaba.com`
  - `DJANGO_CORS_ALLOWED_ORIGINS=https://judeandrewalaba.com,https://www.judeandrewalaba.com`
  - `DJANGO_CSRF_TRUSTED_ORIGINS=https://judeandrewalaba.com,https://www.judeandrewalaba.com`
- Frontend API base for production builds:
  - `REACT_APP_API_BASE_URL=https://judeandrewalaba.com/apps/notoli`
- Frontend auth behavior:
  - Tokens live in `sessionStorage` (`accessToken`/`refreshToken`).
  - Any backend `401` from non-auth endpoints clears tokens and redirects to `/login` (under the `PUBLIC_URL` basename, e.g. `/apps/notoli/login`) and shows an error snackbar on the login page.
  - Forgot/reset password endpoints:
    - `POST /auth/forgot-password/` accepts `email` and always returns a generic success message.
    - `POST /auth/reset-password/` accepts `uid`, `token`, and `password`.
  - Profile endpoint:
    - `PATCH /auth/profile/` (authenticated) updates the current user's `username`.

## Maintenance
- Backend migrations: `python backend/manage.py makemigrations` then `python backend/manage.py migrate`
- Update Conda env: `conda env update --file backend/environment.yml --prune`
- Regenerate Conda env + requirements:
  - `python backend/environment_manager.py export -o backend/environment.yml`
- Frontend deps: `cd frontend` then `npm install`
- Note: pip dependencies are installed via the `pip:` section in `environment.yml`
  and resolved from `requirements.txt` (never via conda).
