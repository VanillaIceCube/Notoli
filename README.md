# 📝 Notoli

**A personal list application inspired by Notion**

Notoli is my personalized take on a list application, inspired by the
flexibility of Notion databases. It is designed so my wife, Diana, and I can
each use our lists in the way that works best for us, from a simple task
interface to a more structured view.

<details>
<summary>A note from the author</summary>

Okay, so a long time ago, I got really into Notion, then I built an entire dashboard with multiple pages and views, primarily for task tracking, and onboarded Diana and I. And we were happily using it for like 4 months, before Notion told us we ran out of our 'free blocks'. At that point, I had personally sunk in embarrassingly, 10s of hours creating and setting everything up. And Diana liked it for now, so we were like. Well, we can't just chuck it away, we like it, so we both paid for premium, so we could have accounts. Anyways that was like $20 a month :/.

I said, no worries wifey, I recently created and deployed my personal website. I can make us a shared-todo list application no problem! Took maybe like 9 months 😢. And THUS, NOTOLI was born.

The main premise was that I wanted to create a shared todo-list application with multiple views! A more minimalistic view for Diana, and a more detail that I really want view for me!

Anyways, the views didn't happen. What really happened was I got the basics of the todo list happening, with shared workspaces, then battled with deployment, ci/cd, buying my domain, sshing in to find stuff on fire, nuking the database a couple times, learning that I can't run off of the smallest vm digital ocean had to offer, oh, I learned docker, so that was neat. Yeah, basically, my personal site was deployed via app services, which just pointed at a repo. And that would've been $7 per app service. For personal apps, which are meant for really just my wife and I. So that made no sense. I had to learn docker, and then purchase a droplet (a VM), to host all those containers. Much more price efficient, but also made me want to rip my hair out.

Anyways, it's deployed and works! And Diana and I use it today! Check it out!

- [https://notoli.judeandrewalaba.com](https://notoli.judeandrewalaba.com)

</details>

## ✨ Features

- Boards, lists, and tasks with completion tracking.
- Flexible organization and drag-and-drop ordering.
- Board sharing, collaboration, and in-app notifications.
- Email-first accounts, protected pages, and password recovery.
- A ChatGPT integration for working with boards, lists, and tasks.

## 🚀 Tech stack

- **Frontend:** React, Vite, and Material UI.
- **Backend:** Django REST Framework and JWT authentication.
- **Development and hosting:** Docker, Nginx, and GitHub Actions.

## 📚 Documentation

- [Backend](backend/README.md) — setup, APIs, authentication, email, and MCP.
- [Frontend](frontend/README.md) — setup, pages, components, and tests.
- [Deployment](deploy/README.md) — local Docker, configuration, and live-server guides.
- [GitHub setup and workflows](.github/_README.md) — first-PR setup and automation.
- [Changelog](CHANGELOG.md) — project updates.

## 📜 License

[Modified MIT License (Non-Commercial Use Only)](LICENSE.md).
Commercial use requires separate permission from the copyright holder.
