import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../constants/config';

class SocketService {
  private socket: Socket | null = null;

  connect(token?: string): Socket {
    if (this.socket?.connected) return this.socket;

    // Disconnect stale socket before creating a new one
    this.socket?.disconnect();

    this.socket = io(API_BASE_URL, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 10000,
    });

    this.socket.on('connect', () => {
      console.log('[socket] connected:', this.socket?.id);
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[socket] connection error:', err.message);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[socket] disconnected:', reason);
    });

    return this.socket;
  }

  get(): Socket | null {
    return this.socket;
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}

// Singleton — shared across the app
export const socketService = new SocketService();
