"""
socketio_instance.py — Shared Flask-SocketIO singleton.

Import this module anywhere that needs to emit socket events.
Keeping the instance here (not in app.py) prevents circular imports.
"""
from flask_socketio import SocketIO

# async_mode='eventlet' gives the best performance on RPi5.
# async_mode='threading' — compatible with Python 3.13 (eventlet doesn't support 3.13).
socketio = SocketIO(
    cors_allowed_origins='*',
    async_mode='threading',
    logger=False,
    engineio_logger=False,
    ping_timeout=20,
    ping_interval=10,
)
