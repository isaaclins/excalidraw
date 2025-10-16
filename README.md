# Excalidraw Client/Server

A self-hosted, privacy-focused Excalidraw setup with a Tauri desktop application and a minimal Go collaboration server.

## Features

- 🖥️ **Desktop App**: Native Tauri application for Windows, macOS, and Linux
- 🔒 **Privacy First**: All data stored locally by default
- 🤝 **Optional Collaboration**: Connect to your own server for real-time collaboration
- 💾 **Multiple Storage Options**: SQLite, filesystem, or in-memory storage
- 🚀 **No Cloud Dependencies**: No Firebase, no external services
- ⚡ **Fast & Lightweight**: Minimal server with WebSocket support

## Project Structure

```
excalidraw-app/          # Tauri desktop application
├── src/                 # React/TypeScript frontend
├── src-tauri/           # Rust backend
└── package.json

excalidraw-server/       # Go collaboration server
├── handlers/            # WebSocket & API handlers
├── stores/              # Storage backends
└── main.go

start-app.sh            # Start the desktop app
start-server.sh         # Start the collaboration server
```

## Quick Start

### Desktop App Only (Offline Mode)

1. Start the app:

   ```bash
   ./start-app.sh
   ```

2. Choose "Work Offline" when prompted
3. Start drawing!

Your drawings are saved locally to a SQLite database.

### With Collaboration Server

1. Start the server (in one terminal):

   ```bash
   ./start-server.sh
   ```

2. Start the app (in another terminal):

   ```bash
   ./start-app.sh
   ```

3. Choose "Connect to Server" and enter: `http://localhost:3002`
4. Enter a room ID or leave blank for a new room
5. Share the room ID with collaborators!

## Requirements

### Desktop App

- Node.js 18+ and npm
- Rust and Cargo (will be installed automatically if missing)

### Collaboration Server

- Go 1.21+

## Configuration

### Server Configuration

Create a `.env` file in `excalidraw-server/`:

```env
# Storage type: memory, filesystem, or sqlite
STORAGE_TYPE=sqlite

# SQLite database path (when using sqlite)
DATA_SOURCE_NAME=./excalidraw.db

# Filesystem storage path (when using filesystem)
# LOCAL_STORAGE_PATH=./data

# Server port
PORT=3002

# Log level: debug, info, warn, error
LOG_LEVEL=info
```

### App Configuration

On first launch, you'll be prompted to:

- Connect to a server (enter URL)
- Work offline (local storage only)

Your choice is saved and can be changed by clearing app data.

## Development

### Server Development

```bash
cd excalidraw-server
go run main.go --listen :3002 --loglevel debug
```

### App Development

```bash
cd excalidraw-app
npm install
npm run tauri dev
```

## Building for Production

### Build Desktop App

```bash
cd excalidraw-app
npm run tauri build
```

The built application will be in `src-tauri/target/release/bundle/`.

### Build Server Binary

```bash
cd excalidraw-server
go build -o excalidraw-server .
```

## Architecture

### Desktop App (Tauri)

- **Frontend**: React + TypeScript + Excalidraw library
- **Backend**: Rust with SQLite for local storage
- **Features**:
  - Local drawing storage
  - Server connection dialog
  - WebSocket client for collaboration
  - Auto-save functionality

### Collaboration Server (Go)

- **WebSocket**: Socket.IO for real-time collaboration
- **REST API**: Simple save/load endpoints
- **Storage**: Pluggable backends (memory/filesystem/SQLite)
- **Features**:
  - Room-based collaboration
  - User presence tracking
  - Document persistence

## License

This project builds upon [Excalidraw](https://github.com/excalidraw/excalidraw) (MIT License).

## Support

For issues or questions, please open an issue on GitHub.
