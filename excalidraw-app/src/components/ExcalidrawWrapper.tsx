import { Excalidraw, MainMenu, exportToBlob } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useEffect, useRef, useState, useCallback } from 'react';
import { ExcalidrawAPI, ServerConfig } from '../lib/api';
import { localStorage as localStorageAPI, ServerStorage, Snapshot } from '../lib/storage';
import { RoomsSidebar } from './RoomsSidebar';
import { SnapshotsSidebar } from './SnapshotsSidebar';
import { AutoSnapshotManager } from '../lib/autoSnapshot';
import { reconcileElements, BroadcastedExcalidrawElement } from '../lib/reconciliation';
import '@excalidraw/excalidraw/index.css';

// Use any for elements to avoid type issues with Excalidraw's internal types
/* eslint-disable @typescript-eslint/no-explicit-any */
type ExcalidrawElement = any;
type AppState = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

interface ExcalidrawWrapperProps {
  serverConfig: ServerConfig;
  onOpenSettings: () => void;
  onRoomIdChange: (roomId: string) => void;
  initialRoomId: string | null;
}

const PRECEDING_ELEMENT_KEY = "::preceding_element_key";

const getSceneVersion = (elements: readonly ExcalidrawElement[]): number => {
  return elements.reduce((acc, el) => acc + (el.version || 0), 0);
};

export function ExcalidrawWrapper({ serverConfig, onOpenSettings, onRoomIdChange, initialRoomId }: ExcalidrawWrapperProps) {
  const excalidrawRef = useRef<ExcalidrawImperativeAPI>(null);
  const [api, setApi] = useState<ExcalidrawAPI | null>(null);
  const [currentDrawingId, setCurrentDrawingId] = useState<string | null>(null);
  const [showRoomsSidebar, setShowRoomsSidebar] = useState(false);
  const [showSnapshotsSidebar, setShowSnapshotsSidebar] = useState(false);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(initialRoomId);
  const saveTimeoutRef = useRef<number | undefined>(undefined);
  const lastBroadcastedOrReceivedSceneVersion = useRef<number>(-1);
  const broadcastedElementVersions = useRef<Map<string, number>>(new Map());
  const autoSnapshotManager = useRef<AutoSnapshotManager | null>(null);
  const [snapshotStorage, setSnapshotStorage] = useState<typeof localStorageAPI | ServerStorage>(localStorageAPI);
  const lastBroadcastTime = useRef<number>(0);
  const broadcastThrottleMs = 50; // Throttle broadcasts to max 20 per second
  const isApplyingRemoteUpdate = useRef<boolean>(false);

  const generateRoomId = () => {
    return Math.random().toString(36).substring(2, 15);
  };

  const broadcastScene = (collab: ReturnType<ExcalidrawAPI['getCollaborationClient']>, allElements: readonly ExcalidrawElement[], syncAll: boolean = false) => {
    if (!collab) return;
    // Filter elements that need to be sent
    const filteredElements = allElements.filter((element) => {
      return (
        syncAll ||
        !broadcastedElementVersions.current.has(element.id) ||
        element.version > (broadcastedElementVersions.current.get(element.id) || 0)
      );
    });
    
    // Add z-index information for proper element ordering
    const elementsToSend: BroadcastedExcalidrawElement[] = filteredElements
      .map((element, idx, arr) => ({
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

  const setupCollaboration = useCallback((collab: ReturnType<ExcalidrawAPI['getCollaborationClient']>) => {
    if (!collab) return;
    
    collab.onBroadcast((data: { elements?: BroadcastedExcalidrawElement[] }) => {
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
        
        // Set flag to prevent re-broadcasting this update
        isApplyingRemoteUpdate.current = true;
        
        // Update scene
        excalidrawRef.current.updateScene({
          elements: reconciledElements,
        });
        
        // Clear flag after a short delay to allow onChange to process
        setTimeout(() => {
          isApplyingRemoteUpdate.current = false;
        }, 100);
        
        console.log('Scene reconciled and updated');
      }
    });

    collab.onRoomUserChange((users: string[]) => {
      console.log('Users in room:', users);
      if (excalidrawRef.current) {
        const collaboratorsArray = users
          .filter(u => u !== collab.getSocketId())
          .map(id => [id, { id, username: id.slice(0, 8) }] as const);
        
        const collaborators = new Map(collaboratorsArray);
        
        excalidrawRef.current.updateScene({
          appState: {
            collaborators,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
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
  }, []);

  // This effect sets up external API and storage instances - legitimate use of setState in effect
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const excalidrawAPI = new ExcalidrawAPI(serverConfig);
    setApi(excalidrawAPI);

    // Set up snapshot storage based on server config
    const storage = serverConfig.enabled 
      ? new ServerStorage(serverConfig.url)
      : localStorageAPI;
    setSnapshotStorage(storage);

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
    } else if (!serverConfig.enabled) {
      // Generate local room ID for offline mode (for snapshots)
      const localRoomId = initialRoomId || generateRoomId();
      setCurrentRoomId(localRoomId);
      if (!initialRoomId) {
        onRoomIdChange(localRoomId);
      }
    }
    
    // Update current room ID when initialRoomId changes
    if (initialRoomId) {
      setCurrentRoomId(initialRoomId);
    }

    return () => {
      excalidrawAPI.disconnect();
      if (autoSnapshotManager.current) {
        autoSnapshotManager.current.stop();
      }
    };
  }, [serverConfig, initialRoomId, onRoomIdChange, setupCollaboration]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Initialize auto-snapshot manager when room is ready
  useEffect(() => {
    if (!currentRoomId || autoSnapshotManager.current) return;

    const initAutoSnapshot = async () => {
      try {
        const settings = await snapshotStorage.getRoomSettings(currentRoomId);
        
        autoSnapshotManager.current = new AutoSnapshotManager({
          roomId: currentRoomId,
          enabled: true,
          settings,
          onSave: async (roomId, data, thumbnail) => {
            await snapshotStorage.saveSnapshot(
              roomId,
              data,
              `Auto-save ${new Date().toLocaleString()}`,
              'Automatic snapshot',
              thumbnail
            );
          },
          getData: () => {
            if (!excalidrawRef.current) return '';
            const elements = excalidrawRef.current.getSceneElements();
            const appState = excalidrawRef.current.getAppState();
            return JSON.stringify({
              elements,
              appState: {
                viewBackgroundColor: appState.viewBackgroundColor,
                gridSize: appState.gridSize,
              },
            });
          },
          getThumbnail: async () => {
            if (!excalidrawRef.current) return '';
            try {
              const elements = excalidrawRef.current.getSceneElements();
              const appState = excalidrawRef.current.getAppState();
              const blob = await exportToBlob({
                elements,
                appState,
                files: null,
                exportPadding: 10,
              });
              return new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
            } catch (error) {
              console.error('Failed to generate thumbnail:', error);
              return '';
            }
          },
        });

        autoSnapshotManager.current.start();
      } catch (error) {
        console.error('Failed to initialize auto-snapshot:', error);
      }
    };

    initAutoSnapshot();

    return () => {
      if (autoSnapshotManager.current) {
        autoSnapshotManager.current.stop();
        autoSnapshotManager.current = null;
      }
    };
  }, [currentRoomId, snapshotStorage]);

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

  const handleChange = (elements: readonly ExcalidrawElement[], appState: AppState) => {
    // Track changes for auto-snapshot
    if (autoSnapshotManager.current) {
      autoSnapshotManager.current.trackChange();
    }

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
      // Don't broadcast if we're applying a remote update
      if (isApplyingRemoteUpdate.current) {
        return;
      }

      const currentVersion = getSceneVersion(elements);
      const now = Date.now();
      
      // Only broadcast if this is a new version
      // AND we haven't broadcast too recently (throttle)
      if (currentVersion > lastBroadcastedOrReceivedSceneVersion.current &&
          (now - lastBroadcastTime.current) >= broadcastThrottleMs) {
        broadcastScene(api.getCollaborationClient(), elements, false);
        lastBroadcastedOrReceivedSceneVersion.current = currentVersion;
        lastBroadcastTime.current = now;
      }
    }
  };

  const handleSaveSnapshot = async () => {
    if (!excalidrawRef.current || !currentRoomId) return;

    try {
      const elements = excalidrawRef.current.getSceneElements();
      const appState = excalidrawRef.current.getAppState();
      const data = JSON.stringify({
        elements,
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor,
          gridSize: appState.gridSize,
        },
      });

      const blob = await exportToBlob({
        elements,
        appState,
        files: null,
        exportPadding: 10,
      });

      const thumbnail = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      await snapshotStorage.saveSnapshot(
        currentRoomId,
        data,
        `Snapshot ${new Date().toLocaleString()}`,
        'Manual snapshot',
        thumbnail
      );

      console.log('Snapshot saved successfully');
    } catch (error) {
      console.error('Failed to save snapshot:', error);
      throw error;
    }
  };

  const handleLoadSnapshot = (snapshot: Snapshot) => {
    if (!excalidrawRef.current) {
      alert('Excalidraw not ready');
      return;
    }

    if (!snapshot.data) {
      console.error('Snapshot data is missing:', snapshot);
      alert('Snapshot data is missing');
      return;
    }

    try {
      console.log('Loading snapshot:', snapshot.id);
      const sceneData = JSON.parse(snapshot.data);
      
      if (!sceneData.elements || !Array.isArray(sceneData.elements)) {
        console.error('Invalid snapshot data structure:', sceneData);
        alert('Invalid snapshot data structure');
        return;
      }

      excalidrawRef.current.updateScene({
        elements: sceneData.elements,
        appState: sceneData.appState || {},
      });
      console.log('Snapshot loaded successfully');
    } catch (error) {
      console.error('Failed to load snapshot:', error);
      alert(`Failed to load snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      <Excalidraw
        excalidrawAPI={(api) => (excalidrawRef.current = api)}
        onChange={handleChange}
        theme="light"
        initialData={{
          elements: [],
          appState: {
            viewBackgroundColor: '#ffffff',
            currentItemStrokeColor: '#000000',
            currentItemBackgroundColor: 'transparent',
            currentItemFillStyle: 'solid',
            currentItemStrokeWidth: 2,
            currentItemRoughness: 1,
            currentItemOpacity: 100,
            currentItemFontFamily: 1,
            currentItemFontSize: 20,
            currentItemTextAlign: 'left',
            currentItemStrokeStyle: 'solid',
            currentItemRoundness: 'sharp',
          },
          scrollToContent: true,
        }}
      >
        <MainMenu>
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.SaveToActiveFile />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.Separator />
          {currentRoomId && (
            <MainMenu.Item onSelect={() => setShowSnapshotsSidebar(true)}>
              📸 Snapshots
            </MainMenu.Item>
          )}
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
      
      {currentRoomId && (
        <SnapshotsSidebar
          roomId={currentRoomId}
          storage={snapshotStorage}
          isVisible={showSnapshotsSidebar}
          onClose={() => setShowSnapshotsSidebar(false)}
          onLoadSnapshot={handleLoadSnapshot}
          onSaveSnapshot={handleSaveSnapshot}
        />
      )}
    </div>
  );
}

