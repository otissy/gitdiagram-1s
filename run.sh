#!/usr/bin/env bash
# GitDiagram 1s - Linux Launch Script
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "========================================================"
echo "  GitDiagram 1s - Local GitHub1s & GitDiagram Desktop"
echo "========================================================"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed or not in PATH."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Launching GitDiagram 1s..."
npm start
