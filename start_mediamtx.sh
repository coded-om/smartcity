#!/bin/bash
# Start MediaMTX media server for Smart City camera streams
# HLS available at: http://localhost:8888/factory01/index.m3u8
# Browser player:  http://localhost:8888/factory01

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="$SCRIPT_DIR/mediamtx.yml"

if ! command -v mediamtx &>/dev/null; then
    echo "ERROR: mediamtx not found in PATH. Install from:"
    echo "  https://github.com/bluenviron/mediamtx/releases"
    exit 1
fi

echo "Starting MediaMTX media server..."
echo "  HLS stream:  http://localhost:8888/factory01/index.m3u8"
echo "  Browser:     http://localhost:8888/factory01"
echo "  API:         http://localhost:9997/v3/paths/list"
echo ""

exec mediamtx "$CONFIG"
