# Excalidraw Desktop Wrapper + Self-hosted Server (Render)

This repository contains:

- `app/`: A Tauri desktop app that opens a user-configured Excalidraw Server URL.
- `server/`: A Dockerized self-hosted Excalidraw server suitable for Render with WebSockets for real-time collaboration.

## Quick Start (Desktop)

1. Install prerequisites: Node 20+, Rust (stable), Tauri deps.
2. Install deps and run:

   ```bash
   cd app
   npm ci
   npm run dev
   ```

3. Enter your deployed server URL (HTTPS) and click Save & Launch.

## Deploy the Server on Render

You can deploy the server in the `/server` directory using Render.

- Render will detect `render.yaml` at the repo root and build using `/server` as the root directory via `rootDir`.
- After deployment, copy the service URL (e.g., `https://your-app.onrender.com`) into the desktop app.

### Manual steps on Render

1. New Web Service → Select this GitHub repo.
2. Root Directory: `/server`.
3. Runtime: Docker → `server/Dockerfile`.
4. Environment:
   - `PORT=3000`
   - `STORAGE_TYPE=filesystem` (or `sqlite` / `s3`)
   - `STORAGE_PATH=/data`
5. Add persistent disk: name `data`, mount `/data`, size `1GB`.
6. Create service. Use the URL shown for the desktop app.

## CI (GitHub Actions)

Pushing a tag `v*.*.*` will build installers for Windows, macOS, and Linux and publish to GitHub Releases.

## Security Notes

- The app requires an HTTPS server URL and restricts Content Security Policy accordingly.
- For small teams (2–5 users), `filesystem` or `sqlite` storage with a small disk is sufficient.
