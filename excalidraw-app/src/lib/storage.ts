import { invoke } from '@tauri-apps/api/core';

export interface Drawing {
  id: string;
  name: string;
  data: string;
  created_at: number;
  updated_at: number;
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
}

export const localStorage = new LocalStorage();

