import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CollaborationClient } from '../websocket';
import { io } from 'socket.io-client';

// Mock socket.io-client
vi.mock('socket.io-client');

describe('Follow Feature', () => {
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

  describe('followUser', () => {
    it('should emit user-follow event with correct parameters when following', async () => {
      mockSocket.connected = true;
      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      await client.connect();
      client.joinRoom('test-room');
      client.followUser('target-user-id');

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'user-follow',
        'test-room',
        'target-user-id',
        true
      );
    });

    it('should not emit when not connected', () => {
      mockSocket.connected = false;
      client.followUser('target-user-id');
      
      expect(mockSocket.emit).not.toHaveBeenCalledWith(
        expect.stringContaining('user-follow'),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });

    it('should not emit when no room joined', async () => {
      mockSocket.connected = true;
      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      await client.connect();
      client.followUser('target-user-id');
      
      expect(mockSocket.emit).not.toHaveBeenCalledWith(
        expect.stringContaining('user-follow'),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('unfollowUser', () => {
    it('should emit user-follow event with false when unfollowing', async () => {
      mockSocket.connected = true;
      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      await client.connect();
      client.joinRoom('test-room');
      client.unfollowUser('target-user-id');

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'user-follow',
        'test-room',
        'target-user-id',
        false
      );
    });

    it('should not emit when not connected', () => {
      mockSocket.connected = false;
      client.unfollowUser('target-user-id');
      
      expect(mockSocket.emit).not.toHaveBeenCalledWith(
        expect.stringContaining('user-follow'),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('onUserFollow', () => {
    it('should register handler for user-follow-update event', async () => {
      mockSocket.connected = true;
      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      await client.connect();

      const callback = vi.fn();
      client.onUserFollow(callback);

      expect(mockSocket.on).toHaveBeenCalledWith('user-follow-update', callback);
    });

    it('should handle follow update data correctly', async () => {
      mockSocket.connected = true;
      const callback = vi.fn();
      let followHandler: Function | undefined;

      mockSocket.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'connect') {
          setTimeout(() => handler(), 0);
        } else if (event === 'user-follow-update') {
          followHandler = handler;
        }
      });

      await client.connect();
      client.onUserFollow(callback);

      const followData = {
        followerId: 'follower-123',
        targetId: 'target-456',
        isFollowing: true,
      };

      followHandler?.(followData);

      expect(callback).toHaveBeenCalledWith(followData);
    });

    it('should handle unfollow update data correctly', async () => {
      mockSocket.connected = true;
      const callback = vi.fn();
      let followHandler: Function | undefined;

      mockSocket.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'connect') {
          setTimeout(() => handler(), 0);
        } else if (event === 'user-follow-update') {
          followHandler = handler;
        }
      });

      await client.connect();
      client.onUserFollow(callback);

      const unfollowData = {
        followerId: 'follower-123',
        targetId: 'target-456',
        isFollowing: false,
      };

      followHandler?.(unfollowData);

      expect(callback).toHaveBeenCalledWith(unfollowData);
    });

    it('should not crash when callback is not provided', async () => {
      mockSocket.connected = true;
      mockSocket.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'connect') {
          setTimeout(() => handler(), 0);
        } else if (event === 'user-follow-update') {
          return;
        }
      });

      await client.connect();
      expect(() => client.onUserFollow(vi.fn())).not.toThrow();
    });
  });

  describe('disconnect', () => {
    it('should stop following when disconnected', async () => {
      mockSocket.connected = true;
      mockSocket.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      await client.connect();
      client.joinRoom('test-room');
      client.followUser('target-user-id');

      mockSocket.emit.mockClear();
      client.disconnect();

      // After disconnect, trying to follow should not emit
      client.followUser('another-user');
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });
});
