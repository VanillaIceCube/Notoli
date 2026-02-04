# AGENTS.md

This repo uses manual setup steps so Codex does not assume Django or Node are installed.
Follow one of the setup paths below before running the app.

## Setup (local dev with Conda)
1) Create or update the Conda environment:
   - create: `conda env create -f backend/environment.yml`
   - update: `conda env update --file backend/environment.yml --prune`
2) Activate: `conda activate notoli_env`
3) Optional env vars (defaults are used if unset):
   - `DJANGO_SECRET_KEY` (default: `default-key`)
   - `DJANGO_DEBUG` (default: `1`)
   - `DJANGO_SQLITE_PATH` (default: `backend/db.sqlite3`)
   - `DJANGO_ALLOWED_HOSTS` (comma-separated)
   - `DJANGO_CORS_ALLOWED_ORIGINS` (comma-separated)
   - `DJANGO_CSRF_TRUSTED_ORIGINS` (comma-separated)
   - `DJANGO_FORCE_SCRIPT_NAME` (default: unset; set to `/apps/notoli` for path-based routing)
4) Run backend migrations: `python backend/manage.py migrate`
5) Start backend: `python backend/manage.py runserver 8000`
6) Frontend setup:
   - `cd frontend`
   - `npm install`
   - Optional: set `REACT_APP_API_BASE_URL` (default: `http://localhost:8000`)
     - For production builds, set this to `https://api.judeandrewalaba.com/apps/notoli`
   - `npm start`

## Setup (Docker)
1) Create a `.env` in `deploy/` (see `deploy/backend.env` for keys).
   - On servers, ensure the `.env` lives next to `docker-compose.yml` (it is hidden).
2) Ensure the SQLite file exists when using the bind mount:
   - `cd deploy`
   - `touch db.sqlite3` (prevents Docker from creating a directory named `db.sqlite3`).
3) Start:
   - `cd deploy`
   - `docker compose up -d`
4) The included reverse proxy serves the frontend at:
   - `http://localhost/apps/notoli/`
   Backend is exposed on the direct port:
   - `http://localhost:8000`
   Frontend is still available at `http://localhost:3000`.

## Maintenance
- Backend migrations: `python backend/manage.py makemigrations` then `python backend/manage.py migrate`
- Update Conda env: `conda env update --file backend/environment.yml --prune`
- Regenerate Conda env + requirements:
  - `python backend/environment_manager.py export -o backend/environment.yml`
- Frontend deps: `cd frontend` then `npm install`
- Note: pip dependencies are installed via the `pip:` section in `environment.yml`
  and resolved from `requirements.txt` (never via conda).
  
