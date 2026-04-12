#!/bin/bash

# Test script to verify Phase 1 implementation

echo "🧪 Testing Phase 1: Backend Foundation"
echo "========================================"

BASE_URL="http://127.0.0.1:5000"

echo ""
echo "1️⃣  Testing /api/latest endpoint..."
curl -s "${BASE_URL}/api/latest" | python3 -m json.tool || echo "❌ Failed"

echo ""
echo "2️⃣  Testing /api/devices endpoint..."
curl -s "${BASE_URL}/api/devices" | python3 -m json.tool || echo "❌ Failed"

echo ""
echo "3️⃣  Testing /api/stats endpoint..."
curl -s "${BASE_URL}/api/stats" | python3 -m json.tool || echo "❌ Failed"

echo ""
echo "4️⃣  Testing legacy /data endpoint (backward compatibility)..."
curl -s "${BASE_URL}/data" | python3 -m json.tool || echo "❌ Failed"

echo ""
echo "5️⃣  Checking database..."
if [ -f "backend/sensors.db" ]; then
    echo "✅ Database exists: backend/sensors.db"
    echo "Tables:"
    sqlite3 backend/sensors.db ".tables"
else
    echo "❌ Database not found"
fi

echo ""
echo "========================================"
echo "✅ Phase 1 Testing Complete"
