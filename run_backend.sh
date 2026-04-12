#!/bin/bash

# Smart City Security System - Backend Startup Script

cd "$(dirname "$0")"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 Starting Smart City Security System - Backend${NC}"
echo "============================================================"

# Activate virtual environment
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found. Creating..."
    python3 -m venv venv
fi

source venv/bin/activate

# Check dependencies
echo -e "${BLUE}📦 Checking dependencies...${NC}"
# Use pip show (instead of pip list | grep) to avoid BrokenPipe warnings
pip show scikit-learn >/dev/null 2>&1 || {
    echo "Installing missing dependencies..."
    pip install -q -r backend/requirements.txt
}

# Backend port configuration with automatic fallback if busy
PORT="${BACKEND_PORT:-5000}"

if command -v lsof >/dev/null 2>&1 && lsof -iTCP:"${PORT}" -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  Port ${PORT} is already in use. Trying next available port..."
    for candidate in 5001 5002 5003 5004 5005 5006 5007 5008 5009 5010; do
        if ! lsof -iTCP:"${candidate}" -sTCP:LISTEN -t >/dev/null 2>&1; then
            PORT="${candidate}"
            echo "✅ Using port ${PORT}"
            break
        fi
    done
fi

# Run backend
echo -e "${GREEN}✅ Starting Flask backend...${NC}"
echo "📁 Database: backend/sensors.db"
echo "📡 MQTT: localhost:1883"
echo "🌐 API: http://127.0.0.1:${PORT}"
echo "============================================================"

cd backend
BACKEND_PORT="${PORT}" python3 app.py
