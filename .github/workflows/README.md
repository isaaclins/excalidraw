# CI/CD Pipeline

## Overview

This CI pipeline builds and tests the Excalidraw application for multiple platforms in parallel.

## Pipeline Architecture

```
                    ┌─────────────────────────┐
                    │   Push to main / PR    │
                    └─────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
  ┌──────────┐         ┌──────────┐         ┌──────────┐
  │  Server  │         │  Client  │         │  Client  │
  │  (Go)    │         │ (Linux)  │         │ (macOS)  │
  └──────────┘         └──────────┘         └──────────┘
        │                     │                     │
        │                     │              ┌──────────┐
        │                     │              │  Client  │
        │                     │              │(Windows) │
        │                     │              └──────────┘
        │                     │                     │
        ▼                     ▼                     ▼
```

## Server Pipeline

**Platform:** Ubuntu Latest  
**Language:** Go 1.21

### Steps:

1. 🔍 **Lint** - golangci-lint
2. 🧪 **Test** - Run Go tests
3. 🔨 **Build** - Compile Go binary
4. 📦 **Upload** - Server executable

**Artifact:** `excalidraw-server` (Linux binary)

## Client Pipeline

**Platforms:** Linux, macOS, Windows (matrix build)  
**Language:** TypeScript + Rust (Tauri)

### Steps (per platform):

1. 🔍 **Lint** - ESLint (warnings allowed)
2. 🧪 **Test** - Vitest (147 tests)
3. 🔨 **Build** - Tauri desktop app
4. 📦 **Upload** - Platform-specific executables

### Artifacts:

#### Linux (`excalidraw-linux`)

- `*.deb` - Debian package
- `*.AppImage` - Universal Linux app

#### macOS (`excalidraw-macos`)

- `*.dmg` - macOS disk image
- `*.app` - macOS application bundle

#### Windows (`excalidraw-windows`)

- `*.msi` - Windows installer
- `*.exe` - NSIS installer

## Parallel Execution

All builds run simultaneously:

- **Server build** (1 job)
- **Linux client build** (1 job)
- **macOS client build** (1 job)
- **Windows client build** (1 job)

**Total:** 4 parallel jobs

## Downloading Artifacts

After a successful CI run, you can download the built applications:

1. Go to **Actions** tab in GitHub
2. Click on the latest workflow run
3. Scroll to **Artifacts** section
4. Download platform-specific builds:
   - `excalidraw-server` - Go server
   - `excalidraw-linux` - Linux apps (.deb, .AppImage)
   - `excalidraw-macos` - macOS apps (.dmg, .app)
   - `excalidraw-windows` - Windows installers (.msi, .exe)

## Triggers

The pipeline runs on:

- **Push** to `main` branch
- **Pull requests** to `main` branch

## Estimated Duration

- **Server pipeline:** ~2-3 minutes
- **Client pipeline (per platform):** ~10-15 minutes
- **Total (parallel):** ~10-15 minutes

## Success Criteria

All jobs must pass:

- ✅ No lint errors (warnings allowed for client)
- ✅ All tests pass
- ✅ Builds complete successfully
- ✅ Artifacts uploaded

## Local Testing

### Server

```bash
cd excalidraw-server
golangci-lint run
go test ./...
go build
```

### Client

```bash
cd excalidraw-app
npm run lint
npm test
npm run tauri build
```
