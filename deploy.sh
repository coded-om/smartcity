#!/bin/bash

# Smart City Security System - Complete Deployment Script
# ========================================================

set -e

echo "🚀 Smart City AI Security System - Complete Deployment"
echo "=" | tr "\n" "=" | head -c 60 && echo

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Check dependencies
echo -e "${BLUE}[1/7] Checking system dependencies...${NC}"
command -v python3 >/dev/null || { echo "❌ Python3 not found"; exit 1; }
command -v node >/dev/null || { echo "❌ Node.js not found"; exit 1; }
command -v mosquitto >/dev/null || echo "⚠️  Mosquitto not installed (will install)"
command -v ffmpeg >/dev/null || echo "⚠️  ffmpeg not installed (optional for cameras)"
echo -e "${GREEN}✅ Core dependencies found${NC}"

# Step 2: Install MQTT broker if needed
if ! command -v mosquitto &> /dev/null; then
    echo -e "${BLUE}[2/7] Installing Mosquitto MQTT broker...${NC}"
    sudo apt update && sudo apt install mosquitto mosquitto-clients -y
    sudo systemctl enable mosquitto
    sudo systemctl start mosquitto
else
    echo -e "${GREEN}[2/7] ✅ Mosquitto already installed${NC}"
fi

# Step 3: Setup Python environment
echo -e "${BLUE}[3/7] Setting up Python virtual environment...${NC}"
cd /home/admin/Desktop/smartcity
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -q flask flask-cors paho-mqtt scikit-learn joblib numpy requests
echo -e "${GREEN}✅ Python dependencies installed${NC}"

# Step 4: Setup frontend
echo -e "${BLUE}[4/7] Setting up React frontend...${NC}"
cd frontend
if [ ! -d "node_modules" ]; then
    npm install
fi
cd ..
echo -e "${GREEN}✅ Frontend dependencies installed${NC}"

# Step 5: Configure environment
echo -e "${BLUE}[5/7] Configuring environment...${NC}"
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo -e "${YELLOW}⚠️  Please edit .env file with your credentials${NC}"
    echo "   - TELEGRAM_TOKEN (from @BotFather)"
    echo "   - TELEGRAM_CHAT_ID (from @userinfobot)"
    echo "   - CAMERA_* URLs (RTSP streams)"
else
    echo -e "${GREEN}✅ .env file exists${NC}"
fi

# Step 6: Start backend
echo -e "${BLUE}[6/7] Starting backend server...${NC}"
cd backend
source ../venv/bin/activate
python3 app.py > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
sleep 3

if ps -p $BACKEND_PID > /dev/null; then
    echo -e "${GREEN}✅ Backend started (PID: $BACKEND_PID)${NC}"
    echo "   Server running at: http://127.0.0.1:5000"
    echo "   Logs: tail -f /tmp/backend.log"
else
    echo -e "❌ Backend failed to start. Check /tmp/backend.log"
    exit 1
fi

cd ..

# Step 7: Start frontend (optional)
echo -e "${BLUE}[7/7] Starting frontend (optional)...${NC}"
read -p "Start React frontend now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    cd frontend
    npm start &
    FRONTEND_PID=$!
    echo -e "${GREEN}✅ Frontend started (PID: $FRONTEND_PID)${NC}"
    echo "   Dashboard: http://localhost:3000"
    cd ..
else
    echo "   To start frontend later: cd frontend && npm start"
fi

# Summary
echo
echo "=" | tr "\n" "=" | head -c 60 && echo
echo -e "${GREEN}🎉 System deployed successfully!${NC}"
echo "=" | tr "\n" "=" | head -c 60 && echo
echo
echo "📡 Backend API: http://127.0.0.1:5000"
echo "🖥️  Frontend:    http://localhost:3000 (if started)"
echo "📊 API Stats:   curl http://127.0.0.1:5000/api/stats"
echo
echo "Next steps:"
echo "1. Edit .env file with Telegram and camera credentials"
echo "2. Flash ESP32 firmware (esp32/main.py)"
echo "3. Train AI model after 100+ readings"
echo "   curl -X POST http://127.0.0.1:5000/api/train/ESP32_Factory01"
echo
echo "📚 Documentation:"
echo "   - README.md - Complete system guide"
echo "   - ALL_PHASES_COMPLETE.md - Final summary"
echo "   - PHASE2_COMPLETE.md - AI engine details"
echo
echo "Logs:"
echo "   - Backend: tail -f /tmp/backend.log"
echo "   - MQTT: mosquitto_sub -h localhost -t esp32/sensors -v"
echo
echo "Stop services:"
echo "   - Backend: kill $BACKEND_PID"
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "   - Frontend: kill $FRONTEND_PID"
fi
echo
echo "=" | tr "\n" "=" | head -c 60 && echo

# Test API
echo -e "${BLUE}Testing API...${NC}"
curl -s http://127.0.0.1:5000/api/stats | python3 -m json.tool > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ API responding correctly${NC}"
else
    echo -e "${YELLOW}⚠️  API not responding yet (may need more time)${NC}"
fi

echo
echo "✅ All phases complete and ready for use!"
