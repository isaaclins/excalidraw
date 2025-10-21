import { useCallback, useEffect, useMemo, useState } from 'react';
import { ServerConfig } from '../lib/api';
import './ConnectionDialog.css';

interface RoomSummary {
  id: string;
  users: number;
}

interface ConnectionDialogProps {
  serverConfig: ServerConfig;
  username: string;
  onUsernameChange: (username: string) => void;
  onServerConfigChange: (config: ServerConfig) => void;
  onSelectRoom: (roomId: string, serverUrl: string) => void;
  onDisconnect: (serverUrl: string) => void;
  onClose: () => void;
  currentRoomId?: string;
}

const normalizeUrl = (value: string): string => {
  if (!value) return '';
  return value.replace(/\s+/g, '').replace(/\/+$/, '');
};

const createRoomIdFromUsername = (username: string): string => {
  const base = username.trim() || 'Guest';
  const sanitized = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'guest';
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${sanitized}-s-room-${suffix}`;
};

export function ConnectionDialog({
  serverConfig,
  username,
  onUsernameChange,
  onServerConfigChange,
  onSelectRoom,
  onDisconnect,
  onClose,
  currentRoomId,
}: ConnectionDialogProps) {
  const storedUrl = useMemo(() => normalizeUrl(serverConfig.url), [serverConfig.url]);
  const [serverUrlInput, setServerUrlInput] = useState('');
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [isFetchingRooms, setIsFetchingRooms] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [lastFetchedUrl, setLastFetchedUrl] = useState<string>('');

  const normalizedInputUrl = useMemo(() => normalizeUrl(serverUrlInput), [serverUrlInput]);
  const effectiveServerUrl = normalizedInputUrl || storedUrl;
  const hasEffectiveServerUrl = effectiveServerUrl.length > 0;
  const usernameTrimmed = username.trim();
  const activeRoomId = serverConfig.enabled ? currentRoomId ?? null : null;

  useEffect(() => {
    setServerUrlInput('');
  }, [storedUrl]);

  const fetchRooms = useCallback(async (
    targetUrl: string,
    options: { updateConfig: boolean; silent?: boolean } = { updateConfig: false }
  ) => {
    const { updateConfig, silent } = options;
    if (!silent) {
      setIsFetchingRooms(true);
    }
    setRoomsError(null);

    try {
      const response = await fetch(`${targetUrl}/api/rooms`);
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const data = (await response.json()) as Record<string, number>;
      const list: RoomSummary[] = Object.entries(data).map(([id, users]) => ({
        id,
        users,
      }));

      setRooms(list);
      setLastFetchedUrl(targetUrl);

      if (updateConfig) {
        const staysEnabled = serverConfig.enabled && storedUrl === targetUrl;
        onServerConfigChange({ url: targetUrl, enabled: staysEnabled });
      }
    } catch (error) {
      console.error('Failed to load rooms:', error);
      setRooms([]);
      setRoomsError('Unable to load rooms from the collaboration server.');
    } finally {
      if (!options.silent) {
        setIsFetchingRooms(false);
      }
    }
  }, [onServerConfigChange, serverConfig.enabled, storedUrl]);

  useEffect(() => {
    if (!storedUrl) {
      setRooms([]);
      setLastFetchedUrl('');
      return;
    }
    void fetchRooms(storedUrl, { updateConfig: false, silent: true });
  }, [storedUrl, fetchRooms]);

  const handleConnectClick = async () => {
    if (!hasEffectiveServerUrl) {
      setRoomsError('Enter a server URL to connect.');
      return;
    }
    await fetchRooms(effectiveServerUrl, { updateConfig: true });
  };

  const handleDisconnectClick = () => {
    const targetUrl = storedUrl || effectiveServerUrl;
    if (targetUrl) {
      onDisconnect(targetUrl);
    }
    setRooms([]);
    setRoomsError(null);
    setLastFetchedUrl('');
  };

  const resolvedServerUrl = useMemo(() => {
    return lastFetchedUrl || storedUrl || effectiveServerUrl;
  }, [lastFetchedUrl, storedUrl, effectiveServerUrl]);

  const isConnectedToRoom = Boolean(serverConfig.enabled && currentRoomId);

  const toggleButtonLabel = isConnectedToRoom
    ? 'Disconnect'
    : isFetchingRooms
    ? 'Connecting…'
    : 'Connect';

  const toggleButtonDisabled = isConnectedToRoom
    ? false
    : !hasEffectiveServerUrl || isFetchingRooms;

  const handleToggleClick = () => {
    if (isConnectedToRoom) {
      handleDisconnectClick();
    } else {
      void handleConnectClick();
    }
  };

  const handleRoomSelection = (roomId: string) => {
    if (!resolvedServerUrl) {
      setRoomsError('Connect to a server before selecting a room.');
      return;
    }
    onSelectRoom(roomId, resolvedServerUrl);
  };

  const handleCreateRoom = () => {
    if (!resolvedServerUrl) {
      setRoomsError('Connect to a server before creating a room.');
      return;
    }
    const newRoomId = createRoomIdFromUsername(usernameTrimmed);
    onSelectRoom(newRoomId, resolvedServerUrl);
  };

  return (
    <div className="connection-dialog-overlay" onClick={onClose}>
      <div className="connection-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Server Settings</h2>
        <p>Connect to a collaboration server or work offline</p>

        {isConnectedToRoom && currentRoomId && (
          <div className="room-info">
            <div className="room-id-display">
              <label>Current Room ID:</label>
              <div className="room-id-box">
                <code>{currentRoomId}</code>
              </div>
              <small>Share this ID with collaborators or pick another room below.</small>
            </div>
          </div>
        )}

        <div className="input-group">
          <label htmlFor="username">Username:</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(event) => onUsernameChange(event.target.value)}
            placeholder="Choose a display name"
          />
        </div>

        <div className="input-group">
          <label htmlFor="server-url">Server URL:</label>
          <input
            id="server-url"
            type="text"
            value={serverUrlInput}
            onChange={(event) => setServerUrlInput(event.target.value)}
            disabled={isFetchingRooms}
          />
          {serverUrlInput.trim() === '' && storedUrl && (
            <small className="input-hint">Currently using: {storedUrl}</small>
          )}
        </div>

        <div className="button-group">
          <button
            onClick={handleToggleClick}
            disabled={toggleButtonDisabled}
            className={isConnectedToRoom ? 'btn-secondary' : 'btn-primary'}
          >
            {toggleButtonLabel}
          </button>
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>

        <div className="rooms-section">
          <div className="rooms-section-header">
            <h3>Rooms on this server</h3>
            <button
              className="rooms-refresh"
              onClick={() => {
                if (!resolvedServerUrl) {
                  setRoomsError('Connect to a server to refresh rooms.');
                  return;
                }
                void fetchRooms(resolvedServerUrl, { updateConfig: false });
              }}
              disabled={!resolvedServerUrl || isFetchingRooms}
            >
              Refresh
            </button>
          </div>

          {roomsError && <div className="rooms-error">{roomsError}</div>}

          {isFetchingRooms && rooms.length === 0 ? (
            <div className="rooms-loading">Loading rooms…</div>
          ) : rooms.length === 0 ? (
            <div className="rooms-empty">No active rooms yet.</div>
          ) : (
            <div className="rooms-list">
              {rooms.map((room) => {
                const isCurrent = activeRoomId === room.id;
                return (
                  <button
                    key={room.id}
                    className={`rooms-list-item ${isCurrent ? 'current' : ''}`}
                    onClick={() => handleRoomSelection(room.id)}
                  >
                    <span className="room-name">{room.id}</span>
                    <span className="room-users">👥 {room.users}</span>
                    {isCurrent && <span className="room-status">Current</span>}
                  </button>
                );
              })}
            </div>
          )}

          <div className="create-room">
            <span className="create-room-label">or create a new room</span>
            <button
              className="btn-primary create-room-button"
              onClick={handleCreateRoom}
              disabled={!resolvedServerUrl}
            >
              Create “{usernameTrimmed || 'Guest'}'s Room”
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

