/**
 * Socket.io İstemci Servisi
 */
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

let socket = null;

export const connectSocket = (token) => {
  if (socket?.connected) return socket;

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });

  socket.on('connect', () => {
    console.log('🔌 Socket bağlandı:', socket.id);
    socket.emit('join-dashboard');
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket ayrıldı:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('🔌 Socket bağlantı hatası:', error.message);
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const getSocket = () => socket;

export const onNewAlert = (callback) => {
  if (socket) {
    socket.on('new-alert', callback);
  }
};

export const onAlertUpdate = (callback) => {
  if (socket) {
    socket.on('alert-updated', callback);
  }
};

export const onLocationUpdate = (callback) => {
  if (socket) {
    socket.on('location-update', callback);
  }
};

export const removeAlertListeners = () => {
  if (socket) {
    socket.off('new-alert');
    socket.off('alert-updated');
    socket.off('location-update');
  }
};
