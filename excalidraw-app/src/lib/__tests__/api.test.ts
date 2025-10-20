import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExcalidrawAPI, getServerConfig, saveServerConfig } from '../api';

describe('getServerConfig', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should return default config when nothing is saved', () => {
    const config = getServerConfig();

    expect(config).toEqual({
      url: '',
      enabled: false,
    });
  });

  it('should return saved config from localStorage', () => {
    const savedConfig = {
      url: 'http://custom:3002',
      enabled: true,
    };
    localStorage.setItem('excalidraw-server-config', JSON.stringify(savedConfig));

    const config = getServerConfig();

    expect(config).toEqual(savedConfig);
  });

  it('should return default config on parse error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('excalidraw-server-config', 'invalid-json');

    const config = getServerConfig();

    expect(config).toEqual({
      url: '',
      enabled: false,
    });

    consoleSpy.mockRestore();
  });

  it('should handle corrupted localStorage data', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('excalidraw-server-config', '{broken json');

    const config = getServerConfig();

    expect(config.enabled).toBe(false);
    consoleSpy.mockRestore();
  });
});

describe('saveServerConfig', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should save config to localStorage', () => {
    const config = {
      url: 'http://test:3002',
      enabled: true,
    };

    saveServerConfig(config);

    const saved = localStorage.getItem('excalidraw-server-config');
    expect(saved).toBeTruthy();
    expect(JSON.parse(saved!)).toEqual(config);
  });

  it('should overwrite existing config', () => {
    const oldConfig = {
      url: 'http://old:3002',
      enabled: false,
    };
    const newConfig = {
      url: 'http://new:3002',
      enabled: true,
    };

    saveServerConfig(oldConfig);
    saveServerConfig(newConfig);

    const saved = localStorage.getItem('excalidraw-server-config');
    expect(JSON.parse(saved!)).toEqual(newConfig);
  });
});

describe('ExcalidrawAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create API with enabled config', () => {
      const config = { url: 'http://test:3002', enabled: true };
      const api = new ExcalidrawAPI(config);

      expect(api.isEnabled()).toBe(true);
      expect(api.getStorage()).not.toBeNull();
      expect(api.getCollaborationClient()).not.toBeNull();
    });

    it('should create API with disabled config', () => {
      const config = { url: 'http://test:3002', enabled: false };
      const api = new ExcalidrawAPI(config);

      expect(api.isEnabled()).toBe(false);
      expect(api.getStorage()).toBeNull();
      expect(api.getCollaborationClient()).toBeNull();
    });

    it('should handle empty URL', () => {
      const config = { url: '', enabled: true };
      const api = new ExcalidrawAPI(config);

      expect(api.isEnabled()).toBe(true);
    });

    it('should handle special characters in URL', () => {
      const config = { url: 'http://test_server-123.com:3002/api', enabled: true };
      const api = new ExcalidrawAPI(config);

      expect(api.isEnabled()).toBe(true);
    });
  });

  describe('connectToCollaboration', () => {
    it('should throw error when collaboration not configured', async () => {
      const config = { url: 'http://test:3002', enabled: false };
      const api = new ExcalidrawAPI(config);

      await expect(api.connectToCollaboration('room-123')).rejects.toThrow(
        'Collaboration not configured'
      );
    });

    it('should connect when collaboration is configured', async () => {
      const config = { url: 'http://test:3002', enabled: true };
      const api = new ExcalidrawAPI(config);

      const client = api.getCollaborationClient();
      if (client) {
        const connectSpy = vi.spyOn(client, 'connect').mockResolvedValue();
        const joinRoomSpy = vi.spyOn(client, 'joinRoom').mockImplementation(() => {});

        await api.connectToCollaboration('room-123');

        expect(connectSpy).toHaveBeenCalled();
        expect(joinRoomSpy).toHaveBeenCalledWith('room-123');
      }
    });

    it('should handle empty room ID', async () => {
      const config = { url: 'http://test:3002', enabled: true };
      const api = new ExcalidrawAPI(config);

      const client = api.getCollaborationClient();
      if (client) {
        const connectSpy = vi.spyOn(client, 'connect').mockResolvedValue();
        const joinRoomSpy = vi.spyOn(client, 'joinRoom').mockImplementation(() => {});

        await api.connectToCollaboration('');

        expect(joinRoomSpy).toHaveBeenCalledWith('');
      }
    });

    it('should propagate connection errors', async () => {
      const config = { url: 'http://test:3002', enabled: true };
      const api = new ExcalidrawAPI(config);

      const client = api.getCollaborationClient();
      if (client) {
        vi.spyOn(client, 'connect').mockRejectedValue(new Error('Connection failed'));

        await expect(api.connectToCollaboration('room-123')).rejects.toThrow(
          'Connection failed'
        );
      }
    });
  });

  describe('getCollaborationClient', () => {
    it('should return client when enabled', () => {
      const config = { url: 'http://test:3002', enabled: true };
      const api = new ExcalidrawAPI(config);

      expect(api.getCollaborationClient()).not.toBeNull();
    });

    it('should return null when disabled', () => {
      const config = { url: 'http://test:3002', enabled: false };
      const api = new ExcalidrawAPI(config);

      expect(api.getCollaborationClient()).toBeNull();
    });
  });

  describe('getStorage', () => {
    it('should return storage when enabled', () => {
      const config = { url: 'http://test:3002', enabled: true };
      const api = new ExcalidrawAPI(config);

      expect(api.getStorage()).not.toBeNull();
    });

    it('should return null when disabled', () => {
      const config = { url: 'http://test:3002', enabled: false };
      const api = new ExcalidrawAPI(config);

      expect(api.getStorage()).toBeNull();
    });
  });

  describe('isEnabled', () => {
    it('should return true when enabled', () => {
      const config = { url: 'http://test:3002', enabled: true };
      const api = new ExcalidrawAPI(config);

      expect(api.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      const config = { url: 'http://test:3002', enabled: false };
      const api = new ExcalidrawAPI(config);

      expect(api.isEnabled()).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should disconnect collaboration client when exists', () => {
      const config = { url: 'http://test:3002', enabled: true };
      const api = new ExcalidrawAPI(config);

      const client = api.getCollaborationClient();
      if (client) {
        const disconnectSpy = vi.spyOn(client, 'disconnect');

        api.disconnect();

        expect(disconnectSpy).toHaveBeenCalled();
      }
    });

    it('should not throw when collaboration client does not exist', () => {
      const config = { url: 'http://test:3002', enabled: false };
      const api = new ExcalidrawAPI(config);

      expect(() => api.disconnect()).not.toThrow();
    });

    it('should handle multiple disconnect calls', () => {
      const config = { url: 'http://test:3002', enabled: true };
      const api = new ExcalidrawAPI(config);

      expect(() => {
        api.disconnect();
        api.disconnect();
        api.disconnect();
      }).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle URL with trailing slash', () => {
      const config = { url: 'http://test:3002/', enabled: true };
      const api = new ExcalidrawAPI(config);

      expect(api.isEnabled()).toBe(true);
    });

    it('should handle localhost URLs', () => {
      const config = { url: 'http://localhost:3002', enabled: true };
      const api = new ExcalidrawAPI(config);

      expect(api.isEnabled()).toBe(true);
    });

    it('should handle IP address URLs', () => {
      const config = { url: 'http://192.168.1.100:3002', enabled: true };
      const api = new ExcalidrawAPI(config);

      expect(api.isEnabled()).toBe(true);
    });

    it('should handle HTTPS URLs', () => {
      const config = { url: 'https://secure-server.com:3002', enabled: true };
      const api = new ExcalidrawAPI(config);

      expect(api.isEnabled()).toBe(true);
    });

    it('should handle URLs with paths', () => {
      const config = { url: 'http://test:3002/api/v1', enabled: true };
      const api = new ExcalidrawAPI(config);

      expect(api.isEnabled()).toBe(true);
    });
  });
});

