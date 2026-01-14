# Notoli
A Notion-inspired to-do list app with a simple, focused UI and a Django REST API.

## Overview
- Organize tasks into Workspaces, Todo Lists, and Notes.
- Notes can belong to multiple Todo Lists (many-to-many).
- JWT auth for login/refresh; API access is scoped to owners/creators/collaborators.
- React + Material UI frontend with workspace navigation and inline CRUD.

## Repository layout
- `backend/`: Django 5 + Django REST Framework API.
- `frontend/`: React 19 + MUI 7 app.
- `docker-compose.yml`: Runs prebuilt backend/frontend images.
- `.github/workflows/`: CI linting and PR summary automation.

## Local dev (Conda)
This repo uses manual setup steps so Codex does not assume Django or Node are installed.

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

## Docker
1) Create a `.env` at repo root (see `backend.env` for keys).
2) Start: `docker compose up -d`
3) Frontend will be at `http://localhost:3000` and backend at `http://localhost:8000`.

## API endpoints
Auth:
- `POST /auth/register/` -> `{ "username", "password" }`
- `POST /auth/login/` -> `{ "username", "password" }` (returns `access`, `refresh`)
- `POST /auth/refresh/` -> `{ "refresh" }`

Notes API (requires `Authorization: Bearer <token>`):
- `GET/POST /api/workspaces/`
- `GET/PATCH/DELETE /api/workspaces/{id}/`
- `GET/POST /api/todolists/?workspace={workspaceId}`
- `GET/PATCH/DELETE /api/todolists/{id}/`
- `GET/POST /api/notes/?todo_list={todoListId}`
- `GET/PATCH/DELETE /api/notes/{id}/`

Creation rules:
- Todo List creation requires a workspace you have access to.
- Note creation requires `todo_list` in the payload and enforces access to that list.

## Frontend routes
- `/login`: login screen
- `/`: workspace list
- `/workspace/:workspaceId`: todo lists in a workspace
- `/workspace/:workspaceId/todolist/:todoListId`: notes in a list

## Environment variables
Backend:
- `SECRET_KEY` (default: `default-key`)
- `DEBUG` (default: `1`)
- `SQLITE_PATH` (default: `backend/db.sqlite3`)
- `ALLOWED_HOSTS` (comma-separated)
- `CORS_ALLOWED_ORIGINS` (comma-separated)

Frontend:
- `REACT_APP_API_BASE_URL` (default: `http://127.0.0.1:8000`)

## Tests
- Backend: `python backend/manage.py test`
- Frontend: `cd frontend` then `npm test`

## CI and tooling
- Linting: ESLint + Prettier (frontend), Ruff (backend).
- PR summaries: GitHub Action that posts a high-level diff summary (requires `OPENAI_API_KEY` and `OPENAI_PROJECT_ID` secrets).

## License
This project is licensed under a Modified MIT License (Non-Commercial Use Only).
See `LICENSE.md` for full details.

## Acknowledgments
This project includes code from `conda_export.py` by Andres Berejnoi:
https://github.com/andresberejnoi/Conda-Tools
