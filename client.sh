#!/bin/sh
#
# Author: Isaac Lins
# Description: Client script for the chat application
# Usage: ./client.sh
# Example: ./client.sh

set -euo pipefail

cd excaliapp && pnpm i && pnpm tauri dev
