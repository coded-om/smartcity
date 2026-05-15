
import { io } from 'socket.io-client';
import { getApiBase } from './apiBase';

let _socket = null;

async function _createSocket() {
  const base = await getApiBase();
  return io(base, {
    transports: ['polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });
}

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
