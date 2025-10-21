import { Excalidraw, MainMenu, exportToBlob } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useEffect, useRef, useState, useCallback } from 'react';
import { ExcalidrawAPI, ServerConfig } from '../lib/api';
import { localStorage as localStorageAPI, ServerStorage, Snapshot } from '../lib/storage';
import { RoomsSidebar } from './RoomsSidebar';
import { SnapshotsSidebar } from './SnapshotsSidebar';
import { ChatPanel } from './ChatPanel';
import { AutoSnapshotManager } from '../lib/autoSnapshot';
import { reconcileElements, BroadcastedExcalidrawElement } from '../lib/reconciliation';
import { ChatMessage } from '../lib/websocket';
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
const CURSOR_MESSAGE_TYPE = 'cursor-update';
const COLLABORATOR_COLORS = [
  '#ff6b6b',
  '#4ecdc4',
  '#ffe66d',
  '#556270',
  '#c44dff',
  '#45b7d1',
  '#f67280',
  '#6c5ce7',
];
const REMOTE_CURSOR_IDLE_MS = 5000;
const POINTER_BROADCAST_THROTTLE_MS = 50;

type PointerButton = 'up' | 'down' | null;

interface CollaboratorState {
  id: string;
  username: string;
  color: string;
  pointer?: { x: number; y: number };
  pointerType?: string | null;
  pointerButton?: PointerButton;
}

interface CursorBroadcastPayload {
  type: typeof CURSOR_MESSAGE_TYPE;
  pointer: ({ x: number; y: number; pointerType?: string | null }) | null;
  pointerButton?: PointerButton;
  pointerType?: string | null;
  senderId?: string;
}

const isCursorBroadcastPayload = (value: unknown): value is CursorBroadcastPayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const typed = value as { type?: unknown };
  return typed.type === CURSOR_MESSAGE_TYPE && 'pointer' in typed;
};

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
  const pendingBroadcastTimeout = useRef<number | null>(null);
  const pendingBroadcastVersion = useRef<number | null>(null);
  const broadcastThrottleMs = 50; // Throttle broadcasts to max 20 per second
  const isApplyingRemoteUpdate = useRef<boolean>(false);
  const collaboratorStates = useRef<Map<string, CollaboratorState>>(new Map());
  const collaboratorColorMap = useRef<Map<string, string>>(new Map());
  const collaboratorCursorTimeouts = useRef<Map<string, number>>(new Map());
  const lastCursorBroadcastTime = useRef<number>(0);
  const lastCursorPayload = useRef<{ x: number; y: number; pointerType?: string | null } | null>(null);
  const lastCursorButton = useRef<PointerButton>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const getCollaboratorColor = useCallback((userId: string): string => {
    const cached = collaboratorColorMap.current.get(userId);
    if (cached) {
      return cached;
    }

    let hash = 0;
    for (let index = 0; index < userId.length; index += 1) {
      hash = (hash << 5) - hash + userId.charCodeAt(index);
      hash |= 0;
    }

    const color = COLLABORATOR_COLORS[Math.abs(hash) % COLLABORATOR_COLORS.length];
    collaboratorColorMap.current.set(userId, color);
    return color;
  }, []);

  const updateCollaboratorsAppState = useCallback((): void => {
    if (!excalidrawRef.current) {
      return;
    }

    const collaborators = new Map<string, Record<string, unknown>>();
    collaboratorStates.current.forEach((state: CollaboratorState, id: string) => {
      collaborators.set(id, {
        id,
        username: state.username,
        color: state.color,
        pointer: state.pointer,
        pointerButton: state.pointerButton ?? undefined,
      });
    });

    const currentAppState = excalidrawRef.current.getAppState();
    const existingCollaborators = currentAppState?.collaborators as Map<string, Record<string, unknown>> | undefined;

    const collaboratorsUnchanged = (() => {
      if (!existingCollaborators) {
        return collaborators.size === 0;
      }
      if (existingCollaborators.size !== collaborators.size) {
        return false;
      }
      for (const [key, value] of collaborators) {
        const existing = existingCollaborators.get(key) as Record<string, unknown> | undefined;
        if (!existing) {
          return false;
        }
        const keys = new Set([...Object.keys(existing), ...Object.keys(value)]);
        for (const prop of keys) {
          const existingValue = existing[prop];
          const newValue = value[prop];
          if (typeof existingValue === 'object' && existingValue !== null && typeof newValue === 'object' && newValue !== null) {
            const existingPointer = existingValue as Record<string, unknown>;
            const newPointer = newValue as Record<string, unknown>;
            const pointerKeys = new Set([...Object.keys(existingPointer), ...Object.keys(newPointer)]);
            for (const pointerKey of pointerKeys) {
              if (existingPointer[pointerKey] !== newPointer[pointerKey]) {
                return false;
              }
            }
            continue;
          }
          if (existingValue !== newValue) {
            return false;
          }
        }
      }
      return true;
    })();

    if (collaboratorsUnchanged) {
      return;
    }

    excalidrawRef.current.updateScene({
      appState: {
        ...currentAppState,
        collaborators,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    });
  }, []);

  const clearCollaboratorTimeout = useCallback((userId: string): void => {
    const timeoutId = collaboratorCursorTimeouts.current.get(userId);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      collaboratorCursorTimeouts.current.delete(userId);
    }
  }, []);

  const resetCollaboratorsState = useCallback((): void => {
    collaboratorStates.current.clear();
    collaboratorColorMap.current.clear();
    collaboratorCursorTimeouts.current.forEach((timeoutId: number) => {
      window.clearTimeout(timeoutId);
    });
    collaboratorCursorTimeouts.current.clear();
    lastCursorBroadcastTime.current = 0;
    lastCursorPayload.current = null;
    lastCursorButton.current = null;
    updateCollaboratorsAppState();
  }, [updateCollaboratorsAppState]);

  const applyRemoteCursorUpdate = useCallback((userId: string, payload: CursorBroadcastPayload): void => {
    if (!userId) {
      return;
    }

    const state = collaboratorStates.current.get(userId) ?? {
      id: userId,
      username: userId.slice(0, 8),
      color: getCollaboratorColor(userId),
    };

    if (payload.pointer) {
      state.pointer = { x: payload.pointer.x, y: payload.pointer.y };
      state.pointerType = payload.pointer.pointerType ?? payload.pointerType ?? null;
      state.pointerButton = payload.pointerButton ?? null;
      collaboratorStates.current.set(userId, state);

      clearCollaboratorTimeout(userId);
      const timeoutId = window.setTimeout(() => {
        const current = collaboratorStates.current.get(userId);
        if (!current) {
          return;
        }
        current.pointer = undefined;
        current.pointerButton = null;
        collaboratorStates.current.set(userId, current);
        collaboratorCursorTimeouts.current.delete(userId);
        updateCollaboratorsAppState();
      }, REMOTE_CURSOR_IDLE_MS);
      collaboratorCursorTimeouts.current.set(userId, timeoutId);
    } else {
      state.pointer = undefined;
      state.pointerButton = null;
      collaboratorStates.current.set(userId, state);
      clearCollaboratorTimeout(userId);
    }

    updateCollaboratorsAppState();
  }, [clearCollaboratorTimeout, getCollaboratorColor, updateCollaboratorsAppState]);

  const generateRoomId = () => {
    return Math.random().toString(36).substring(2, 15);
  };

  const broadcastScene = (collab: ReturnType<ExcalidrawAPI['getCollaborationClient']>, allElements: readonly ExcalidrawElement[], syncAll: boolean = false) => {
    if (!collab) return;
    const precedingMap = new Map<string, string>();
    let previousId: string | null = null;
    for (const element of allElements) {
      if (!element?.id) {
        continue;
      }
      if (!previousId) {
        precedingMap.set(element.id, "^");
      } else {
        precedingMap.set(element.id, previousId);
      }
      previousId = element.id;
    }
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
      .map((element) => ({
        ...element,
        [PRECEDING_ELEMENT_KEY]: precedingMap.get(element.id) ?? "^",
      }));
    
    if (elementsToSend.length > 0) {
      collab.broadcast({
        elements: elementsToSend,
      }, false);
      for (const element of elementsToSend) {
        broadcastedElementVersions.current.set(element.id, element.version);
      }
      console.log('Broadcasted scene:', { elementCount: elementsToSend.length, syncAll });
    }
  };

  const setupCollaboration = useCallback((collab: ReturnType<ExcalidrawAPI['getCollaborationClient']>) => {
    if (!collab) return;
    
    collab.onBroadcast((rawData, metadata) => {
      console.log('Collaboration broadcast received:', rawData);

      if (isCursorBroadcastPayload(rawData)) {
        const senderIdFromMetadata = typeof metadata?.userId === 'string' ? metadata.userId : undefined;
        const senderIdFromPayload = typeof rawData.senderId === 'string' ? rawData.senderId : undefined;
        const senderId = senderIdFromMetadata ?? senderIdFromPayload;

        if (senderId && senderId !== collab.getSocketId()) {
          applyRemoteCursorUpdate(senderId, rawData);
        }
        return;
      }

      if (!excalidrawRef.current) {
        return;
      }

      const elements = (rawData as { elements?: BroadcastedExcalidrawElement[] }).elements;
      if (!Array.isArray(elements)) {
        return;
      }

      const localElements = excalidrawRef.current.getSceneElementsIncludingDeleted();
      const appState = excalidrawRef.current.getAppState();
      
      // Use proper reconciliation to merge remote elements
      const reconciledElements = reconcileElements(
        localElements,
        elements as BroadcastedExcalidrawElement[],
        appState
      );
      
      // Set flag to prevent re-broadcasting this update
      isApplyingRemoteUpdate.current = true;
      
      // Update scene
      excalidrawRef.current.updateScene({
        elements: reconciledElements,
      });

      lastBroadcastedOrReceivedSceneVersion.current = getSceneVersion(reconciledElements);
      pendingBroadcastVersion.current = null;
      if (pendingBroadcastTimeout.current !== null) {
        clearTimeout(pendingBroadcastTimeout.current);
        pendingBroadcastTimeout.current = null;
      }
      
      // Clear flag after a short delay to allow onChange to process
      setTimeout(() => {
        isApplyingRemoteUpdate.current = false;
      }, 100);
      
      console.log('Scene reconciled and updated');
    });

    collab.onRoomUserChange((users: string[]) => {
      console.log('Users in room:', users);
      const socketId = collab.getSocketId();
      const remoteUsers = users.filter((userId) => userId !== socketId);
      const remoteSet = new Set(remoteUsers);

      for (const userId of Array.from(collaboratorStates.current.keys()) as string[]) {
        if (!remoteSet.has(userId)) {
          collaboratorStates.current.delete(userId);
          clearCollaboratorTimeout(userId);
        }
      }

      for (const userId of remoteUsers) {
        if (!collaboratorStates.current.has(userId)) {
          collaboratorStates.current.set(userId, {
            id: userId,
            username: userId.slice(0, 8),
            color: getCollaboratorColor(userId),
          });
        }
      }

      updateCollaboratorsAppState();
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

    collab.onChatMessage((message: ChatMessage) => {
      console.log('Chat message received:', message);
      setChatMessages((prev) => [...prev, message]);
    });

    collab.onChatHistory((messages: ChatMessage[]) => {
      console.log('Chat history received:', messages);
      setChatMessages(messages);
    });
  }, [applyRemoteCursorUpdate, clearCollaboratorTimeout, getCollaboratorColor, updateCollaboratorsAppState]);

  // This effect sets up external API and storage instances - legitimate use of setState in effect
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const excalidrawAPI = new ExcalidrawAPI(serverConfig);
    broadcastedElementVersions.current.clear();
    lastBroadcastedOrReceivedSceneVersion.current = -1;
    lastBroadcastTime.current = 0;
    pendingBroadcastVersion.current = null;
    if (pendingBroadcastTimeout.current !== null) {
      clearTimeout(pendingBroadcastTimeout.current);
      pendingBroadcastTimeout.current = null;
    }
    resetCollaboratorsState();
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
      setCurrentRoomId(null);
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
      if (pendingBroadcastTimeout.current !== null) {
        clearTimeout(pendingBroadcastTimeout.current);
        pendingBroadcastTimeout.current = null;
      }
      pendingBroadcastVersion.current = null;
      collaboratorCursorTimeouts.current.forEach((timeoutId: number) => {
        window.clearTimeout(timeoutId);
      });
      collaboratorCursorTimeouts.current.clear();
    };
  }, [serverConfig, initialRoomId, onRoomIdChange, resetCollaboratorsState, setupCollaboration]);
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
      
      broadcastedElementVersions.current.clear();
      lastBroadcastedOrReceivedSceneVersion.current = -1;
  lastBroadcastTime.current = 0;
      pendingBroadcastVersion.current = null;
      if (pendingBroadcastTimeout.current !== null) {
        clearTimeout(pendingBroadcastTimeout.current);
        pendingBroadcastTimeout.current = null;
      }
      resetCollaboratorsState();
      setChatMessages([]); // Clear chat when switching rooms

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
      if (isApplyingRemoteUpdate.current) {
        return;
      }

      const currentVersion = getSceneVersion(elements);
      const now = Date.now();

      if (currentVersion > lastBroadcastedOrReceivedSceneVersion.current) {
        const elapsed = now - lastBroadcastTime.current;
        const canBroadcastNow = elapsed >= broadcastThrottleMs;

        const flushPending = () => {
          const collabClient = api.getCollaborationClient();
          if (!collabClient?.isConnected()) {
            return;
          }
          const latestElements = excalidrawRef.current?.getSceneElementsIncludingDeleted() ?? elements;
          const latestVersion = getSceneVersion(latestElements);
          if (latestVersion <= lastBroadcastedOrReceivedSceneVersion.current) {
            pendingBroadcastVersion.current = null;
            return;
          }
          broadcastScene(collabClient, latestElements, false);
          lastBroadcastedOrReceivedSceneVersion.current = latestVersion;
          lastBroadcastTime.current = Date.now();
          pendingBroadcastVersion.current = null;
        };

        if (canBroadcastNow) {
          if (pendingBroadcastTimeout.current !== null) {
            clearTimeout(pendingBroadcastTimeout.current);
            pendingBroadcastTimeout.current = null;
          }
          pendingBroadcastVersion.current = null;
          const collabClient = api.getCollaborationClient();
          if (collabClient?.isConnected()) {
            broadcastScene(collabClient, elements, false);
            lastBroadcastedOrReceivedSceneVersion.current = currentVersion;
            lastBroadcastTime.current = now;
          }
        } else {
          pendingBroadcastVersion.current = currentVersion;
          if (pendingBroadcastTimeout.current !== null) {
            clearTimeout(pendingBroadcastTimeout.current);
          }
          const delay = Math.max(0, broadcastThrottleMs - elapsed);
          pendingBroadcastTimeout.current = setTimeout(() => {
            pendingBroadcastTimeout.current = null;
            if (pendingBroadcastVersion.current === null) {
              return;
            }
            flushPending();
          }, delay);
        }
      }
    }
  };

  const handlePointerUpdate = useCallback((pointerData: Record<string, unknown>): void => {
    if (!api?.isEnabled()) {
      return;
    }

    const collabClient = api.getCollaborationClient();
    if (!collabClient?.isConnected()) {
      return;
    }

    const userId = collabClient.getSocketId();
    if (!userId) {
      return;
    }

    const pointer = (pointerData?.pointer as { x: number; y: number; pointerType?: string | null } | null | undefined) ?? null;
    const buttonValue = pointerData?.button;
    const pointerButton: PointerButton = buttonValue === 'down' || buttonValue === 'up' ? buttonValue : null;
    const pointerTypeCandidate = pointerData?.pointerType ?? (pointer as { pointerType?: string })?.pointerType;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const eventPointerType = typeof (pointerData as { event?: { pointerType?: string } })?.event?.pointerType === 'string'
      ? (pointerData as { event?: { pointerType?: string } }).event?.pointerType
      : null;
    const pointerType = typeof pointerTypeCandidate === 'string' ? pointerTypeCandidate : eventPointerType;

    const now = Date.now();

    if (!pointer) {
      const payload: Record<string, unknown> = {
        type: CURSOR_MESSAGE_TYPE,
        pointer: null,
        pointerButton: null,
        pointerType,
        senderId: userId,
      };
  collabClient.broadcast(payload, true);
      lastCursorPayload.current = null;
      lastCursorButton.current = null;
      lastCursorBroadcastTime.current = now;
      return;
    }

    const pointerPosition = {
      x: pointer.x,
      y: pointer.y,
      pointerType,
    };

    const samePoint =
      lastCursorPayload.current &&
      lastCursorPayload.current.x === pointerPosition.x &&
      lastCursorPayload.current.y === pointerPosition.y;

    const sameButton = lastCursorButton.current === pointerButton;

    if (samePoint && sameButton && now - lastCursorBroadcastTime.current < POINTER_BROADCAST_THROTTLE_MS) {
      return;
    }

    const payload: Record<string, unknown> = {
      type: CURSOR_MESSAGE_TYPE,
      pointer: { x: pointerPosition.x, y: pointerPosition.y, pointerType },
      pointerButton,
      pointerType,
      senderId: userId,
    };

  collabClient.broadcast(payload, true);
    lastCursorPayload.current = pointerPosition;
    lastCursorButton.current = pointerButton;
    lastCursorBroadcastTime.current = now;
  }, [api]);

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

  const handleSendChatMessage = useCallback((content: string) => {
    if (!api || !currentRoomId) {
      console.error('Cannot send chat message: no API or room');
      return;
    }

    const collab = api.getCollaborationClient();
    if (!collab) {
      console.error('Cannot send chat message: no collaboration client');
      return;
    }

    const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    collab.sendChatMessage(messageId, content);
  }, [api, currentRoomId]);

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      <Excalidraw
        excalidrawAPI={(api: ExcalidrawImperativeAPI) => {
          excalidrawRef.current = api;
          updateCollaboratorsAppState();
        }}
        onChange={handleChange}
        onPointerUpdate={handlePointerUpdate}
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
      
      {currentRoomId && api && (
        <ChatPanel
          messages={chatMessages}
          onSendMessage={handleSendChatMessage}
          currentUserId={api.getCollaborationClient()?.getSocketId()}
        />
      )}
    </div>
  );
}

