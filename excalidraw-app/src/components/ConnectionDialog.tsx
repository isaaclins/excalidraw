import { useState } from 'react';
import { getServerConfig, saveServerConfig, ServerConfig } from '../lib/api';
import './ConnectionDialog.css';

interface ConnectionDialogProps {
  onConnect: (config: ServerConfig, roomId?: string) => void;
  onClose: () => void;
  currentRoomId?: string;
  isConnected?: boolean;
}

export function ConnectionDialog({ onConnect, onClose, currentRoomId, isConnected }: ConnectionDialogProps) {
  const [serverUrl, setServerUrl] = useState(() => getServerConfig().url);
  const [roomId, setRoomId] = useState(currentRoomId || '');
  const [isConnecting, setIsConnecting] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const config: ServerConfig = {
        url: serverUrl,
        enabled: true,
      };
      saveServerConfig(config);
      onConnect(config, roomId || undefined);
    } catch (error) {
      console.error('Failed to connect:', error);
      alert('Failed to connect to server');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleOffline = () => {
    const config: ServerConfig = {
      url: serverUrl,
      enabled: false,
    };
    saveServerConfig(config);
    onConnect(config);
  };

  const copyRoomId = async () => {
    if (currentRoomId) {
      await navigator.clipboard.writeText(currentRoomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="connection-dialog-overlay" onClick={onClose}>
      <div className="connection-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Server Settings</h2>
        <p>Connect to a collaboration server or work offline</p>
        
        {isConnected && currentRoomId && (
          <div className="room-info">
            <div className="room-id-display">
              <label>Current Room ID:</label>
              <div className="room-id-box">
                <code>{currentRoomId}</code>
                <button 
                  onClick={copyRoomId}
                  className="btn-copy"
                  title="Copy room ID"
                >
                  {copied ? '✓ Copied!' : '📋 Copy'}
                </button>
              </div>
              <small>Share this ID with friends to collaborate</small>
            </div>
          </div>
        )}
        
        <div className="input-group">
          <label htmlFor="server-url">Server URL:</label>
          <input
            id="server-url"
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://localhost:3002"
            disabled={isConnecting || isConnected}
          />
        </div>

        <div className="input-group">
          <label htmlFor="room-id">
            {isConnected ? 'Switch to Room ID:' : 'Room ID (leave blank for new room):'}
          </label>
          <input
            id="room-id"
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder={isConnected ? 'Enter room ID to switch' : 'Enter room ID or leave blank'}
            disabled={isConnecting}
          />
        </div>

        <div className="button-group">
          {!isConnected ? (
            <>
              <button
                onClick={handleConnect}
                disabled={isConnecting || !serverUrl}
                className="btn-primary"
              >
                {isConnecting ? 'Connecting...' : 'Connect to Server'}
              </button>
              <button
                onClick={handleOffline}
                disabled={isConnecting}
                className="btn-secondary"
              >
                Work Offline
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleConnect}
                disabled={isConnecting || !roomId || roomId === currentRoomId}
                className="btn-primary"
              >
                Switch Room
              </button>
              <button
                onClick={onClose}
                className="btn-secondary"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

