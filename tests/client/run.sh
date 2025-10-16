#!/bin/bash

# Client Test Runner Script
# This script runs all client-side tests for the Excalidraw app

set -e  # Exit on error
set -u  # Exit on undefined variable

echo "========================================="
echo "Running Excalidraw Client Tests"
echo "========================================="
echo ""

# Change to the excalidraw-app directory
cd "$(dirname "$0")/../../excalidraw-app" || exit 1

echo "📦 Installing dependencies..."
npm ci --silent || {
    echo "❌ Failed to install dependencies"
    exit 1
}

echo ""
echo "🧪 Running tests..."
echo ""

# Run tests
npm test -- --reporter=verbose || {
    echo ""
    echo "❌ Tests failed!"
    exit 1
}

echo ""
echo "========================================="
echo "✅ All client tests passed!"
echo "========================================="

exit 0

