#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}=== Art Media Publishing Site — Quick Start ===${NC}"
echo ""

if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js is not installed.${NC}"
    echo ""
    read -p "Install Node.js 20 LTS via fnm? [y/N] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Installing fnm..."
        curl -fsSL https://fnm.vercel.app/install | bash -s -- --install-dir "$HOME/.local/share/fnm" --skip-shell

        FNM_PATH="$HOME/.local/share/fnm"
        if [ ! -d "$FNM_PATH" ]; then
            FNM_PATH="$HOME/.fnm"
        fi

        export PATH="$FNM_PATH:$PATH"
        eval "$(fnm env)"

        echo "Installing Node.js 20 LTS..."
        fnm install 20
        fnm use 20
        echo -e "${GREEN}Node.js $(node -v) installed.${NC}"
    else
        echo ""
        echo "Please install Node.js 18+ manually:"
        echo "  macOS:   brew install node"
        echo "  Linux:   curl -fsSL https://fnm.vercel.app/install | bash && fnm install 20"
        echo "  Or visit: https://nodejs.org/"
        exit 1
    fi
fi

NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
NODE_MINOR=$(node -e "console.log(process.versions.node.split('.')[1])")

if [ "$NODE_MAJOR" -lt 18 ] || { [ "$NODE_MAJOR" -eq 18 ] && [ "$NODE_MINOR" -lt 17 ]; }; then
    echo -e "${RED}Node.js $(node -v) is too old. Requires >= 18.17.${NC}"
    exit 1
fi

echo -e "${GREEN}Node.js $(node -v) detected.${NC}"

node setup.js

echo ""
echo -e "${CYAN}Starting server...${NC}"
echo ""
node server.js
