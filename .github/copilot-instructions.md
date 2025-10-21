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
  "::preceding_element_key"?: string; // "^" = first, or ID of preceding element
};

// Reconciliation protects local edits
if (
  localElement.version > remote.version ||
  localElement.id === appState.editingElement?.id
) {
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
import { invoke } from "@tauri-apps/api/core";
const id = await invoke("save_drawing", { name, data });
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

## CI/CD and Automation

### GitHub Actions Workflows

The project has automated testing and release workflows:

**tests.yml** - Runs on push to `dev` and `main` branches:
- **Server tests**: Go linting (golangci-lint) + `make test`
- **Client tests**: ESLint + Vitest tests on Linux, macOS, and Windows
- All tests must pass before merge

**release.yml** - Runs on push to `releases` branch:
- Builds production binaries for all platforms
- Creates artifacts: `.deb`, `.AppImage`, `.dmg`, `.app`, `.msi`, `.exe`
- Server binary built with Go

### Pre-commit Checklist

Before committing code changes:
1. Run linters: `npm run lint:fix` (app) or `make lint-fix` (server)
2. Run tests: `npm test` (app) or `make test` (server)
3. Verify builds: `npm run build` (app) or `go build` (server)
4. Test changes manually if UI-related

### Adding New Tests

- **App Tests**: Add `.test.ts` or `.test.tsx` files next to components/modules
- **Server Tests**: Add `*_test.go` files in same package as code under test
- Use existing test patterns (see `reconciliation.test.ts` for comprehensive examples)
- Mock external dependencies (Socket.IO, database, file system)

## Dependency Management

### Adding Dependencies

**App (npm)**:
```bash
cd excalidraw-app
npm install <package>          # Production dependency
npm install -D <package>       # Dev dependency
```
- Check package is maintained and has TypeScript types
- Prefer packages with no/minimal transitive dependencies
- Update `package.json` and commit `package-lock.json`

**Server (Go)**:
```bash
cd excalidraw-server
go get <package>               # Adds to go.mod
go mod tidy                    # Cleans up unused deps
```
- Use semantic versioning in go.mod
- Prefer stdlib over third-party when possible
- Run `make test` after adding dependencies

### Updating Dependencies

**App**:
```bash
cd excalidraw-app
npm update                     # Update within semver ranges
npm outdated                   # Check for newer versions
```

**Server**:
```bash
cd excalidraw-server
go get -u ./...               # Update all dependencies
go mod tidy
```

**Security updates**: Renovate bot automatically creates PRs for dependency updates.

## Security Best Practices

### Code Security

- **No hardcoded secrets**: Use environment variables for sensitive data
- **Validate input**: All user input (room IDs, drawing data) must be validated
- **Sanitize errors**: Don't expose internal paths or stack traces to clients
- **Use prepared statements**: SQLite queries use parameterized statements (already implemented)

### Collaboration Security

- **Room isolation**: Ensure room IDs properly isolate user sessions
- **Data validation**: Validate all WebSocket messages before processing
- **Rate limiting**: Consider adding rate limits for production deployments
- **CORS policy**: Server configured for localhost only; adjust for production

### Deployment Security

- **Use HTTPS**: Always use TLS in production (reverse proxy recommended)
- **Update dependencies**: Keep Go, Node, Rust, and packages up to date
- **Minimal permissions**: Run server with non-root user
- **Database backups**: Regularly backup SQLite databases

## Debugging Strategies

### App Debugging

**Browser DevTools**:
- Open DevTools (F12) to see React errors, console logs, network requests
- Check Application tab → Local Storage for saved config
- Check Network tab → WS for WebSocket messages

**Tauri DevTools**:
```bash
cd excalidraw-app
RUST_LOG=debug npm run tauri dev
```
- Rust logs appear in terminal
- Frontend logs in browser console

**Common Issues**:
- **Blank screen**: Check browser console for errors
- **WebSocket fails**: Verify server URL in localStorage
- **Drawings not saving**: Check Tauri command errors in terminal

### Server Debugging

**Enable debug logging**:
```bash
cd excalidraw-server
./excalidraw-server --loglevel debug
```
or set `LOG_LEVEL=debug` in `.env`

**Monitor WebSocket events**:
```go
// Add to handlers/websocket/collab.go
log.WithField("event", eventName).Debug("Received event")
```

**Database inspection** (SQLite):
```bash
sqlite3 excalidraw.db
.schema                        # Show table structure
SELECT * FROM documents;       # View all documents
```

**Common Issues**:
- **Port already in use**: `lsof -i :3002` to find process
- **Database locked**: Check for multiple server instances
- **CORS errors**: Verify client origin in main.go CORS config

## Code Review Guidelines

### What to Look For

**Type Safety**:
- TypeScript: No `any` types without explicit reason
- Go: No unchecked type assertions
- Rust: Avoid unwrap() in favor of proper error handling

**Error Handling**:
- Always handle errors gracefully
- Log errors with context (use `logrus.WithField()` in Go)
- Show user-friendly messages to frontend

**Performance**:
- Debounce/throttle frequent operations (auto-save, broadcasts)
- Avoid N+1 queries in database operations
- Use indexes for frequently queried fields

**Testing**:
- Add tests for new features (especially reconciliation logic)
- Update tests when changing existing behavior
- Ensure tests are deterministic (no random failures)

### Code Style

**TypeScript/React**:
- Use functional components with hooks
- Prefer `const` over `let`
- Use destructuring for props
- Follow existing ESLint rules

**Go**:
- Follow standard Go formatting (gofmt)
- Use meaningful variable names
- Keep functions small and focused
- Document exported functions

**Rust**:
- Use `Result<T, E>` for error handling
- Follow Clippy suggestions
- Use `#[tauri::command]` for all commands
- Keep commands simple, move logic to separate modules

## Contributing Workflow

### Making Changes

1. **Create feature branch**: `git checkout -b feature/your-feature`
2. **Make changes**: Follow code style and patterns
3. **Test locally**: Run linters, tests, and manual testing
4. **Commit**: Use clear, descriptive commit messages
5. **Push**: `git push origin feature/your-feature`
6. **Open PR**: GitHub Actions will run tests automatically

### Pull Request Checklist

- [ ] Code follows existing patterns and style
- [ ] Linters pass (`npm run lint` / `make lint`)
- [ ] Tests pass (`npm test` / `make test`)
- [ ] New tests added for new functionality
- [ ] Documentation updated if needed
- [ ] No hardcoded credentials or secrets
- [ ] Works on dev/main branch (check for conflicts)
