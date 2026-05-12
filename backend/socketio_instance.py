"""
socketio_instance.py — Shared Flask-SocketIO singleton.

Import this module anywhere that needs to emit socket events.
Keeping the instance here (not in app.py) prevents circular imports.
"""
from flask_socketio import SocketIO

# async_mode='eventlet' gives the best performance on RPi5.
# Falls back gracefully to threading if eventlet is not installed.
socketio = SocketIO(
    cors_allowed_origins='*',
    async_mode='eventlet',
    logger=False,
    engineio_logger=False,
    ping_timeout=20,
    ping_interval=10,
)
