import { io, Socket } from 'socket.io-client';

// Type for broadcast data - can be any JSON-serializable data
type BroadcastData = Record<string, unknown>;

// Type for broadcast metadata
interface BroadcastMetadata {
  timestamp?: number;
  userId?: string;
}

// Chat message interface
export interface ChatMessage {
  id: string;
  roomId: string;
  sender: string;
  content: string;
  timestamp: number;
}

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
        withCredentials: true,
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

  broadcast(data: BroadcastData, volatile = false): void {
    if (!this.socket?.connected || !this.roomId) {
      return;
    }

    const event = volatile ? 'server-volatile-broadcast' : 'server-broadcast';
    this.socket.emit(event, this.roomId, data, null);
  }

  onBroadcast(callback: (data: BroadcastData, metadata?: BroadcastMetadata) => void): void {
    if (!this.socket) return;
    this.socket.on('client-broadcast', (data: BroadcastData, metadata: BroadcastMetadata) => {
      console.log('Received client-broadcast:', { data, metadata });
      callback(data, metadata);
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

  sendChatMessage(messageId: string, content: string): void {
    if (!this.socket?.connected || !this.roomId) {
      return;
    }

    this.socket.emit('server-chat-message', this.roomId, {
      id: messageId,
      content,
    });
  }

  onChatMessage(callback: (message: ChatMessage) => void): void {
    if (!this.socket) return;
    this.socket.on('client-chat-message', callback);
  }

  onChatHistory(callback: (messages: ChatMessage[]) => void): void {
    if (!this.socket) return;
    this.socket.on('chat-history', callback);
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

