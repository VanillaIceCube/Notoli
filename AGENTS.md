# AGENTS.md

This repo uses manual setup steps so Codex does not assume Django or Node are installed.
Follow one of the setup paths below before running the app.

## Setup (local dev with Conda)
1) Create or update the Conda environment:
   - create: `conda env create -f backend/environment.yml`
   - update: `conda env update --file backend/environment.yml --prune`
2) Activate: `conda activate notoli_env`
3) Optional env vars (defaults are used if unset):
   - `SECRET_KEY` (default: `default-key`)
   - `DEBUG` (default: `1`)
   - `SQLITE_PATH` (default: `backend/db.sqlite3`)
   - `ALLOWED_HOSTS` (comma-separated)
   - `CORS_ALLOWED_ORIGINS` (comma-separated)
4) Run backend migrations: `python backend/manage.py migrate`
5) Start backend: `python backend/manage.py runserver 8000`
6) Frontend setup:
   - `cd frontend`
   - `npm install`
   - Optional: set `REACT_APP_API_BASE_URL` (default: `http://127.0.0.1:8000`)
   - `npm start`

## Setup (Docker)
1) Create a `.env` at repo root (see `backend.env` for keys).
2) Start: `docker compose up -d`
3) Frontend will be at `http://localhost:3000` and backend at `http://localhost:8000`.

## Maintenance
- Backend migrations: `python backend/manage.py makemigrations` then `python backend/manage.py migrate`
- Update Conda env: `conda env update --file backend/environment.yml --prune`
- Regenerate Conda env + requirements:
  - `python backend/environment_conda_export.py export -o backend/environment.yml`
- Frontend deps: `cd frontend` then `npm install`
- Note: pip dependencies are installed via the `pip:` section in `environment.yml`
  and resolved from `requirements.txt` (never via conda).
  