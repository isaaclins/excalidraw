import { Excalidraw, MainMenu } from '@excalidraw/excalidraw';
import { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types/types';
import { useEffect, useRef, useState } from 'react';
import { ExcalidrawAPI, ServerConfig } from '../lib/api';
import { localStorage as localStorageAPI } from '../lib/storage';
import '@excalidraw/excalidraw/index.css';

interface ExcalidrawWrapperProps {
  serverConfig: ServerConfig;
  onOpenSettings: () => void;
}

export function ExcalidrawWrapper({ serverConfig, onOpenSettings }: ExcalidrawWrapperProps) {
  const excalidrawRef = useRef<ExcalidrawImperativeAPI>(null);
  const [api, setApi] = useState<ExcalidrawAPI | null>(null);
  const [currentDrawingId, setCurrentDrawingId] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const excalidrawAPI = new ExcalidrawAPI(serverConfig);
    setApi(excalidrawAPI);

    // If server is enabled, prompt for room ID
    if (serverConfig.enabled) {
      const roomId = prompt('Enter room ID for collaboration (or leave blank for new room):') || generateRoomId();
      excalidrawAPI.connectToCollaboration(roomId).then(() => {
        const collab = excalidrawAPI.getCollaborationClient();
        if (collab) {
          setupCollaboration(collab);
        }
      }).catch((error) => {
        console.error('Failed to connect to collaboration:', error);
        alert('Failed to connect to collaboration server. Working in local mode.');
      });
    }

    return () => {
      excalidrawAPI.disconnect();
    };
  }, [serverConfig]);

  const setupCollaboration = (collab: any) => {
    collab.onBroadcast((data: any) => {
      if (excalidrawRef.current && data) {
        excalidrawRef.current.updateScene(data);
      }
    });

    collab.onRoomUserChange((users: string[]) => {
      console.log('Users in room:', users);
    });

    collab.onFirstInRoom(() => {
      console.log('First in room, loading local state if any');
    });

    collab.onNewUser((userId: string) => {
      console.log('New user joined:', userId);
      // Broadcast current state to new user
      if (excalidrawRef.current) {
        const elements = excalidrawRef.current.getSceneElements();
        const appState = excalidrawRef.current.getAppState();
        collab.broadcast({ elements, appState }, false);
      }
    });
  };

  const generateRoomId = () => {
    return Math.random().toString(36).substring(2, 15);
  };

  const handleChange = (elements: readonly any[], appState: any) => {
    // Auto-save locally
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const data = JSON.stringify({
        elements,
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor,
          gridSize: appState.gridSize,
        },
      });

      if (currentDrawingId) {
        localStorageAPI.updateDrawing(currentDrawingId, 'Untitled', data).catch(console.error);
      } else {
        localStorageAPI.saveDrawing('Untitled', data).then((id) => {
          setCurrentDrawingId(id);
        }).catch(console.error);
      }
    }, 1000);

    // Broadcast changes if collaboration is enabled
    if (api?.isEnabled() && api.getCollaborationClient()?.isConnected()) {
      api.getCollaborationClient()?.broadcast({ elements, appState }, true);
    }
  };

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      <Excalidraw
        ref={excalidrawRef}
        onChange={handleChange}
        theme="light"
      >
        <MainMenu>
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.SaveToActiveFile />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.Separator />
          <MainMenu.Item onSelect={onOpenSettings}>
            🔌 Server Settings
          </MainMenu.Item>
          <MainMenu.Separator />
          <MainMenu.DefaultItems.Help />
          <MainMenu.DefaultItems.ClearCanvas />
        </MainMenu>
      </Excalidraw>
    </div>
  );
}

