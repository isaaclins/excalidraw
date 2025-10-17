import { useState, useEffect } from "react";
import { ConnectionDialog } from "./components/ConnectionDialog";
import { ExcalidrawWrapper } from "./components/ExcalidrawWrapper";
import { getServerConfig, ServerConfig } from "./lib/api";
import "./App.css";

function App() {
  // Initialize state from localStorage to avoid setState in useEffect
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(() => {
    const saved = localStorage.getItem('excalidraw-server-config');
    if (saved) {
      try {
        return JSON.parse(saved) as ServerConfig;
      } catch {
        return null;
      }
    }
    return null;
  });
  const [showDialog, setShowDialog] = useState(() => {
    const saved = localStorage.getItem('excalidraw-server-config');
    return !saved; // Show dialog only if no saved config
  });

  const [roomId, setRoomId] = useState<string | null>(null);

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
