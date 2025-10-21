import { useState, useEffect } from "react";
import { ConnectionDialog } from "./components/ConnectionDialog";
import { ExcalidrawWrapper } from "./components/ExcalidrawWrapper";
import { ServerConfig, getServerConfig, saveServerConfig } from "./lib/api";
import "./App.css";

function App() {
  const [serverConfig, setServerConfig] = useState<ServerConfig>(() => getServerConfig());
  const [username, setUsername] = useState(() => localStorage.getItem('excalidraw-username') ?? '');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(() => {
    const hasServerConfig = localStorage.getItem('excalidraw-server-config');
    const hasUsername = localStorage.getItem('excalidraw-username');
    return !hasServerConfig || !hasUsername;
  });

  useEffect(() => {

    // Add keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to open connection dialog
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowDialog(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    localStorage.setItem('excalidraw-username', username);
  }, [username]);

  const applyServerConfig = (config: ServerConfig) => {
    setServerConfig(config);
    saveServerConfig(config);
    if (!config.enabled) {
      setRoomId(null);
    }
  };

  const handleServerConfigChange = (config: ServerConfig) => {
    applyServerConfig(config);
  };

  const handleRoomSelection = (selectedRoomId: string, serverUrl: string) => {
    applyServerConfig({ url: serverUrl, enabled: true });
    setRoomId(selectedRoomId);
    setShowDialog(false);
  };

  const handleDisconnect = (serverUrl: string) => {
    applyServerConfig({ url: serverUrl, enabled: false });
  };

  return (
    <>
      <ExcalidrawWrapper 
        serverConfig={serverConfig} 
        onOpenSettings={() => setShowDialog(true)}
        onRoomIdChange={setRoomId}
        initialRoomId={roomId}
      />
      {showDialog && (
        <ConnectionDialog 
          serverConfig={serverConfig}
          username={username}
          onUsernameChange={setUsername}
          onServerConfigChange={handleServerConfigChange}
          onSelectRoom={handleRoomSelection}
          onDisconnect={handleDisconnect}
          onClose={() => setShowDialog(false)}
          currentRoomId={roomId || undefined}
        />
      )}
    </>
  );
}

export default App;
