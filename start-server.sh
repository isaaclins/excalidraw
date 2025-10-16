#!/bin/sh
#
# Author: Isaac Lins
# Description: Start the Excalidraw collaboration server
# Usage: ./start-server.sh
#

set -e

echo "🚀 Starting Excalidraw Server..."

# Check for Go installation
if ! command -v go &> /dev/null; then
    echo "❌ Error: Go is not installed. Please install Go from https://go.dev/dl/"
    exit 1
fi

echo "✓ Go found: $(go version)"

# Change to server directory
cd "$(dirname "$0")/excalidraw-server"

# Download dependencies if needed
if [ ! -d "vendor" ]; then
    echo "📦 Downloading Go dependencies..."
    go mod download
fi

# Set default environment variables if not already set
export STORAGE_TYPE=${STORAGE_TYPE:-sqlite}
export DATA_SOURCE_NAME=${DATA_SOURCE_NAME:-./excalidraw.db}
export LOG_LEVEL=${LOG_LEVEL:-info}

echo "📝 Configuration:"
echo "   Storage Type: $STORAGE_TYPE"
echo "   Data Source: $DATA_SOURCE_NAME"
echo "   Log Level: $LOG_LEVEL"
echo ""

# Build and run
echo "🔨 Building server..."
go build -o excalidraw-server .

echo "▶️  Starting server on :3002..."
echo "   Press Ctrl+C to stop"
echo ""

./excalidraw-server --listen :3002 --loglevel $LOG_LEVEL
