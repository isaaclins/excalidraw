# Quick Start Guide

## What's Been Built

✅ **Clean Server** (`excalidraw-server/`)

- Removed all Firebase dependencies
- Removed AWS storage
- Removed frontend embedding
- Simplified to just WebSocket collaboration + document API
- Organized handlers into separate modules

✅ **Tauri Desktop App** (`excalidraw-app/`)

- React + TypeScript frontend with Excalidraw
- Rust backend with SQLite for local storage
- Connection dialog for server configuration
- Auto-save functionality
- Real-time collaboration support

✅ **Startup Scripts**

- `start-server.sh` - Launches Go server with dependency checks
- `start-app.sh` - Launches Tauri app with dependency checks

✅ **Documentation**

- Root README with overview
- Server README with API docs and deployment guide
- App README with architecture and troubleshooting

## Quick Test

### 1. Test Server Only

```bash
./start-server.sh
```

Expected output:

```
🚀 Starting Excalidraw Server...
✓ Go found: go version go1.21...
📝 Configuration:
   Storage Type: sqlite
   Data Source: ./excalidraw.db
   Log Level: info

🔨 Building server...
▶️  Starting server on :3002...
```

Test it works:

```bash
curl http://localhost:3002/socket.io/
# Should return Socket.IO handshake response
```

### 2. Test App (Offline Mode)

In a new terminal:

```bash
./start-app.sh
```

When the app opens:

1. Click "Work Offline"
2. Start drawing
3. Close and reopen the app
4. Your drawing should be saved!

### 3. Test Collaboration

**Terminal 1** - Start server:

```bash
./start-server.sh
```

**Terminal 2** - Start first app instance:

```bash
./start-app.sh
```

- Click "Connect to Server"
- Enter URL: `http://localhost:3002`
- Enter room ID: `test-room`
- Start drawing

**Terminal 3** - Start second app instance:

```bash
cd excalidraw-app
npm run tauri dev
```

- Click "Connect to Server"
- Enter URL: `http://localhost:3002`
- Enter room ID: `test-room`
- You should see the other user's drawings!

## Repository Structure

```
/excalidraw-app/ (root)
│
├── excalidraw-app/          # Tauri desktop application
│   ├── src/
│   │   ├── components/
│   │   │   ├── ConnectionDialog.tsx
│   │   │   ├── ConnectionDialog.css
│   │   │   └── ExcalidrawWrapper.tsx
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   ├── storage.ts
│   │   │   └── websocket.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── src-tauri/
│   │   ├── src/
│   │   │   ├── commands.rs
│   │   │   ├── db.rs
│   │   │   └── lib.rs
│   │   └── Cargo.toml
│   └── package.json
│
├── excalidraw-server/       # Go collaboration server
│   ├── handlers/
│   │   ├── api/
│   │   │   └── documents/
│   │   │       └── documents.go
│   │   └── websocket/
│   │       └── collab.go
│   ├── stores/
│   │   ├── storage.go
│   │   ├── memory/
│   │   ├── filesystem/
│   │   └── sqlite/
│   ├── core/
│   │   └── entity.go
│   ├── main.go
│   ├── go.mod
│   └── .env.example
│
├── start-server.sh
├── start-app.sh
├── README.md
└── .gitignore
```

## Key Features Implemented

### Desktop App

- ✅ Connection dialog on startup
- ✅ Local SQLite storage
- ✅ Auto-save (1 second debounce)
- ✅ Server connection support
- ✅ Real-time collaboration
- ✅ Offline mode

### Server

- ✅ WebSocket collaboration via Socket.IO
- ✅ Room-based collaboration
- ✅ User presence tracking
- ✅ Document save/load API
- ✅ Configurable storage backends
- ✅ Clean, minimal codebase

## Next Steps

1. **Test the basics**: Follow the test steps above
2. **Customize**: Modify server config in `.env`
3. **Deploy**: Follow deployment guides in READMEs
4. **Develop**: Add your own features!

## Troubleshooting

### Server won't start

- Check Go is installed: `go version`
- Check port 3002 is free: `lsof -i :3002`

### App won't start

- Check Node.js is installed: `node --version`
- Check Rust is installed: `cargo --version`
- Try: `cd excalidraw-app && npm install`

### Build errors in Rust

- Install/update Rust: `rustup update`
- On Linux, install webkit: `sudo apt install libwebkit2gtk-4.1-dev`

### Can't connect to server

- Verify server is running
- Check URL is correct: `http://localhost:3002`
- Check firewall isn't blocking port 3002

## What Changed From Original Code

### Removed

- ❌ All Firebase code and dependencies
- ❌ Firebase-compatible API endpoints
- ❌ AWS S3 storage backend
- ❌ Frontend embedding in server
- ❌ Firestore URL patching

### Added

- ✅ Clean WebSocket-only collaboration
- ✅ Tauri desktop app
- ✅ Local SQLite storage
- ✅ Connection dialog
- ✅ Auto-save functionality
- ✅ Comprehensive documentation

### Reorganized

- ✅ Moved Socket.IO to `handlers/websocket/collab.go`
- ✅ Cleaned up `main.go`
- ✅ Updated module name to `excalidraw-server`
- ✅ Simplified CORS for localhost only

Enjoy your clean, self-hosted Excalidraw setup! 🎨
