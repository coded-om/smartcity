
import { io } from 'socket.io-client';

let _socket = null;

function _createSocket() {
  // Connect to the default namespace '/' on the same origin as the page.
  // In production (Flask serves the build on :5000) window.location.origin is
  // the backend. In dev (CRA on :3000) the setupProxy forwards /socket.io.
  return io('/', {
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });
}

export async function getSocket() {
  if (!_socket) {
    _socket = _createSocket();

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
