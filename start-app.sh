#!/bin/sh
#
# Author: Isaac Lins
# Description: Start the Excalidraw Tauri desktop application
# Usage: ./start-app.sh
#

set -e

echo "🎨 Starting Excalidraw Desktop App..."

# Check for Node.js/npm installation
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed. Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "✓ npm found: $(npm --version)"
echo "✓ Node.js: $(node --version)"

# Change to app directory
cd "$(dirname "$0")/excalidraw-app"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
else
    echo "✓ Dependencies already installed"
fi

# Check for Rust (required for Tauri)
if ! command -v cargo &> /dev/null; then
    echo "⚠️  Warning: Rust is not installed. Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi

echo "✓ Cargo found: $(cargo --version)"

echo ""
echo "🚀 Starting Tauri development server..."
echo "   The app will open in a new window"
echo "   Press Ctrl+C to stop"
echo ""

npm run tauri dev
