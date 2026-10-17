#!/usr/bin/env bash
# Vision IDE - Linux Launch Script
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "========================================================"
echo "  Vision IDE - The Visual-First Desktop Code Editor"
echo "========================================================"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed or not in PATH."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Launching Vision IDE..."
npm start
