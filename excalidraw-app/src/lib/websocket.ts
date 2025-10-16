import { io, Socket } from 'socket.io-client';

export class CollaborationClient {
  private socket: Socket | null = null;
  private serverUrl: string;
  private roomId: string | null = null;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      this.socket = io(this.serverUrl, {
        transports: ['websocket', 'polling'],
      });

      this.socket.on('connect', () => {
        console.log('Connected to collaboration server');
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        reject(error);
      });
    });
  }

  joinRoom(roomId: string): void {
    if (!this.socket?.connected) {
      throw new Error('Not connected to server');
    }

    this.roomId = roomId;
    this.socket.emit('join-room', roomId);
  }

  broadcast(data: any, volatile = false): void {
    if (!this.socket?.connected || !this.roomId) {
      return;
    }

    const event = volatile ? 'server-volatile-broadcast' : 'server-broadcast';
    this.socket.emit(event, this.roomId, data, null);
  }

  onBroadcast(callback: (data: any) => void): void {
    if (!this.socket) return;
    this.socket.on('client-broadcast', (data: any, metadata: any) => {
      console.log('Received client-broadcast:', { data, metadata });
      callback(data);
    });
  }

  onRoomUserChange(callback: (users: string[]) => void): void {
    if (!this.socket) return;
    this.socket.on('room-user-change', callback);
  }

  onNewUser(callback: (userId: string) => void): void {
    if (!this.socket) return;
    this.socket.on('new-user', callback);
  }

  onFirstInRoom(callback: () => void): void {
    if (!this.socket) return;
    this.socket.on('first-in-room', callback);
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.roomId = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  getSocketId(): string | undefined {
    return this.socket?.id;
  }
}

