#!/bin/bash

# Server Test Runner Script
# This script runs all server-side tests for the Excalidraw server

set -e  # Exit on error
set -u  # Exit on undefined variable

echo "========================================="
echo "Running Excalidraw Server Tests"
echo "========================================="
echo ""

# Change to the excalidraw-server directory
cd "$(dirname "$0")/../../excalidraw-server" || exit 1

echo "📦 Downloading Go dependencies..."
go mod download || {
    echo "❌ Failed to download dependencies"
    exit 1
}

echo ""
echo "🧪 Running tests..."
echo ""

# Run Go tests with verbose output
go test -v ./... || {
    echo ""
    echo "❌ Tests failed!"
    exit 1
}

echo ""
echo "========================================="
echo "✅ All server tests passed!"
echo "========================================="

exit 0

