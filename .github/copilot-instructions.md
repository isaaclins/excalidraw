# Excalidraw Self-Hosted Project - AI Agent Instructions

## Project Overview
Self-hosted privacy-focused Excalidraw with Tauri desktop app (React/TypeScript + Rust) and minimal Go collaboration server. No Firebase, no AWS - pure WebSocket collaboration with pluggable storage backends.

## Architecture: Two Independent Applications

### 1. Desktop App (`excalidraw-app/`)
- **Frontend**: React/TypeScript with `@excalidraw/excalidraw` library
- **Backend**: Rust/Tauri with SQLite for local persistence
- **Runs**: Via `./start-app.sh` or `npm run tauri dev`
- **Communication**: Tauri commands bridge frontend ↔ Rust backend

### 2. Collaboration Server (`excalidraw-server/`)
- **Language**: Go with Socket.IO WebSocket library
- **Storage**: Pluggable via `STORAGE_TYPE` env var (memory/filesystem/sqlite)
- **Runs**: Via `./start-server.sh` or `make run`
- **Port**: 3002 by default

## Critical Development Workflows

### Starting the App
```bash
./start-app.sh          # Checks deps, builds, runs Tauri
cd excalidraw-app && npm run tauri dev  # Direct command
```

### Starting the Server
```bash
./start-server.sh       # Checks deps, builds, runs Go server
cd excalidraw-server && make run       # Alternative using Makefile
```

### Testing
- **App**: `cd excalidraw-app && npm test` (Vitest)
- **Server**: `cd excalidraw-server && make test` or `go test ./...`

### Linting
- **App**: `npm run lint:fix` (ESLint with TypeScript)
- **Server**: `make lint-fix` (golangci-lint with auto-fix)

## Key Architectural Patterns

### Real-Time Collaboration Flow
1. **Connection**: Client connects via Socket.IO to `serverUrl/socket.io/`
2. **Room Join**: Client emits `join-room` with roomId
3. **Broadcasting**: Changes sent via `server-broadcast` (persisted) or `server-volatile-broadcast` (cursor/ephemeral)
4. **Reconciliation**: Received changes merged using `reconcileElements()` algorithm

**Critical File**: `excalidraw-app/src/lib/reconciliation.ts` - This implements z-index-aware element merging with:
- Version-based conflict resolution (higher version wins)
- `versionNonce` tiebreaker (lower nonce wins for determinism)
- Protection for actively edited elements (`editingElement`, `resizingElement`, `draggingElement`)
- Z-index preservation via `::preceding_element_key` metadata

### Element Reconciliation Algorithm
When merging remote elements with local state:
```typescript
// Elements include special key for ordering
type BroadcastedExcalidrawElement = ExcalidrawElement & {
  "::preceding_element_key"?: string;  // "^" = first, or ID of preceding element
};

// Reconciliation protects local edits
if (localElement.version > remote.version || 
    localElement.id === appState.editingElement?.id) {
  // Keep local
}
```

### Snapshot System
- **Auto-save**: `AutoSnapshotManager` tracks changes and saves at configurable intervals
- **Storage**: Server-side when connected (via `/api/rooms/{roomId}/snapshots`), local Tauri DB when offline
- **Thumbnails**: PNG base64 from `exportToBlob()` function
- **Settings**: Per-room config for `max_snapshots` and `auto_save_interval`

**Files**: 
- `excalidraw-app/src/lib/autoSnapshot.ts` - Client-side manager
- `excalidraw-server/handlers/api/snapshots/` - Server API (SQLite only)

### Storage Backend Pattern (Go Server)
Environment variable `STORAGE_TYPE` determines backend:
```go
// stores/storage.go - Factory pattern
func GetStore() core.DocumentStore {
    switch os.Getenv("STORAGE_TYPE") {
    case "filesystem": return filesystem.NewDocumentStore(path)
    case "sqlite":     return sqlite.NewDocumentStore(dsn)
    default:           return memory.NewDocumentStore()
    }
}
```

**Snapshot API conditional**: Only available when using SQLite storage (it's the only backend implementing `SnapshotStore` interface).

### Tauri Commands Pattern
All Rust ↔ Frontend communication uses Tauri commands:

**Rust side** (`src-tauri/src/commands.rs`):
```rust
#[tauri::command]
fn save_drawing(name: String, data: String) -> Result<String, String> {
    // Implementation
}
```

**Frontend side**:
```typescript
import { invoke } from '@tauri-apps/api/core';
const id = await invoke('save_drawing', { name, data });
```

**Registration** (`src-tauri/src/lib.rs`):
```rust
.invoke_handler(tauri::generate_handler![save_drawing, /* ... */])
```

## Project-Specific Conventions

### State Management
- **No Redux/Zustand**: State in React hooks + localStorage for persistence
- **Server Config**: Stored in `localStorage.getItem('excalidraw-server-config')`
- **Connection State**: Single `ExcalidrawAPI` instance per component (no global singleton)

### WebSocket Event Naming
- **Client → Server**: `server-broadcast`, `server-volatile-broadcast`, `join-room`
- **Server → Client**: `client-broadcast`, `room-user-change`, `new-user`, `first-in-room`

### Error Handling
- **Go**: Errors logged via `logrus.WithField()` and returned to client as HTTP 500/400
- **TypeScript**: Try/catch with console.error + user alerts for critical failures
- **Rust**: Commands return `Result<T, String>` - string errors shown to frontend

### Throttling & Debouncing
- **Auto-save**: 1 second debounce (`saveTimeoutRef` in ExcalidrawWrapper)
- **Broadcasting**: 50ms throttle (max 20 broadcasts/second) to prevent network flooding
- **Flag**: `isApplyingRemoteUpdate.current` prevents re-broadcasting received changes

## Common Pitfalls & Solutions

### "Snapshot API not available"
**Cause**: Server running with `STORAGE_TYPE=memory` or `filesystem`  
**Fix**: Set `STORAGE_TYPE=sqlite` and `DATA_SOURCE_NAME=./excalidraw.db`

### Infinite Broadcast Loops
**Cause**: Broadcasting changes received from collaboration  
**Fix**: Check `isApplyingRemoteUpdate.current` flag before broadcasting in `onChange` handler

### Tauri Command Not Found
**Cause**: Command not registered in `src-tauri/src/lib.rs`  
**Fix**: Add to `tauri::generate_handler![]` macro array

### CORS Errors
**Go server**: Configured for `http://localhost:*` and `tauri://localhost` in `main.go` CORS middleware

### Element Z-Index Breaks
**Cause**: Not preserving `::preceding_element_key` when broadcasting  
**Fix**: See `broadcastScene()` in `ExcalidrawWrapper.tsx` for correct pattern

## File Structure Essentials

### App Frontend Core
- `src/App.tsx` - Root component, connection dialog orchestration
- `src/components/ExcalidrawWrapper.tsx` - Main canvas, collaboration logic, snapshot integration
- `src/lib/reconciliation.ts` - Element merging algorithm ⚠️ Critical for collaboration
- `src/lib/websocket.ts` - Socket.IO client wrapper
- `src/lib/storage.ts` - LocalStorage + ServerStorage abstractions

### App Backend (Rust)
- `src-tauri/src/lib.rs` - App initialization, command registration
- `src-tauri/src/commands.rs` - All Tauri command implementations
- `src-tauri/src/db.rs` - SQLite schema and database initialization

### Server Core (Go)
- `main.go` - HTTP router, Socket.IO setup, storage factory
- `handlers/websocket/collab.go` - All Socket.IO event handlers
- `handlers/api/documents/` - REST endpoints for document persistence
- `handlers/api/snapshots/` - Snapshot CRUD (SQLite only)
- `stores/storage.go` - Storage backend factory pattern

## Testing Strategy
- **Reconciliation**: Extensively tested in `src/lib/__tests__/reconciliation.test.ts` (200+ test cases)
- **WebSocket**: Mocked via `socket.io-mock` in component tests
- **Tauri Commands**: Integration tests pending (currently manual QA)
- **Go Handlers**: No formal tests yet - add to `handlers/**/*_test.go`

## Documentation References
- Root `README.md` - High-level overview and features
- `QUICKSTART.md` - Step-by-step setup and testing guide
- `excalidraw-app/README.md` - Tauri architecture and API reference
- `excalidraw-server/README.md` - Go server API docs and deployment
- `excalidraw-server/Makefile` - Build/lint/test commands

## Environment Variables Cheatsheet

### Server (`excalidraw-server/.env`)
```bash
STORAGE_TYPE=sqlite              # memory | filesystem | sqlite
DATA_SOURCE_NAME=./excalidraw.db # For sqlite
LOCAL_STORAGE_PATH=./data        # For filesystem
LOG_LEVEL=info                   # debug | info | warn | error
```

### App
No `.env` file - configuration via connection dialog on first launch.
