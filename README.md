# 📝 Notoli
**A Notion-Inspired To-Do List App**
Notoli is my personalized take on a list application, inspired by the flexibility of Notion databases.
It's designed to support **multiple views** of the same list, so my wife, Diana, and I can each use the app in the way that works best for us, whether that's a clean, simple Notes-style interface or a more detailed, database-like workflow.

## ✨ Features
- **Boards -> Lists -> Notes** hierarchy
- **JWT auth** (register/login/refresh) with an email-first login flow
- **Password reset by email** via secure tokenized reset links
- **Sane defaults**: new accounts get a default board automatically
- **Fast CRUD UI**: add, edit, and delete items inline
- **Manual ordering**: reorder lists and notes with an intentional drag-and-drop mode
- **Access scoping**: the API limits objects by `owner`/`created_by`/`collaborators`
- **In-app notifications**: shared board activity appears under the app bar bell with persistent read state and links back to the relevant board or list
- **Flexible organization**: notes can appear in multiple lists with per-list ordering
- **Subdomain hosting**: designed to run at `https://notoli.judeandrewalaba.com`
- **Dockerized deployment**: frontend + backend + Nginx reverse proxy

## 🚀 Tech Stack
- **Backend:** Django
- **Frontend:** React + Material UI
- **Environment Management:** Conda
- **Deployment:** Docker
- **Hosting:** DigitalOcean
- **DNS/Proxy:** Cloudflare
- **TLS:** Cloudflare Full (strict) to origin (Cloudflare Origin Certificate)
- **CI/CD & Workflows:** GitHub Actions
- **PR dependency gates:** high/critical vulnerability review and npm malware advisory review
- **Daily security planning:** LLM-grouped CodeQL and Dependabot alert issues, synchronized with the Notoli GitHub Project

## 📚 Documentation
- Setup, Codex cloud environment settings, env vars, and common commands: [`AGENTS.md`](AGENTS.md)
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
