#!/usr/bin/env bash
# Start the Smart City backend with gunicorn + gevent
# Usage: bash start.sh
cd "$(dirname "$0")"

# Kill any previous instance on port 5000
fuser -k 5000/tcp 2>/dev/null
sleep 0.5

source ../venv/bin/activate

exec gunicorn \
  --worker-class geventwebsocket.gunicorn.workers.GeventWebSocketWorker \
  --workers 1 \
  --bind 0.0.0.0:5000 \
  --timeout 120 \
  --keep-alive 5 \
  --log-level info \
  "app:app"
