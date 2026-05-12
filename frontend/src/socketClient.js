/**
 * socketClient.js — Singleton Socket.IO connection.
 *
 * Import `socket` anywhere in the frontend to listen for real-time events
 * emitted by the backend (Flask-SocketIO).
 *
 * Events emitted by the server:
 *   'face_detected'   — {camera_id, person_name, authorized, confidence, bbox_json, ...}
 *   'threat_detected' — {camera_id, threat_type, confidence, severity, source, ...}
 *   'weapon_detected' — {camera_id, class_name, confidence, bbox_json, ...}
 */
import { io } from 'socket.io-client';
import { getApiBase } from './apiBase';

let _socket = null;

async function _createSocket() {
  const base = await getApiBase();
  // Connect to the same origin the backend is served from.
  // transports: ['websocket', 'polling'] — try WS first, fall back to long-poll.
  return io(base, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });
}

/**
 * Returns the shared Socket.IO client instance.
 * The socket is created lazily on first call.
 */
export async function getSocket() {
  if (!_socket) {
    _socket = await _createSocket();

    _socket.on('connect', () =>
      console.log('[Socket] connected', _socket.id)
    );
    _socket.on('disconnect', (reason) =>
      console.warn('[Socket] disconnected:', reason)
    );
    _socket.on('connect_error', (err) =>
      console.warn('[Socket] connection error:', err.message)
    );
  }
  return _socket;
}

export default getSocket;
