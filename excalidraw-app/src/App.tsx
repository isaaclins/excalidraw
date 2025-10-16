import { useState, useEffect } from "react";
import { ConnectionDialog } from "./components/ConnectionDialog";
import { ExcalidrawWrapper } from "./components/ExcalidrawWrapper";
import { getServerConfig, ServerConfig } from "./lib/api";
import "./App.css";

function App() {
  const [showDialog, setShowDialog] = useState(true);
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);

  const [roomId, setRoomId] = useState<string | null>(null);

  useEffect(() => {
    // Check if we have a saved config in localStorage
    const saved = localStorage.getItem('excalidraw-server-config');
    if (saved) {
      // User has made a choice before, skip dialog
      const config = getServerConfig();
      setServerConfig(config);
      setShowDialog(false);
    }

    // Add keyboard shortcut to open connection dialog (Cmd/Ctrl + K)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowDialog(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleConnect = (config: ServerConfig, newRoomId?: string) => {
    setServerConfig(config);
    if (newRoomId) {
      setRoomId(newRoomId);
    }
    setShowDialog(false);
  };

  if (!serverConfig) {
    return (
      <ConnectionDialog 
        onConnect={handleConnect} 
        onClose={() => setShowDialog(false)}
        isConnected={false}
      />
    );
  }

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
          onConnect={handleConnect} 
          onClose={() => setShowDialog(false)}
          currentRoomId={roomId || undefined}
          isConnected={serverConfig.enabled && !!roomId}
        />
      )}
    </>
  );
}

export default App;
