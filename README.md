# DevSync 🔄

DevSync is a modern, real-time file synchronization and backup ecosystem designed for developers. It enables seamless file sharing, automated backups, and instant workspace synchronization across devices.

## 🚀 Features

- **Real-Time Synchronization**: Instantly sync workspace files across your desktop, server, and other devices.
- **Robust Backup Engine**: Support for local storage backups and external drive configurations with advanced conflict resolution.
- **Cross-Platform Desktop Client**: A sleek, Electron-powered desktop application to manage workspaces, monitor transfers, and view sync history.
- **Developer-First CLI**: A command-line tool for headless environments and quick terminal-based sync control.
- **Containerized Deployment**: Ready-to-go Docker configurations including pre-configured tunnels and proxies (Caddy).

---

## 📁 Repository Structure

The project is structured as a monorepo containing the following components:

- **`apps/desktop/`**: The Electron-based desktop interface for managing files, syncing status, and local databases.
- **`apps/server/`**: The core synchronization backend that handles webhooks, database operations, and user sessions.
- **`packages/cli/`**: The developer Command Line Interface (`dev-sync`) for quick terminal access.
- **`packages/`**: Shared TypeScript packages and utilities.
- **`tunnel/`**: Configuration files for secure reverse tunnels (Cloudflare Tunnel).

---

## 🛠️ Tech Stack

- **Frontend / Desktop**: Electron, React, TypeScript, Vite, TailwindCSS (or custom vanilla CSS)
- **Backend / APIs**: Node.js, Express, TypeScript, SQLite
- **Reverse Proxy**: Caddy
- **Containerization**: Docker, Docker Compose

---

## ⚙️ Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [npm](https://www.npmjs.com/) (v9+)
- [Docker & Docker Compose](https://www.docker.com/) (optional, for self-hosting)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Asadullah-shz/DevSync.git
   cd DevSync
   ```

2. Install dependencies for the workspace:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Copy `.env.example` to `.env` and fill in the required values:
   ```bash
   cp .env.example .env
   ```

### Running Locally

To run the entire workspace in development mode:

```bash
npm run dev
```

Alternatively, you can run individual applications:

- **Desktop App**: `npm run dev -w apps/desktop`
- **Server**: `npm run dev -w apps/server`

---

## 🐳 Running with Docker

You can spin up the DevSync server and database using Docker Compose:

```bash
docker-compose up -d
```

For Cloudflare Tunnel setup:

```bash
docker-compose -f docker-compose.tunnel.yml up -d
```

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
