import { Excalidraw, MainMenu } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useEffect, useRef, useState } from 'react';
import { ExcalidrawAPI, ServerConfig } from '../lib/api';
import { localStorage as localStorageAPI } from '../lib/storage';
import { RoomsSidebar } from './RoomsSidebar';
import { reconcileElements, BroadcastedExcalidrawElement } from '../lib/reconciliation';
import '@excalidraw/excalidraw/index.css';

interface ExcalidrawWrapperProps {
  serverConfig: ServerConfig;
  onOpenSettings: () => void;
  onRoomIdChange: (roomId: string) => void;
  initialRoomId: string | null;
}

const PRECEDING_ELEMENT_KEY = "::preceding_element_key";

const getSceneVersion = (elements: readonly any[]): number => {
  return elements.reduce((acc, el) => acc + (el.version || 0), 0);
};

export function ExcalidrawWrapper({ serverConfig, onOpenSettings, onRoomIdChange, initialRoomId }: ExcalidrawWrapperProps) {
  const excalidrawRef = useRef<ExcalidrawImperativeAPI>(null);
  const [api, setApi] = useState<ExcalidrawAPI | null>(null);
  const [currentDrawingId, setCurrentDrawingId] = useState<string | null>(null);
  const [showRoomsSidebar, setShowRoomsSidebar] = useState(false);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(initialRoomId);
  const saveTimeoutRef = useRef<number | undefined>(undefined);
  const lastBroadcastedOrReceivedSceneVersion = useRef<number>(-1);
  const broadcastedElementVersions = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const excalidrawAPI = new ExcalidrawAPI(serverConfig);
    setApi(excalidrawAPI);

    // If server is enabled and we have a room ID, connect
    if (serverConfig.enabled && initialRoomId) {
      excalidrawAPI.connectToCollaboration(initialRoomId).then(() => {
        const collab = excalidrawAPI.getCollaborationClient();
        if (collab) {
          setupCollaboration(collab);
        }
      }).catch((error) => {
        console.error('Failed to connect to collaboration:', error);
        alert('Failed to connect to collaboration server. Working in local mode.');
      });
    } else if (serverConfig.enabled && !initialRoomId) {
      // Generate new room ID and notify parent
      const newRoomId = generateRoomId();
      setCurrentRoomId(newRoomId);
      onRoomIdChange(newRoomId);
      
      excalidrawAPI.connectToCollaboration(newRoomId).then(() => {
        const collab = excalidrawAPI.getCollaborationClient();
        if (collab) {
          setupCollaboration(collab);
        }
      }).catch((error) => {
        console.error('Failed to connect to collaboration:', error);
        alert('Failed to connect to collaboration server. Working in local mode.');
      });
    }
    
    // Update current room ID when initialRoomId changes
    if (initialRoomId) {
      setCurrentRoomId(initialRoomId);
    }

    return () => {
      excalidrawAPI.disconnect();
    };
  }, [serverConfig, initialRoomId]);

  const setupCollaboration = (collab: any) => {
    collab.onBroadcast((data: any) => {
      console.log('Collaboration broadcast received:', data);
      if (excalidrawRef.current && data && data.elements) {
        const localElements = excalidrawRef.current.getSceneElementsIncludingDeleted();
        const appState = excalidrawRef.current.getAppState();
        
        // Use proper reconciliation to merge remote elements
        const reconciledElements = reconcileElements(
          localElements,
          data.elements as BroadcastedExcalidrawElement[],
          appState
        );
        
        // Update the scene version BEFORE updating scene to prevent re-broadcasting
        lastBroadcastedOrReceivedSceneVersion.current = getSceneVersion(reconciledElements);
        
        excalidrawRef.current.updateScene({
          elements: reconciledElements,
        });
        
        console.log('Scene reconciled and updated');
      }
    });

    collab.onRoomUserChange((users: string[]) => {
      console.log('Users in room:', users);
      if (excalidrawRef.current) {
        const collaboratorsArray = users
          .filter(u => u !== collab.getSocketId())
          .map(id => [id, { id, username: id.slice(0, 8) }] as [string, any]);
        
        const collaborators = new Map(collaboratorsArray) as any;
        
        excalidrawRef.current.updateScene({
          appState: {
            collaborators,
          },
        });
      }
    });

    collab.onFirstInRoom(() => {
      console.log('First in room, loading local state if any');
    });

    collab.onNewUser((userId: string) => {
      console.log('New user joined:', userId);
      // Broadcast current full state to new user (INIT message)
      if (excalidrawRef.current) {
        const elements = excalidrawRef.current.getSceneElementsIncludingDeleted();
        broadcastScene(collab, elements, true); // syncAll = true for new users
      }
    });
  };
  
  const broadcastScene = (collab: any, allElements: readonly any[], syncAll: boolean = false) => {
    // Filter elements that need to be sent
    const filteredElements = allElements.filter((element: any) => {
      return (
        syncAll ||
        !broadcastedElementVersions.current.has(element.id) ||
        element.version > (broadcastedElementVersions.current.get(element.id) || 0)
      );
    });
    
    // Add z-index information for proper element ordering
    const elementsToSend: BroadcastedExcalidrawElement[] = filteredElements
      .map((element: any, idx: number, arr: any[]) => ({
        ...element,
        [PRECEDING_ELEMENT_KEY]: idx === 0 ? "^" : arr[idx - 1]?.id,
      }));
    
    if (elementsToSend.length > 0) {
      // Update broadcasted versions
      for (const element of elementsToSend) {
        broadcastedElementVersions.current.set(element.id, element.version);
      }
      
      collab.broadcast({
        elements: elementsToSend,
      }, false); // non-volatile for full scene updates
      
      console.log('Broadcasted scene:', { elementCount: elementsToSend.length, syncAll });
    }
  };

  const generateRoomId = () => {
    return Math.random().toString(36).substring(2, 15);
  };

  const handleJoinRoom = (roomId: string) => {
    if (api && serverConfig.enabled) {
      // Disconnect from current room
      api.disconnect();
      
      // Update room ID
      setCurrentRoomId(roomId);
      onRoomIdChange(roomId);
      
      // Reconnect to new room
      const newApi = new ExcalidrawAPI(serverConfig);
      setApi(newApi);
      
      newApi.connectToCollaboration(roomId).then(() => {
        const collab = newApi.getCollaborationClient();
        if (collab) {
          setupCollaboration(collab);
        }
      }).catch((error) => {
        console.error('Failed to connect to room:', error);
        alert('Failed to connect to room. Please try again.');
      });
    }
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
      const currentVersion = getSceneVersion(elements);
      
      // Only broadcast if this is a new version (not something we just received)
      if (currentVersion > lastBroadcastedOrReceivedSceneVersion.current) {
        broadcastScene(api.getCollaborationClient(), elements, false);
        lastBroadcastedOrReceivedSceneVersion.current = currentVersion;
      }
    }
  };

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      <Excalidraw
        excalidrawAPI={(api) => (excalidrawRef.current = api)}
        onChange={handleChange}
        theme="light"
      >
        <MainMenu>
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.SaveToActiveFile />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.Separator />
          {serverConfig.enabled && currentRoomId && (
            <MainMenu.Item onSelect={() => setShowRoomsSidebar(true)}>
              🚪 Active Rooms
            </MainMenu.Item>
          )}
          <MainMenu.Item onSelect={onOpenSettings}>
            🔌 Server Settings
          </MainMenu.Item>
          <MainMenu.Separator />
          <MainMenu.DefaultItems.Help />
          <MainMenu.DefaultItems.ClearCanvas />
        </MainMenu>
      </Excalidraw>
      
      {serverConfig.enabled && (
        <RoomsSidebar
          serverUrl={serverConfig.url}
          currentRoomId={currentRoomId}
          onJoinRoom={handleJoinRoom}
          isVisible={showRoomsSidebar}
          onClose={() => setShowRoomsSidebar(false)}
        />
      )}
    </div>
  );
}

