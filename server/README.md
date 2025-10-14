# Excalidraw Server (Render)

This directory contains a Docker image for a self‑hosted Excalidraw server with real‑time collaboration using `excalidraw-complete`.

## Deploy on Render

Option A — One‑click (uses repository `render.yaml`):

1. Open the Deploy to Render link in the repository README.
2. Render will detect `render.yaml` at the repository root and create the service using `/server` as the root directory.

Option B — Manual via Render dashboard:

1. New Web Service → Connect this repo.
2. Select Root Directory: `/server`.
3. Runtime: Docker; Dockerfile path: `server/Dockerfile`.
4. Environment variables:
   - `PORT=3000`
   - `STORAGE_TYPE=filesystem` (or `sqlite` / `s3`)
   - `STORAGE_PATH=/data` (required for `filesystem`/`sqlite`)
5. Add a Persistent Disk named `data` mounted at `/data` (1GB is fine for small teams).
6. Create Web Service. After deploy, your server URL is shown (e.g., `https://your-app.onrender.com`). Paste this URL into the desktop app.

## Notes

- Use HTTPS (Render provides TLS).
- For small teams (2–5 users), `filesystem` or `sqlite` storage with a small disk is sufficient.
- To pin a specific server version, set the Docker build arg `VERSION` (e.g., `VERSION=v0.6.3`).
