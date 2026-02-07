# 📝 Notoli  
**A Notion-Inspired To-Do List App**
Notoli is my personalized take on a to-do list application, inspired by the flexibility of Notion databases.
Itâ€™s designed to support **multiple views** of the same list, so my wife, Diana, and I can each use the app in the way that works best for us, whether thatâ€™s a clean, simple Notes-style interface or a more detailed, database-like workflow.

## ✨ Features
- **Workspaces â†’ TodoLists â†’ Notes** hierarchy
- **JWT auth** (register/login/refresh) with an email-first login flow
- **Sane defaults**: new accounts get a default workspace automatically
- **Fast CRUD UI**: add, edit, and delete items inline
- **Access scoping**: the API limits objects by `owner`/`created_by`/`collaborators`
- **Flexible organization**: notes can appear in multiple todo lists (many-to-many)
- **Path-based hosting**: designed to run under a subpath like `/apps/notoli`
- **Dockerized deployment**: frontend + backend + Nginx reverse proxy

## 🚀 Tech Stack
**Backend:** Django
**Frontend:** React + Material UI
**Environment Management:** Conda
**Deployment:** Docker
**Hosting:** DigitalOcean
**DNS/Proxy:** Cloudflare
**CI/CD & Workflows:** Github Actions

## 📚 Documentation
- Setup, env vars, and common commands: [`AGENTS.md`](AGENTS.md)
- Backend (API, auth, data model): [`backend/README.md`](backend/README.md)
- Frontend (routing, API base URL): [`frontend/README.md`](frontend/README.md)
- Deployment (Docker + Nginx): [`deploy/README.md`](deploy/README.md)
- CI/CD + automation: [`.github/README-WORKFLOWS.md`](.github/README-WORKFLOWS.md)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md)

## 📜 License
This project is licensed under a **Modified MIT License (Non-Commercial Use Only)**.
See the [LICENSE](./LICENSE) file for full details.

## 🙏 Acknowledgments
This project includes code from [`conda_export.py`](https://github.com/andresberejnoi/Conda-Tools) by **Andres Berejnoi**,
used under the terms of the original [MIT License](https://opensource.org/licenses/MIT).
