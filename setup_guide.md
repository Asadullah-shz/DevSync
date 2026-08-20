# DevSync Server & Client Setup Guide

This guide walks you through deploying the **DevSync Server** on your old laptop (acting as the central storage server) and connecting your developer machines (clients) to synchronize your folders automatically.

---

## 🛠 Part 1: Setting up the Server (Old Laptop)

You will run the DevSync server inside **Docker** on your old laptop. This keeps dependencies clean and handles automatic restarts if the laptop reboots.

### 1. Install Docker & Docker Compose
- **Ubuntu/Linux (Recommended for old laptops):**
  ```bash
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  ```
- **Windows / macOS:** Install [Docker Desktop](https://www.docker.com/products/docker-desktop/).

### 2. Copy DevSync Files
Copy the following files to a folder on your old laptop (e.g., `~/devsync-server`):
- `docker-compose.yml` (or `docker-compose.tunnel.yml`)
- `docker.env` (Rename `docker.env.example` to `docker.env` and fill in secrets)
- `tunnel/` directory (if using Cloudflare Tunnel)

### 3. Expose Server to the Internet (Choose Option A or B)

To sync from multiple devices outside your home network, the client machines need to reach the laptop.

#### Option A: Cloudflare Tunnel (Recommended - No Port Forwarding Required)
Cloudflare Tunnel creates a secure outbound connection from your old laptop to Cloudflare, mapping it to a free custom domain (e.g., `devsync.yourdomain.com`).

1. Create a free Cloudflare account and add a domain.
2. Go to **Zero Trust Dashboard** -> **Access** -> **Tunnels** -> **Create a Tunnel**.
3. Name your tunnel and copy the **Tunnel Token**.
4. In your `tunnel/config.yml` on the laptop:
   ```yaml
   tunnel: YOUR_TUNNEL_UUID
   credentials-file: /home/nonroot/.cloudflared/YOUR_TUNNEL_UUID.json
   ingress:
     - hostname: devsync.yourdomain.com
       service: http://server:3000
     - service: http_status:404
   ```
5. Place the credentials JSON file inside the `tunnel/` folder.
6. Run the stack:
   ```bash
   docker compose -f docker-compose.tunnel.yml up -d
   ```

#### Option B: Tailscale VPN (Private LAN-Only)
If you do not want to expose the server to the public internet, use Tailscale.
1. Install [Tailscale](https://tailscale.com/) on the old laptop and all client devices.
2. Log into the same Tailscale account on all machines.
3. Note the Tailscale IP of your old laptop (e.g., `100.80.90.100`).
4. Run the standard Docker Compose on the laptop:
   ```bash
   docker compose up -d
   ```
5. Clients will connect to `http://100.80.90.100:3000`.

---

## 💻 Part 2: Connecting Client Devices

Once the server status dot is green, you can connect your development machines.

### 1. Install DevSync Desktop Client
Run the installer we generated on your developer machines:
- Windows: Run `DevSync Setup 1.0.0.exe` (found in `apps/desktop/dist-package/`)

### 2. Log in
1. Launch the DevSync Desktop App.
2. If this is a new installation, click **Login with GitHub** or **Login with Google** (SSO), or type in your admin email/password.
3. Ensure the target API URL points to your old laptop:
   - Public Tunnel URL: `https://devsync.yourdomain.com`
   - Tailscale Private IP: `http://100.80.90.100:3000`

### 3. Register the Client Device
- Upon logging in for the first time on a machine, the app will ask to register the device.
- Enter a friendly name (e.g., `MacBook-Pro-Work` or `Gaming-PC`) to identify it.
- **Admin Approval:** If the workspace policy `Require Device Approval` is enabled, go to the PWA Web Dashboard on the laptop (`http://localhost:3000/dashboard`) and click **Approve** next to the newly registered device.

### 4. Create or Join a Workspace & Start Syncing
1. Select **Workspaces** -> Create a workspace or join an existing one.
2. Click **Add Project** -> Select the local code directory you want to synchronize.
3. DevSync will instantly run an initial sync, index files, and monitor directories in real-time. Any changes will immediately reflect across your laptop storage and sync onto all other approved devices!

---

## 🚨 Disaster Recovery (Restoring Backups)
DevSync automatically writes backup files into your `/backups` directory on the laptop.

If the old laptop's hard drive crashes:
1. Re-install Docker on a new machine.
2. Mount the old `/backups` directory.
3. Start the DevSync Docker container.
4. The server will detect 0 users on boot, scan the backup directory, and **autonomously restore the entire database and object files**! You're back online in seconds.
