import { useState } from 'react';
import { getServerConfig, saveServerConfig, ServerConfig } from '../lib/api';
import './ConnectionDialog.css';

interface ConnectionDialogProps {
  onConnect: (config: ServerConfig) => void;
  onClose: () => void;
}

export function ConnectionDialog({ onConnect, onClose }: ConnectionDialogProps) {
  const [serverUrl, setServerUrl] = useState(() => getServerConfig().url);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const config: ServerConfig = {
        url: serverUrl,
        enabled: true,
      };
      saveServerConfig(config);
      onConnect(config);
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

  return (
    <div className="connection-dialog-overlay">
      <div className="connection-dialog">
        <h2>Excalidraw</h2>
        <p>Connect to a collaboration server or work offline</p>
        
        <div className="input-group">
          <label htmlFor="server-url">Server URL:</label>
          <input
            id="server-url"
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://localhost:3002"
            disabled={isConnecting}
          />
        </div>

        <div className="button-group">
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
        </div>
      </div>
    </div>
  );
}

