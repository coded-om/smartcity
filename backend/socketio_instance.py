from flask_socketio import SocketIO

socketio = SocketIO(
    cors_allowed_origins='*',
    async_mode='threading',
    logger=False,
    engineio_logger=False,
    ping_timeout=20,
    ping_interval=10,
)
