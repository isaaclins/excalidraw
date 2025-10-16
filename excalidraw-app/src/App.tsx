import { useState, useEffect } from "react";
import { ConnectionDialog } from "./components/ConnectionDialog";
import { ExcalidrawWrapper } from "./components/ExcalidrawWrapper";
import { getServerConfig, ServerConfig } from "./lib/api";
import "./App.css";

function App() {
  const [showDialog, setShowDialog] = useState(true);
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);

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

  const handleConnect = (config: ServerConfig) => {
    setServerConfig(config);
    setShowDialog(false);
  };

  if (!serverConfig) {
    return <ConnectionDialog onConnect={handleConnect} onClose={() => setShowDialog(false)} />;
  }

  return (
    <>
      <ExcalidrawWrapper 
        serverConfig={serverConfig} 
        onOpenSettings={() => setShowDialog(true)}
      />
      {showDialog && (
        <ConnectionDialog 
          onConnect={handleConnect} 
          onClose={() => setShowDialog(false)} 
        />
      )}
    </>
  );
}

export default App;
