#!/bin/sh
#
# Author: Isaac Lins    
# Description: App script for the chat application
# Usage: ./app.sh
# Example: ./app.sh

set -euo pipefail

cd excaliapp && pnpm i && pnpm tauri dev
