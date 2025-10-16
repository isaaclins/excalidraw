import { useState, useEffect } from "react";
import { ConnectionDialog } from "./components/ConnectionDialog";
import { ExcalidrawWrapper } from "./components/ExcalidrawWrapper";
import { getServerConfig, ServerConfig } from "./lib/api";
import "./App.css";

function App() {
  const [showDialog, setShowDialog] = useState(true);
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);

  useEffect(() => {
    // Check if we have a saved config
    const config = getServerConfig();
    if (config.enabled !== undefined) {
      // User has made a choice before, skip dialog
      setServerConfig(config);
      setShowDialog(false);
    }
  }, []);

  const handleConnect = (config: ServerConfig) => {
    setServerConfig(config);
    setShowDialog(false);
  };

  if (showDialog || !serverConfig) {
    return <ConnectionDialog onConnect={handleConnect} onClose={() => setShowDialog(false)} />;
  }

  return <ExcalidrawWrapper serverConfig={serverConfig} />;
}

export default App;
