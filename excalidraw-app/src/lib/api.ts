import { ServerStorage } from './storage';
import { CollaborationClient } from './websocket';

export interface ServerConfig {
  url: string;
  enabled: boolean;
}

export class ExcalidrawAPI {
  private storage: ServerStorage | null = null;
  private collaboration: CollaborationClient | null = null;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    if (config.enabled && config.url) {
      this.storage = new ServerStorage(config.url);
      this.collaboration = new CollaborationClient(config.url);
    }
  }

  async connectToCollaboration(roomId: string): Promise<void> {
    if (!this.collaboration) {
      throw new Error('Collaboration not configured');
    }
    await this.collaboration.connect();
    await this.collaboration.joinRoom(roomId);
  }

  getCollaborationClient(): CollaborationClient | null {
    return this.collaboration;
  }

  getStorage(): ServerStorage | null {
    return this.storage;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  disconnect(): void {
    this.collaboration?.disconnect();
  }
}

export function getServerConfig(): ServerConfig {
  const stored = localStorage.getItem('excalidraw-server-config');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to parse server config', e);
    }
  }
  return {
    url: 'http://localhost:3002',
    enabled: false,
  };
}

export function saveServerConfig(config: ServerConfig): void {
  localStorage.setItem('excalidraw-server-config', JSON.stringify(config));
}

