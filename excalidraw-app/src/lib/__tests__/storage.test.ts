import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServerStorage, LocalStorage } from '../storage';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core');

describe('ServerStorage', () => {
  let storage: ServerStorage;
  let fetchMock: any;

  beforeEach(() => {
    storage = new ServerStorage('http://localhost:3002');
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('saveDrawing', () => {
    it('should save drawing successfully', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'drawing-123' }),
      });

      const result = await storage.saveDrawing('{"elements":[]}');
      expect(result).toBe('drawing-123');
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3002/api/v2/post/',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{"elements":[]}',
        }
      );
    });

    it('should throw error on network failure', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));

      await expect(storage.saveDrawing('{"elements":[]}')).rejects.toThrow('Network error');
    });

    it('should throw error on 500 response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(storage.saveDrawing('{"elements":[]}')).rejects.toThrow(
        'Failed to save drawing to server'
      );
    });

    it('should throw error on 404 response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(storage.saveDrawing('{"elements":[]}')).rejects.toThrow(
        'Failed to save drawing to server'
      );
    });

    it('should handle empty data', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'empty-123' }),
      });

      const result = await storage.saveDrawing('');
      expect(result).toBe('empty-123');
    });

    it('should handle malformed JSON response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(storage.saveDrawing('{"elements":[]}')).rejects.toThrow('Invalid JSON');
    });

    it('should handle very large payloads', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'large-123' }),
      });

      const largeData = JSON.stringify({
        elements: Array(10000).fill({ id: 'test', type: 'rectangle' }),
      });

      const result = await storage.saveDrawing(largeData);
      expect(result).toBe('large-123');
    });
  });

  describe('loadDrawing', () => {
    it('should load drawing successfully', async () => {
      const drawingData = '{"elements":[{"id":"1"}]}';
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => drawingData,
      });

      const result = await storage.loadDrawing('drawing-123');
      expect(result).toBe(drawingData);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:3002/api/v2/drawing-123/');
    });

    it('should throw error on 404', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(storage.loadDrawing('nonexistent')).rejects.toThrow(
        'Failed to load drawing from server'
      );
    });

    it('should handle network timeout', async () => {
      fetchMock.mockRejectedValue(new Error('Request timeout'));

      await expect(storage.loadDrawing('drawing-123')).rejects.toThrow('Request timeout');
    });

    it('should handle corrupted response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => {
          throw new Error('Corrupted stream');
        },
      });

      await expect(storage.loadDrawing('drawing-123')).rejects.toThrow('Corrupted stream');
    });
  });

  describe('Snapshot operations', () => {
    describe('saveSnapshot', () => {
      it('should save snapshot with all fields', async () => {
        fetchMock.mockResolvedValue({
          ok: true,
          json: async () => ({ id: 'snapshot-123' }),
        });

        const result = await storage.saveSnapshot(
          'room-1',
          '{"elements":[]}',
          'My Snapshot',
          'Description here',
          'data:image/png;base64,abc',
          'user-1'
        );

        expect(result).toBe('snapshot-123');
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:3002/api/rooms/room-1/snapshots',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: 'My Snapshot',
              description: 'Description here',
              thumbnail: 'data:image/png;base64,abc',
              created_by: 'user-1',
              data: '{"elements":[]}',
            }),
          }
        );
      });

      it('should save snapshot with minimal fields', async () => {
        fetchMock.mockResolvedValue({
          ok: true,
          json: async () => ({ id: 'snapshot-456' }),
        });

        const result = await storage.saveSnapshot('room-1', '{"elements":[]}');

        expect(result).toBe('snapshot-456');
        const call = fetchMock.mock.calls[0][1];
        const body = JSON.parse(call.body);
        expect(body.name).toBe('');
        expect(body.description).toBe('');
        expect(body.thumbnail).toBe('');
        expect(body.created_by).toBe('');
      });

      it('should throw error on server rejection', async () => {
        fetchMock.mockResolvedValue({
          ok: false,
          status: 403,
        });

        await expect(
          storage.saveSnapshot('room-1', '{"elements":[]}')
        ).rejects.toThrow('Failed to save snapshot to server');
      });

      it('should handle special characters in room ID', async () => {
        fetchMock.mockResolvedValue({
          ok: true,
          json: async () => ({ id: 'snapshot-789' }),
        });

        await storage.saveSnapshot('room-!@#$%', '{"elements":[]}');
        
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:3002/api/rooms/room-!@#$%/snapshots',
          expect.any(Object)
        );
      });
    });

    describe('listSnapshots', () => {
      it('should list snapshots for a room', async () => {
        const snapshots = [
          { id: 'snap-1', room_id: 'room-1', created_at: 123456 },
          { id: 'snap-2', room_id: 'room-1', created_at: 123457 },
        ];

        fetchMock.mockResolvedValue({
          ok: true,
          json: async () => snapshots,
        });

        const result = await storage.listSnapshots('room-1');
        expect(result).toEqual(snapshots);
      });

      it('should throw error on server error', async () => {
        fetchMock.mockResolvedValue({
          ok: false,
          status: 500,
        });

        await expect(storage.listSnapshots('room-1')).rejects.toThrow(
          'Failed to list snapshots from server'
        );
      });

      it('should handle empty list', async () => {
        fetchMock.mockResolvedValue({
          ok: true,
          json: async () => [],
        });

        const result = await storage.listSnapshots('room-1');
        expect(result).toEqual([]);
      });
    });

    describe('loadSnapshot', () => {
      it('should load snapshot successfully', async () => {
        const snapshot = {
          id: 'snap-1',
          room_id: 'room-1',
          data: '{"elements":[]}',
          created_at: 123456,
        };

        fetchMock.mockResolvedValue({
          ok: true,
          json: async () => snapshot,
        });

        const result = await storage.loadSnapshot('snap-1');
        expect(result).toEqual(snapshot);
      });

      it('should throw detailed error on failure', async () => {
        fetchMock.mockResolvedValue({
          ok: false,
          status: 404,
          text: async () => 'Snapshot not found',
        });

        await expect(storage.loadSnapshot('nonexistent')).rejects.toThrow(
          'Failed to load snapshot from server (404): Snapshot not found'
        );
      });
    });

    describe('deleteSnapshot', () => {
      it('should delete snapshot successfully', async () => {
        fetchMock.mockResolvedValue({
          ok: true,
        });

        await expect(storage.deleteSnapshot('snap-1')).resolves.toBeUndefined();
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:3002/api/snapshots/snap-1',
          { method: 'DELETE' }
        );
      });

      it('should throw error on failure', async () => {
        fetchMock.mockResolvedValue({
          ok: false,
          status: 403,
        });

        await expect(storage.deleteSnapshot('snap-1')).rejects.toThrow(
          'Failed to delete snapshot from server'
        );
      });
    });

    describe('updateSnapshotMetadata', () => {
      it('should update metadata successfully', async () => {
        fetchMock.mockResolvedValue({
          ok: true,
        });

        await expect(
          storage.updateSnapshotMetadata('snap-1', 'New Name', 'New Description')
        ).resolves.toBeUndefined();

        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:3002/api/snapshots/snap-1',
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'New Name', description: 'New Description' }),
          }
        );
      });

      it('should throw error on failure', async () => {
        fetchMock.mockResolvedValue({
          ok: false,
          status: 400,
        });

        await expect(
          storage.updateSnapshotMetadata('snap-1', 'New Name', 'New Description')
        ).rejects.toThrow('Failed to update snapshot metadata');
      });
    });
  });

  describe('Room settings', () => {
    describe('getRoomSettings', () => {
      it('should get room settings', async () => {
        const settings = {
          room_id: 'room-1',
          max_snapshots: 15,
          auto_save_interval: 600,
        };

        fetchMock.mockResolvedValue({
          ok: true,
          json: async () => settings,
        });

        const result = await storage.getRoomSettings('room-1');
        expect(result).toEqual(settings);
      });

      it('should return defaults when not found', async () => {
        fetchMock.mockResolvedValue({
          ok: false,
          status: 404,
        });

        const result = await storage.getRoomSettings('room-1');
        expect(result).toEqual({
          room_id: 'room-1',
          max_snapshots: 10,
          auto_save_interval: 300,
        });
      });
    });

    describe('updateRoomSettings', () => {
      it('should update room settings', async () => {
        fetchMock.mockResolvedValue({
          ok: true,
        });

        await expect(
          storage.updateRoomSettings('room-1', 20, 900)
        ).resolves.toBeUndefined();

        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:3002/api/rooms/room-1/settings',
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              max_snapshots: 20,
              auto_save_interval: 900,
            }),
          }
        );
      });

      it('should throw error on failure', async () => {
        fetchMock.mockResolvedValue({
          ok: false,
          status: 400,
        });

        await expect(
          storage.updateRoomSettings('room-1', 20, 900)
        ).rejects.toThrow('Failed to update room settings');
      });

      it('should handle invalid values', async () => {
        fetchMock.mockResolvedValue({
          ok: false,
          status: 400,
        });

        await expect(
          storage.updateRoomSettings('room-1', -1, -100)
        ).rejects.toThrow();
      });
    });
  });
});

describe('LocalStorage', () => {
  let storage: LocalStorage;

  beforeEach(() => {
    storage = new LocalStorage();
    vi.clearAllMocks();
  });

  describe('saveDrawing', () => {
    it('should save drawing via Tauri invoke', async () => {
      (invoke as any).mockResolvedValue('drawing-local-123');

      const result = await storage.saveDrawing('My Drawing', '{"elements":[]}');
      
      expect(result).toBe('drawing-local-123');
      expect(invoke).toHaveBeenCalledWith('save_drawing', {
        name: 'My Drawing',
        data: '{"elements":[]}',
      });
    });

    it('should throw error on Tauri failure', async () => {
      (invoke as any).mockRejectedValue(new Error('Database error'));

      await expect(
        storage.saveDrawing('My Drawing', '{"elements":[]}')
      ).rejects.toThrow('Database error');
    });
  });

  describe('updateDrawing', () => {
    it('should update drawing', async () => {
      (invoke as any).mockResolvedValue(undefined);

      await expect(
        storage.updateDrawing('drawing-1', 'Updated', '{"elements":[]}')
      ).resolves.toBeUndefined();
    });
  });

  describe('loadDrawing', () => {
    it('should load drawing', async () => {
      const drawing = {
        id: 'drawing-1',
        name: 'My Drawing',
        data: '{"elements":[]}',
        created_at: 123456,
        updated_at: 123457,
      };

      (invoke as any).mockResolvedValue(drawing);

      const result = await storage.loadDrawing('drawing-1');
      expect(result).toEqual(drawing);
    });

    it('should throw error when drawing not found', async () => {
      (invoke as any).mockRejectedValue(new Error('Drawing not found'));

      await expect(storage.loadDrawing('nonexistent')).rejects.toThrow('Drawing not found');
    });
  });

  describe('listDrawings', () => {
    it('should list all drawings', async () => {
      const drawings = [
        { id: '1', name: 'Drawing 1', data: '{}', created_at: 1, updated_at: 1 },
        { id: '2', name: 'Drawing 2', data: '{}', created_at: 2, updated_at: 2 },
      ];

      (invoke as any).mockResolvedValue(drawings);

      const result = await storage.listDrawings();
      expect(result).toEqual(drawings);
    });

    it('should handle empty list', async () => {
      (invoke as any).mockResolvedValue([]);

      const result = await storage.listDrawings();
      expect(result).toEqual([]);
    });
  });

  describe('deleteDrawing', () => {
    it('should delete drawing', async () => {
      (invoke as any).mockResolvedValue(undefined);

      await expect(storage.deleteDrawing('drawing-1')).resolves.toBeUndefined();
      expect(invoke).toHaveBeenCalledWith('delete_drawing', { id: 'drawing-1' });
    });
  });

  describe('Snapshot operations', () => {
    it('should save snapshot with all parameters', async () => {
      (invoke as any).mockResolvedValue('snapshot-local-1');

      const result = await storage.saveSnapshot(
        'room-1',
        '{"elements":[]}',
        'Snapshot 1',
        'Description',
        'thumbnail',
        'user-1'
      );

      expect(result).toBe('snapshot-local-1');
      expect(invoke).toHaveBeenCalledWith('save_snapshot', {
        roomId: 'room-1',
        name: 'Snapshot 1',
        description: 'Description',
        thumbnail: 'thumbnail',
        createdBy: 'user-1',
        data: '{"elements":[]}',
      });
    });

    it('should save snapshot with null optional parameters', async () => {
      (invoke as any).mockResolvedValue('snapshot-local-2');

      await storage.saveSnapshot('room-1', '{"elements":[]}');

      expect(invoke).toHaveBeenCalledWith('save_snapshot', {
        roomId: 'room-1',
        name: null,
        description: null,
        thumbnail: null,
        createdBy: null,
        data: '{"elements":[]}',
      });
    });

    it('should list snapshots', async () => {
      const snapshots = [
        { id: '1', room_id: 'room-1', created_at: 123 },
      ];

      (invoke as any).mockResolvedValue(snapshots);

      const result = await storage.listSnapshots('room-1');
      expect(result).toEqual(snapshots);
    });

    it('should load snapshot', async () => {
      const snapshot = {
        id: 'snap-1',
        room_id: 'room-1',
        data: '{"elements":[]}',
        created_at: 123,
      };

      (invoke as any).mockResolvedValue(snapshot);

      const result = await storage.loadSnapshot('snap-1');
      expect(result).toEqual(snapshot);
    });

    it('should delete snapshot', async () => {
      (invoke as any).mockResolvedValue(undefined);

      await expect(storage.deleteSnapshot('snap-1')).resolves.toBeUndefined();
    });

    it('should update snapshot metadata', async () => {
      (invoke as any).mockResolvedValue(undefined);

      await expect(
        storage.updateSnapshotMetadata('snap-1', 'New Name', 'New Desc')
      ).resolves.toBeUndefined();

      expect(invoke).toHaveBeenCalledWith('update_snapshot_metadata', {
        id: 'snap-1',
        name: 'New Name',
        description: 'New Desc',
      });
    });
  });

  describe('Room settings', () => {
    it('should get room settings', async () => {
      const settings = {
        room_id: 'room-1',
        max_snapshots: 10,
        auto_save_interval: 300,
      };

      (invoke as any).mockResolvedValue(settings);

      const result = await storage.getRoomSettings('room-1');
      expect(result).toEqual(settings);
    });

    it('should update room settings', async () => {
      (invoke as any).mockResolvedValue(undefined);

      await expect(
        storage.updateRoomSettings('room-1', 15, 600)
      ).resolves.toBeUndefined();

      expect(invoke).toHaveBeenCalledWith('update_room_settings', {
        roomId: 'room-1',
        maxSnapshots: 15,
        autoSaveInterval: 600,
      });
    });
  });
});

