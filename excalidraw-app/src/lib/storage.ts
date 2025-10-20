import { invoke } from '@tauri-apps/api/core';

const isBrowser = typeof window !== 'undefined';
const globalProcessEnv: Record<string, string | undefined> | undefined = typeof globalThis !== 'undefined'
  && typeof (globalThis as { process?: { env?: Record<string, string | undefined> } }).process === 'object'
  ? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  : undefined;
const isTestEnvironment = !!globalProcessEnv
  && (globalProcessEnv.NODE_ENV === 'test'
    || typeof globalProcessEnv.VITEST_WORKER_ID !== 'undefined');
const hasTauriBridge = (isBrowser && '__TAURI__' in (window as unknown as Record<string, unknown>)) || isTestEnvironment;

const BROWSER_STATE_KEY = 'excalidraw-browser-state';

interface BrowserState {
  drawings: Drawing[];
  snapshots: Snapshot[];
  roomSettings: Record<string, RoomSettings>;
}

const createFallbackId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const readBrowserState = (): BrowserState => {
  if (!isBrowser || !('localStorage' in window)) {
    return { drawings: [], snapshots: [], roomSettings: {} };
  }

  const storage = window.localStorage;
  const raw = storage.getItem(BROWSER_STATE_KEY);
  if (!raw) {
    return { drawings: [], snapshots: [], roomSettings: {} };
  }

  try {
    const parsed = JSON.parse(raw) as BrowserState;
    return {
      drawings: Array.isArray(parsed.drawings) ? parsed.drawings : [],
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
      roomSettings: parsed.roomSettings && typeof parsed.roomSettings === 'object'
        ? parsed.roomSettings
        : {},
    };
  } catch (error) {
    console.warn('Failed to parse browser storage state; resetting', error);
    return { drawings: [], snapshots: [], roomSettings: {} };
  }
};

const writeBrowserState = (state: BrowserState): void => {
  if (!isBrowser || !('localStorage' in window)) {
    return;
  }
  try {
    window.localStorage.setItem(BROWSER_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to persist browser storage state', error);
  }
};

const ensureRoomSettings = (state: BrowserState, roomId: string): RoomSettings => {
  if (!state.roomSettings[roomId]) {
    state.roomSettings[roomId] = {
      room_id: roomId,
      max_snapshots: 10,
      auto_save_interval: 300,
    };
  }
  return state.roomSettings[roomId];
};

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
    if (!hasTauriBridge) {
      const state = readBrowserState();
      const id = createFallbackId();
      const timestamp = Date.now();
      state.drawings.push({
        id,
        name,
        data,
        created_at: timestamp,
        updated_at: timestamp,
      });
      writeBrowserState(state);
      return id;
    }

    return invoke<string>('save_drawing', { name, data });
  }

  async updateDrawing(id: string, name: string, data: string): Promise<void> {
    if (!hasTauriBridge) {
      const state = readBrowserState();
      const timestamp = Date.now();
      const existingIndex = state.drawings.findIndex((drawing) => drawing.id === id);
      if (existingIndex === -1) {
        state.drawings.push({ id, name, data, created_at: timestamp, updated_at: timestamp });
      } else {
        state.drawings[existingIndex] = {
          ...state.drawings[existingIndex],
          name,
          data,
          updated_at: timestamp,
        };
      }
      writeBrowserState(state);
      return;
    }

    return invoke('update_drawing', { id, name, data });
  }

  async loadDrawing(id: string): Promise<Drawing> {
    if (!hasTauriBridge) {
      const state = readBrowserState();
      const drawing = state.drawings.find((item) => item.id === id);
      if (!drawing) {
        throw new Error(`Drawing ${id} not found`);
      }
      return drawing;
    }

    return invoke<Drawing>('load_drawing', { id });
  }

  async listDrawings(): Promise<Drawing[]> {
    if (!hasTauriBridge) {
      const state = readBrowserState();
      return state.drawings.slice();
    }

    return invoke<Drawing[]>('list_drawings');
  }

  async deleteDrawing(id: string): Promise<void> {
    if (!hasTauriBridge) {
      const state = readBrowserState();
      state.drawings = state.drawings.filter((drawing) => drawing.id !== id);
      writeBrowserState(state);
      return;
    }

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
    if (!hasTauriBridge) {
      const state = readBrowserState();
      const id = createFallbackId();
      const timestamp = Date.now();
      state.snapshots.push({
        id,
        room_id: roomId,
        name,
        description,
        thumbnail,
        created_by: createdBy,
        created_at: timestamp,
        data,
      });
      writeBrowserState(state);
      return id;
    }

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
    if (!hasTauriBridge) {
      const state = readBrowserState();
      return state.snapshots.filter((snapshot) => snapshot.room_id === roomId);
    }

    return invoke<Snapshot[]>('list_snapshots', { roomId });
  }

  async loadSnapshot(id: string): Promise<Snapshot> {
    if (!hasTauriBridge) {
      const state = readBrowserState();
      const snapshot = state.snapshots.find((item) => item.id === id);
      if (!snapshot) {
        throw new Error(`Snapshot ${id} not found`);
      }
      return snapshot;
    }

    console.log(`Loading snapshot ${id} from local storage...`);
    const snapshot = await invoke<Snapshot>('load_snapshot', { id });
    console.log('Snapshot loaded from local storage:', snapshot);
    return snapshot;
  }

  async deleteSnapshot(id: string): Promise<void> {
    if (!hasTauriBridge) {
      const state = readBrowserState();
      state.snapshots = state.snapshots.filter((snapshot) => snapshot.id !== id);
      writeBrowserState(state);
      return;
    }

    return invoke('delete_snapshot', { id });
  }

  async updateSnapshotMetadata(id: string, name: string, description: string): Promise<void> {
    if (!hasTauriBridge) {
      const state = readBrowserState();
      const snapshotIndex = state.snapshots.findIndex((snapshot) => snapshot.id === id);
      if (snapshotIndex !== -1) {
        state.snapshots[snapshotIndex] = {
          ...state.snapshots[snapshotIndex],
          name,
          description,
        };
        writeBrowserState(state);
      }
      return;
    }

    return invoke('update_snapshot_metadata', { id, name, description });
  }

  async getRoomSettings(roomId: string): Promise<RoomSettings> {
    if (!hasTauriBridge) {
      const state = readBrowserState();
      const settings = ensureRoomSettings(state, roomId);
      writeBrowserState(state);
      return settings;
    }

    return invoke<RoomSettings>('get_room_settings', { roomId });
  }

  async updateRoomSettings(roomId: string, maxSnapshots: number, autoSaveInterval: number): Promise<void> {
    if (!hasTauriBridge) {
      const state = readBrowserState();
      const existing = ensureRoomSettings(state, roomId);
      state.roomSettings[roomId] = {
        ...existing,
        max_snapshots: maxSnapshots,
        auto_save_interval: autoSaveInterval,
      };
      writeBrowserState(state);
      return;
    }

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

