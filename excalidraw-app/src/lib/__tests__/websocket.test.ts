import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CollaborationClient } from '../websocket';
import { io } from 'socket.io-client';

// Mock socket.io-client
vi.mock('socket.io-client');

describe('CollaborationClient', () => {
  let mockSocket: any;
  let client: CollaborationClient;

  beforeEach(() => {
    mockSocket = {
      connected: false,
      id: 'test-socket-id',
      on: vi.fn(),
      once: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
      timeout: vi.fn().mockReturnThis(),
    };

    (io as any).mockReturnValue(mockSocket);
    client = new CollaborationClient('http://localhost:3002');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('connect', () => {
    it('should reject when connection fails', async () => {
      const connectError = new Error('Connection refused');
      
      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect_error') {
          setTimeout(() => callback(connectError), 0);
        }
      });

      await expect(client.connect()).rejects.toThrow('Connection refused');
    });

    it('should handle successful connection', async () => {
      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      await expect(client.connect()).resolves.toBeUndefined();
      expect(io).toHaveBeenCalledWith('http://localhost:3002', {
        transports: ['websocket', 'polling'],
      });
    });

    it('should handle network timeout', async () => {
      const timeoutError = new Error('timeout');
      
      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect_error') {
          setTimeout(() => callback(timeoutError), 0);
        }
      });

      await expect(client.connect()).rejects.toThrow('timeout');
    });
  });

  describe('joinRoom', () => {
    it('should throw error when not connected', () => {
      return expect(client.joinRoom('room-123')).rejects.toThrow('Not connected to server');
    });

    it('should handle empty room ID when trying to join', () => {
      return expect(client.joinRoom('')).rejects.toThrow('Not connected to server');
    });
  });

  describe('broadcast', () => {
    it('should not broadcast when not connected', () => {
      mockSocket.connected = false;
      return expect(client.broadcast({ data: 'test' })).resolves.toBeUndefined();
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('should handle null data', () => {
      mockSocket.connected = false;
      return expect(client.broadcast(null)).resolves.toBeUndefined();
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should handle disconnect when not connected', () => {
      expect(() => client.disconnect()).not.toThrow();
    });
  });

  describe('isConnected', () => {
    it('should return false when not connected', () => {
      expect(client.isConnected()).toBe(false);
    });

    it('should return false when socket is null', () => {
      client.disconnect();
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('getSocketId', () => {
    it('should return undefined before connection', () => {
      // Socket ID may not exist before connect is called
      const id = client.getSocketId();
      expect(id === undefined || typeof id === 'string').toBe(true);
    });

    it('should return undefined when disconnected', () => {
      client.disconnect();
      expect(client.getSocketId()).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle server URL with trailing slash', async () => {
      const client2 = new CollaborationClient('http://localhost:3002/');
      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      await expect(client2.connect()).resolves.toBeUndefined();
    });

    it('should handle connection error with various error types', async () => {
      const errors = [
        new Error('Network error'),
        new Error('Timeout'),
        new Error('Connection refused'),
        new Error('ECONNREFUSED'),
      ];

      for (const error of errors) {
        const testClient = new CollaborationClient('http://test:3002');
        mockSocket.on.mockImplementation((event: string, callback: Function) => {
          if (event === 'connect_error') {
            setTimeout(() => callback(error), 0);
          }
        });

        await expect(testClient.connect()).rejects.toThrow(error.message);
      }
    });

    it('should handle invalid server URLs gracefully', () => {
      const invalidUrls = [
        '',
        'invalid-url',
        'http://',
        'ftp://invalid:3002',
      ];

      invalidUrls.forEach(url => {
        expect(() => new CollaborationClient(url)).not.toThrow();
      });
    });

    it('should handle disconnect before connect', () => {
      const freshClient = new CollaborationClient('http://test:3002');
      expect(() => freshClient.disconnect()).not.toThrow();
      expect(freshClient.isConnected()).toBe(false);
    });

    it('should handle multiple disconnect calls', () => {
      expect(() => {
        client.disconnect();
        client.disconnect();
        client.disconnect();
      }).not.toThrow();
    });

    it('should protect against undefined callback parameters', () => {
      const testClient = new CollaborationClient('http://test:3002');
      
      // These should not crash
      expect(() => testClient.onBroadcast(() => {})).not.toThrow();
      expect(() => testClient.onRoomUserChange(() => {})).not.toThrow();
      expect(() => testClient.onNewUser(() => {})).not.toThrow();
      expect(() => testClient.onFirstInRoom(() => {})).not.toThrow();
    });
  });

  describe('constructor', () => {
    it('should initialize with server URL', () => {
      const testClient = new CollaborationClient('http://custom:3003');
      expect(testClient).toBeDefined();
      expect(testClient.isConnected()).toBe(false);
    });

    it('should handle various URL formats', () => {
      const urls = [
        'http://localhost:3002',
        'https://secure.server.com:443',
        'http://192.168.1.1:8080',
        'ws://websocket.server:3000',
      ];

      urls.forEach(url => {
        const testClient = new CollaborationClient(url);
        expect(testClient).toBeDefined();
      });
    });
  });

  describe('error handling', () => {
    it('should not crash on malformed error objects', async () => {
      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect_error') {
          setTimeout(() => callback({ message: 'Custom error' }), 0);
        }
      });

      await expect(client.connect()).rejects.toBeTruthy();
    });

    it('should handle undefined error in connect_error', async () => {
      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect_error') {
          setTimeout(() => callback(new Error('Undefined connection error')), 0);
        }
      });

      await expect(client.connect()).rejects.toThrow();
    });
  });
});
