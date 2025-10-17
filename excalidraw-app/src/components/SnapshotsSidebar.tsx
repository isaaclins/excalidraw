import { useState, useEffect, useCallback } from 'react';
import { Snapshot, RoomSettings, LocalStorage, ServerStorage } from '../lib/storage';
import './SnapshotsSidebar.css';

interface SnapshotsSidebarProps {
  roomId: string;
  storage: LocalStorage | ServerStorage;
  isVisible: boolean;
  onClose: () => void;
  onLoadSnapshot: (snapshot: Snapshot) => void;
  onSaveSnapshot: () => void;
}

interface SnapshotFormData {
  name: string;
  description: string;
}

export function SnapshotsSidebar({ 
  roomId, 
  storage, 
  isVisible, 
  onClose, 
  onLoadSnapshot, 
  onSaveSnapshot 
}: SnapshotsSidebarProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [settings, setSettings] = useState<RoomSettings>({
    room_id: roomId,
    max_snapshots: 10,
    auto_save_interval: 300,
  });
  const [loading, setLoading] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editingSnapshot, setEditingSnapshot] = useState<Snapshot | null>(null);
  const [formData, setFormData] = useState<SnapshotFormData>({ name: '', description: '' });
  const [settingsFormData, setSettingsFormData] = useState<RoomSettings>(settings);

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const result = await storage.listSnapshots(roomId);
      setSnapshots(result || []);
    } catch (error) {
      console.error('Failed to load snapshots:', error);
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, [storage, roomId]);

  const loadSettings = useCallback(async () => {
    try {
      const result = await storage.getRoomSettings(roomId);
      setSettings(result);
      setSettingsFormData(result);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }, [storage, roomId]);

  useEffect(() => {
    if (!isVisible) return;

    loadSnapshots();
    loadSettings();
  }, [roomId, isVisible, loadSnapshots, loadSettings]);

  const handleSaveClick = () => {
    setFormData({ name: '', description: '' });
    setShowSaveModal(true);
  };

  const handleSaveSnapshot = async () => {
    try {
      await onSaveSnapshot();
      setShowSaveModal(false);
      await loadSnapshots();
    } catch (error) {
      console.error('Failed to save snapshot:', error);
      alert('Failed to save snapshot');
    }
  };

  const handleLoadSnapshot = async (snapshot: Snapshot) => {
    if (window.confirm('Load this snapshot? Current unsaved changes will be lost.')) {
      try {
        const fullSnapshot = await storage.loadSnapshot(snapshot.id);
        onLoadSnapshot(fullSnapshot);
        onClose();
      } catch (error) {
        console.error('Failed to load snapshot:', error);
        alert('Failed to load snapshot');
      }
    }
  };

  const handleDeleteSnapshot = async (snapshotId: string) => {
    if (window.confirm('Delete this snapshot? This action cannot be undone.')) {
      try {
        await storage.deleteSnapshot(snapshotId);
        await loadSnapshots();
      } catch (error) {
        console.error('Failed to delete snapshot:', error);
        alert('Failed to delete snapshot');
      }
    }
  };

  const handleEditSnapshot = (snapshot: Snapshot) => {
    setEditingSnapshot(snapshot);
    setFormData({
      name: snapshot.name || '',
      description: snapshot.description || '',
    });
  };

  const handleUpdateSnapshot = async () => {
    if (!editingSnapshot) return;

    try {
      await storage.updateSnapshotMetadata(editingSnapshot.id, formData.name, formData.description);
      setEditingSnapshot(null);
      await loadSnapshots();
    } catch (error) {
      console.error('Failed to update snapshot:', error);
      alert('Failed to update snapshot');
    }
  };

  const handleSaveSettings = async () => {
    try {
      await storage.updateRoomSettings(
        roomId,
        settingsFormData.max_snapshots,
        settingsFormData.auto_save_interval
      );
      setSettings(settingsFormData);
      setShowSettingsModal(false);
      alert('Settings saved successfully');
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings');
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  if (!isVisible) return null;

  return (
    <div className="snapshots-sidebar-overlay" onClick={onClose}>
      <div className="snapshots-sidebar" onClick={(e) => e.stopPropagation()}>
        <div className="snapshots-sidebar-header">
          <h3>Room Snapshots</h3>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="snapshots-actions">
          <button className="btn btn-primary" onClick={handleSaveClick}>
            💾 Save Snapshot
          </button>
          <button className="btn btn-secondary" onClick={() => setShowSettingsModal(true)}>
            ⚙️ Settings
          </button>
        </div>

        <div className="snapshots-info">
          <small>
            {snapshots.length} / {settings.max_snapshots} snapshots
          </small>
        </div>

        <div className="snapshots-list">
          {loading && snapshots.length === 0 ? (
            <div className="snapshots-loading">Loading snapshots...</div>
          ) : snapshots.length === 0 ? (
            <div className="snapshots-empty">
              <p>No snapshots yet</p>
              <small>Click "Save Snapshot" to create your first snapshot</small>
            </div>
          ) : (
            <div className="snapshots-grid">
              {snapshots.map((snapshot) => (
                <div key={snapshot.id} className="snapshot-card">
                  {snapshot.thumbnail && (
                    <div className="snapshot-thumbnail">
                      <img src={snapshot.thumbnail} alt={snapshot.name || 'Snapshot'} />
                    </div>
                  )}
                  <div className="snapshot-info">
                    <div className="snapshot-name">
                      {snapshot.name || 'Unnamed Snapshot'}
                    </div>
                    {snapshot.description && (
                      <div className="snapshot-description">{snapshot.description}</div>
                    )}
                    <div className="snapshot-meta">
                      <small>{formatDate(snapshot.created_at)}</small>
                      {snapshot.created_by && <small>by {snapshot.created_by}</small>}
                    </div>
                  </div>
                  <div className="snapshot-actions">
                    <button
                      className="btn-icon"
                      onClick={() => handleLoadSnapshot(snapshot)}
                      title="Load snapshot"
                    >
                      📂
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => handleEditSnapshot(snapshot)}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn-icon btn-danger"
                      onClick={() => handleDeleteSnapshot(snapshot.id)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Save Modal */}
        {showSaveModal && (
          <div className="modal-overlay" onClick={() => setShowSaveModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Save Snapshot</h3>
              <p>This will save the current state of the room.</p>
              <button className="btn btn-primary" onClick={handleSaveSnapshot}>
                Save
              </button>
              <button className="btn btn-secondary" onClick={() => setShowSaveModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editingSnapshot && (
          <div className="modal-overlay" onClick={() => setEditingSnapshot(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Edit Snapshot</h3>
              <div className="form-group">
                <label>Name:</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Snapshot name"
                />
              </div>
              <div className="form-group">
                <label>Description:</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Snapshot description"
                  rows={3}
                />
              </div>
              <div className="modal-actions">
                <button className="btn btn-primary" onClick={handleUpdateSnapshot}>
                  Save
                </button>
                <button className="btn btn-secondary" onClick={() => setEditingSnapshot(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Settings Modal */}
        {showSettingsModal && (
          <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Room Settings</h3>
              <div className="form-group">
                <label>Max Snapshots: {settingsFormData.max_snapshots}</label>
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={settingsFormData.max_snapshots}
                  onChange={(e) =>
                    setSettingsFormData({
                      ...settingsFormData,
                      max_snapshots: parseInt(e.target.value),
                    })
                  }
                />
                <small>Oldest snapshots will be automatically deleted when limit is reached</small>
              </div>
              <div className="form-group">
                <label>Auto-save Interval: {settingsFormData.auto_save_interval}s</label>
                <input
                  type="range"
                  min="60"
                  max="1800"
                  step="60"
                  value={settingsFormData.auto_save_interval}
                  onChange={(e) =>
                    setSettingsFormData({
                      ...settingsFormData,
                      auto_save_interval: parseInt(e.target.value),
                    })
                  }
                />
                <small>{Math.floor(settingsFormData.auto_save_interval / 60)} minutes</small>
              </div>
              <div className="modal-actions">
                <button className="btn btn-primary" onClick={handleSaveSettings}>
                  Save Settings
                </button>
                <button className="btn btn-secondary" onClick={() => setShowSettingsModal(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

