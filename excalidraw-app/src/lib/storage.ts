import { invoke } from '@tauri-apps/api/core';

export interface Drawing {
  id: string;
  name: string;
  data: string;
  created_at: number;
  updated_at: number;
}

export interface Snapshot {
  id: string;
  room_id: string;
  name?: string;
  description?: string;
  thumbnail?: string;
  created_by?: string;
  created_at: number;
  data?: string;
}

export interface RoomSettings {
  room_id: string;
  max_snapshots: number;
  auto_save_interval: number;
}

export class LocalStorage {
  async saveDrawing(name: string, data: string): Promise<string> {
    return invoke<string>('save_drawing', { name, data });
  }

  async updateDrawing(id: string, name: string, data: string): Promise<void> {
    return invoke('update_drawing', { id, name, data });
  }

  async loadDrawing(id: string): Promise<Drawing> {
    return invoke<Drawing>('load_drawing', { id });
  }

  async listDrawings(): Promise<Drawing[]> {
    return invoke<Drawing[]>('list_drawings');
  }

  async deleteDrawing(id: string): Promise<void> {
    return invoke('delete_drawing', { id });
  }

  // Snapshot methods
  async saveSnapshot(
    roomId: string,
    data: string,
    name?: string,
    description?: string,
    thumbnail?: string,
    createdBy?: string
  ): Promise<string> {
    return invoke<string>('save_snapshot', {
      roomId,
      name: name || null,
      description: description || null,
      thumbnail: thumbnail || null,
      createdBy: createdBy || null,
      data,
    });
  }

  async listSnapshots(roomId: string): Promise<Snapshot[]> {
    return invoke<Snapshot[]>('list_snapshots', { roomId });
  }

  async loadSnapshot(id: string): Promise<Snapshot> {
    console.log(`Loading snapshot ${id} from local storage...`);
    const snapshot = await invoke<Snapshot>('load_snapshot', { id });
    console.log('Snapshot loaded from local storage:', snapshot);
    return snapshot;
  }

  async deleteSnapshot(id: string): Promise<void> {
    return invoke('delete_snapshot', { id });
  }

  async updateSnapshotMetadata(id: string, name: string, description: string): Promise<void> {
    return invoke('update_snapshot_metadata', { id, name, description });
  }

  async getRoomSettings(roomId: string): Promise<RoomSettings> {
    return invoke<RoomSettings>('get_room_settings', { roomId });
  }

  async updateRoomSettings(roomId: string, maxSnapshots: number, autoSaveInterval: number): Promise<void> {
    return invoke('update_room_settings', { roomId, maxSnapshots, autoSaveInterval });
  }
}

export class ServerStorage {
  private serverUrl: string;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  async saveDrawing(data: string): Promise<string> {
    const response = await fetch(`${this.serverUrl}/api/v2/post/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: data,
    });

    if (!response.ok) {
      throw new Error('Failed to save drawing to server');
    }

    const result = await response.json();
    return result.id;
  }

  async loadDrawing(id: string): Promise<string> {
    const response = await fetch(`${this.serverUrl}/api/v2/${id}/`);

    if (!response.ok) {
      throw new Error('Failed to load drawing from server');
    }

    return response.text();
  }

  // Snapshot methods
  async saveSnapshot(
    roomId: string,
    data: string,
    name?: string,
    description?: string,
    thumbnail?: string,
    createdBy?: string
  ): Promise<string> {
    const response = await fetch(`${this.serverUrl}/api/rooms/${roomId}/snapshots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: name || '',
        description: description || '',
        thumbnail: thumbnail || '',
        created_by: createdBy || '',
        data,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to save snapshot to server');
    }

    const result = await response.json();
    return result.id;
  }

  async listSnapshots(roomId: string): Promise<Snapshot[]> {
    const response = await fetch(`${this.serverUrl}/api/rooms/${roomId}/snapshots`);

    if (!response.ok) {
      throw new Error('Failed to list snapshots from server');
    }

    return response.json();
  }

  async loadSnapshot(id: string): Promise<Snapshot> {
    console.log(`Loading snapshot ${id} from server...`);
    const response = await fetch(`${this.serverUrl}/api/snapshots/${id}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Server returned ${response.status}:`, errorText);
      throw new Error(`Failed to load snapshot from server (${response.status}): ${errorText}`);
    }

    const snapshot = await response.json();
    console.log('Snapshot loaded from server:', snapshot);
    return snapshot;
  }

  async deleteSnapshot(id: string): Promise<void> {
    const response = await fetch(`${this.serverUrl}/api/snapshots/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to delete snapshot from server');
    }
  }

  async updateSnapshotMetadata(id: string, name: string, description: string): Promise<void> {
    const response = await fetch(`${this.serverUrl}/api/snapshots/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, description }),
    });

    if (!response.ok) {
      throw new Error('Failed to update snapshot metadata');
    }
  }

  async getRoomSettings(roomId: string): Promise<RoomSettings> {
    const response = await fetch(`${this.serverUrl}/api/rooms/${roomId}/settings`);

    if (!response.ok) {
      // Return default settings if not found
      return {
        room_id: roomId,
        max_snapshots: 10,
        auto_save_interval: 300,
      };
    }

    return response.json();
  }

  async updateRoomSettings(roomId: string, maxSnapshots: number, autoSaveInterval: number): Promise<void> {
    const response = await fetch(`${this.serverUrl}/api/rooms/${roomId}/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        max_snapshots: maxSnapshots,
        auto_save_interval: autoSaveInterval,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to update room settings');
    }
  }
}

export const localStorage = new LocalStorage();

