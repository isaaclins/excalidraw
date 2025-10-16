import { RoomSettings } from './storage';

export interface AutoSnapshotConfig {
  roomId: string;
  enabled: boolean;
  settings: RoomSettings;
  onSave: (roomId: string, data: string, thumbnail: string) => Promise<void>;
  getData: () => string;
  getThumbnail: () => Promise<string>;
}

export class AutoSnapshotManager {
  private config: AutoSnapshotConfig;
  private intervalId: number | null = null;
  private changeCount = 0;
  private lastSaveTime = 0;

  constructor(config: AutoSnapshotConfig) {
    this.config = config;
  }

  start(): void {
    if (!this.config.enabled || this.intervalId) {
      return;
    }

    // Convert interval from seconds to milliseconds
    const intervalMs = this.config.settings.auto_save_interval * 1000;

    this.intervalId = setInterval(async () => {
      await this.checkAndSave();
    }, intervalMs);

    console.log(`Auto-snapshot started for room ${this.config.roomId} with interval ${this.config.settings.auto_save_interval}s`);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log(`Auto-snapshot stopped for room ${this.config.roomId}`);
    }
  }

  updateSettings(settings: RoomSettings): void {
    const needsRestart = this.intervalId && settings.auto_save_interval !== this.config.settings.auto_save_interval;
    
    this.config.settings = settings;
    
    if (needsRestart) {
      this.stop();
      this.start();
    }
  }

  trackChange(): void {
    this.changeCount++;
  }

  resetChangeCount(): void {
    this.changeCount = 0;
  }

  async checkAndSave(): Promise<void> {
    const now = Date.now();
    const timeSinceLastSave = (now - this.lastSaveTime) / 1000; // Convert to seconds

    // Only save if there are changes and enough time has passed
    if (this.changeCount > 0 && timeSinceLastSave >= this.config.settings.auto_save_interval) {
      try {
        const data = this.config.getData();
        const thumbnail = await this.config.getThumbnail();
        
        await this.config.onSave(this.config.roomId, data, thumbnail);
        
        this.lastSaveTime = now;
        this.changeCount = 0;
        
        console.log(`Auto-snapshot saved for room ${this.config.roomId}`);
      } catch (error) {
        console.error('Failed to save auto-snapshot:', error);
      }
    }
  }

  async forceSave(): Promise<void> {
    try {
      const data = this.config.getData();
      const thumbnail = await this.config.getThumbnail();
      
      await this.config.onSave(this.config.roomId, data, thumbnail);
      
      this.lastSaveTime = Date.now();
      this.changeCount = 0;
      
      console.log(`Manual snapshot saved for room ${this.config.roomId}`);
    } catch (error) {
      console.error('Failed to save manual snapshot:', error);
      throw error;
    }
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }

  getChangeCount(): number {
    return this.changeCount;
  }

  getTimeSinceLastSave(): number {
    return this.lastSaveTime ? (Date.now() - this.lastSaveTime) / 1000 : 0;
  }
}

