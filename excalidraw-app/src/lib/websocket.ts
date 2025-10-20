import { io, Socket } from 'socket.io-client';

// Type for broadcast data - can be any JSON-serializable data
type BroadcastData = Record<string, unknown>;

// Type for broadcast metadata
interface BroadcastMetadata {
  timestamp?: number;
  userId?: string;
}

interface PendingMessage {
  id: string;
  roomId: string;
  data: BroadcastData;
  metadata: BroadcastMetadata | null;
  volatile: boolean;
  attempts: number;
}

interface AckResponse {
  status?: string;
  error?: string;
  messageId?: string;
}

export class CollaborationClient {
  private socket: Socket | null = null;
  private serverUrl: string;
  private roomId: string | null = null;
  private pendingMessages: PendingMessage[] = [];
  private isFlushingQueue = false;
  private joinAcked = false;
  private listeners = new Map<string, (...args: unknown[]) => void>();
  private pendingBroadcastAcks = new Map<string, (response?: AckResponse, error?: Error) => void>();
  private readonly ackTimeoutMs = 5000;
  private readonly baseRetryDelayMs = 200;
  private readonly maxRetryDelayMs = 5000;

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
        // Reset join ack state on fresh connections
        this.joinAcked = false;
        resolve();
      });

      this.socket.on('disconnect', () => {
        this.joinAcked = false;
      });

      this.socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  async joinRoom(roomId: string): Promise<void> {
    if (!this.socket?.connected) {
      throw new Error('Not connected to server');
    }

    if (!roomId) {
      throw new Error('Room ID is required');
    }

    this.roomId = roomId;
    this.joinAcked = false;

    await new Promise<void>((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not available'));
        return;
      }

    const socket = this.socket;
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        socket.off('join-room-ack', onAckEvent);
      };

      const finish = (error?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        cleanup();
        if (error) {
          if (!this.pendingMessages.length) {
            this.roomId = null;
          }
          reject(error);
          return;
        }
        this.joinAcked = true;
        this.flushQueue();
        resolve();
      };

      const processResponse = (response: AckResponse | undefined, source: 'ack' | 'event') => {
        if (response) {
          console.debug(`[CollaborationClient] join-room ${source} payload:`, response);
        } else {
          console.debug('[CollaborationClient] join-room ack missing payload; assuming success');
        }

        const status = typeof response?.status === 'string' ? response.status.toLowerCase() : undefined;
        const hasExplicitError = response?.error && response.error.length > 0;

        if (status && status !== 'ok') {
          finish(new Error(response?.error ?? 'join-room acknowledgement failed'));
          return;
        }

        if (!status && hasExplicitError) {
          finish(new Error(response?.error));
          return;
        }

        finish();
      };

      const onAckEvent = (payload: AckResponse) => {
        processResponse(payload, 'event');
      };

      socket.once('join-room-ack', onAckEvent);

      timeoutId = setTimeout(() => {
        finish(new Error('join-room acknowledgement timed out'));
      }, this.ackTimeoutMs);

      const emitter = typeof socket.timeout === 'function'
        ? socket.timeout(this.ackTimeoutMs)
        : socket;

      emitter.emit('join-room', roomId, (...ackArgs: unknown[]) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        const { err, response } = this.parseAckArgs(ackArgs);
        if (err) {
          finish(err);
          return;
        }
  processResponse(response as AckResponse | undefined, 'ack');
      });
    });
  }

  async broadcast(data: BroadcastData | null, volatile = false, metadata: BroadcastMetadata | null = null): Promise<void> {
    if (!data) {
      return;
    }

    if (!this.roomId) {
      console.warn('Broadcast attempted without an active room');
      return;
    }

    const messageId = this.generateMessageId();
    const messageData: BroadcastData = {
      ...data,
      __collabMessageId: messageId,
    };

    this.enqueueMessage({
      id: messageId,
      roomId: this.roomId,
      data: messageData,
      metadata,
      volatile,
      attempts: 0,
    });

    this.flushQueue();
  }

  onBroadcast(callback: (data: BroadcastData) => void): void {
    if (!this.socket) return;

    const handler = (data: BroadcastData, metadata: BroadcastMetadata) => {
      console.log('Received client-broadcast:', { data, metadata });
      callback(data);
    };

    this.registerListener('client-broadcast', handler as (...args: unknown[]) => void);
  }

  onRoomUserChange(callback: (users: string[]) => void): void {
    if (!this.socket) return;
    this.registerListener('room-user-change', callback as (...args: unknown[]) => void);
  }

  onNewUser(callback: (userId: string) => void): void {
    if (!this.socket) return;
    this.registerListener('new-user', callback as (...args: unknown[]) => void);
  }

  onFirstInRoom(callback: () => void): void {
    if (!this.socket) return;
    this.registerListener('first-in-room', callback as (...args: unknown[]) => void);
  }

  disconnect(): void {
    if (this.socket) {
      for (const [event, handler] of this.listeners.entries()) {
        this.socket.off(event, handler);
      }
      this.listeners.clear();
      this.socket.disconnect();
      this.socket = null;
      this.roomId = null;
      this.pendingMessages = [];
      this.joinAcked = false;
      this.pendingBroadcastAcks.clear();
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  getSocketId(): string | undefined {
    return this.socket?.id;
  }

  private enqueueMessage(message: PendingMessage): void {
    this.pendingMessages.push(message);
  }

  private flushQueue(): void {
    if (!this.joinAcked || !this.socket?.connected || this.isFlushingQueue) {
      return;
    }

    this.isFlushingQueue = true;

    const processQueue = () => {
      const message = this.pendingMessages.shift();
      if (!message) {
        this.isFlushingQueue = false;
        return;
      }

      this.sendMessage(message)
        .then(() => {
          message.attempts = 0;
          processQueue();
        })
        .catch((error) => {
          console.error('Failed to deliver broadcast, will retry', error);
          message.attempts += 1;
          message.id = this.generateMessageId();
          message.data = {
            ...message.data,
            __collabMessageId: message.id,
          } as BroadcastData;
          const delay = Math.min(
            this.baseRetryDelayMs * Math.pow(2, Math.max(message.attempts - 1, 0)),
            this.maxRetryDelayMs,
          );
          setTimeout(() => {
            this.pendingMessages.unshift(message);
            this.isFlushingQueue = false;
            this.flushQueue();
          }, delay);
        });
    };

    processQueue();
  }

  private sendMessage(message: PendingMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      const event = message.volatile ? 'server-volatile-broadcast' : 'server-broadcast';
      const emitter = typeof this.socket.timeout === 'function'
        ? this.socket.timeout(this.ackTimeoutMs)
        : this.socket;

      this.ensureBroadcastAckListener();

      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        this.pendingBroadcastAcks.delete(message.id);
      };

      const settle = (error?: Error, response?: AckResponse, isTimeout = false) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        if (error) {
          reject(error);
          return;
        }
        const ackResponse = response ?? { status: 'ok' };
        if (ackResponse.status && ackResponse.status !== 'ok') {
          reject(new Error(ackResponse.error ?? 'broadcast acknowledgement failed'));
          return;
        }
        if (isTimeout) {
          console.warn('Broadcast acknowledgement timed out; assuming success', {
            messageId: message.id,
          });
        }
        resolve();
      };

      this.pendingBroadcastAcks.set(message.id, (response, error) => {
        if (error) {
          settle(error);
          return;
        }
        settle(undefined, response);
      });

      timeoutId = setTimeout(() => {
        settle(undefined, undefined, true);
      }, this.ackTimeoutMs);

      emitter.emit(event, message.roomId, message.data, message.metadata, (...ackArgs: unknown[]) => {
        const { err, response } = this.parseAckArgs(ackArgs);
        if (err) {
          this.handleBroadcastAck(message.id, undefined, err);
          return;
        }
        this.handleBroadcastAck(message.id, (response ?? {}) as AckResponse);
      });
    });
  }

  private ensureBroadcastAckListener(): void {
    if (!this.socket) {
      return;
    }

    if (this.listeners.has('broadcast-ack')) {
      return;
    }

    const handler = (payload: AckResponse & { messageId?: string }) => {
      if (!payload || typeof payload !== 'object') {
        return;
      }
      const messageId = payload.messageId;
      if (typeof messageId !== 'string' || !messageId) {
        return;
      }

      const error = payload.status && payload.status !== 'ok'
        ? new Error(payload.error ?? 'broadcast acknowledgement failed')
        : undefined;

      this.handleBroadcastAck(messageId, payload, error);
    };

    this.registerListener('broadcast-ack', handler as (...args: unknown[]) => void);
  }

  private handleBroadcastAck(messageId: string, response?: AckResponse, error?: Error): void {
    const handler = this.pendingBroadcastAcks.get(messageId);
    if (handler) {
      handler(response, error);
    }
  }

  private generateMessageId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private parseAckArgs(ackArgs: unknown[]): { err: Error | null; response: unknown } {
    if (ackArgs.length === 0) {
      return { err: null, response: undefined };
    }

    if (ackArgs.length === 1) {
      const single = ackArgs[0];
      if (single instanceof Error) {
        return { err: single, response: undefined };
      }
      return { err: null, response: single };
    }

    const [maybeError, response] = ackArgs;
    if (maybeError instanceof Error) {
      return { err: maybeError, response: undefined };
    }

    if (typeof maybeError === 'string' && maybeError.length > 0) {
      return { err: new Error(maybeError), response: undefined };
    }

    return {
      err: null,
      response,
    };
  }

  private registerListener(event: string, handler: (...args: unknown[]) => void): void {
    if (!this.socket) {
      return;
    }

    const existing = this.listeners.get(event);
    if (existing && typeof this.socket.off === 'function') {
      this.socket.off(event, existing);
    }

    this.listeners.set(event, handler);
    this.socket.on(event, handler);
  }
}

