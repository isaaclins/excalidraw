import { useState, useEffect } from 'react';
import './RoomsSidebar.css';

interface Room {
  id: string;
  users: number;
  lastActive?: number;
}

interface RoomsSidebarProps {
  serverUrl: string;
  currentRoomId: string | null;
  onJoinRoom: (roomId: string) => void;
  isVisible: boolean;
  onClose: () => void;
}

export function RoomsSidebar({ serverUrl, currentRoomId, onJoinRoom, isVisible, onClose }: RoomsSidebarProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isVisible) return;

    const fetchRooms = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${serverUrl}/api/rooms`);
        if (response.ok) {
          const payload = await response.json();
          let roomList: Room[] = [];

          if (Array.isArray(payload)) {
            const parsed: Room[] = [];
            for (const entry of payload) {
              if (!entry || typeof entry !== 'object') {
                continue;
              }
              const roomEntry = entry as { id?: unknown; users?: unknown; lastActive?: unknown };
              const id = typeof roomEntry.id === 'string' ? roomEntry.id : '';
              if (!id) {
                continue;
              }
              const users = typeof roomEntry.users === 'number' ? roomEntry.users : 0;
              const room: Room = { id, users };
              if (typeof roomEntry.lastActive === 'number') {
                room.lastActive = roomEntry.lastActive;
              }
              parsed.push(room);
            }
            roomList = parsed;
          } else if (payload && typeof payload === 'object') {
            roomList = Object.entries(payload as Record<string, number>).map(([id, users]) => ({
              id,
              users: typeof users === 'number' ? users : 0,
            }));
          }

          roomList.sort((a, b) => {
            if (b.users !== a.users) {
              return b.users - a.users;
            }
            const aLast = a.lastActive ?? 0;
            const bLast = b.lastActive ?? 0;
            if (bLast !== aLast) {
              return bLast - aLast;
            }
            return a.id.localeCompare(b.id);
          });

          setRooms(roomList);
        }
      } catch (error) {
        console.error('Failed to fetch rooms:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRooms();
    const interval = setInterval(fetchRooms, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [serverUrl, isVisible]);

  if (!isVisible) return null;

  return (
    <div className="rooms-sidebar-overlay" onClick={onClose}>
      <div className="rooms-sidebar" onClick={(e) => e.stopPropagation()}>
        <div className="rooms-sidebar-header">
          <h3>Rooms</h3>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="rooms-list">
          {loading && rooms.length === 0 ? (
            <div className="rooms-loading">Loading rooms...</div>
          ) : rooms.length === 0 ? (
            <div className="rooms-empty">No rooms yet</div>
          ) : (
            rooms.map((room) => (
              <div
                key={room.id}
                className={`room-item ${room.id === currentRoomId ? 'current' : ''}`}
                onClick={() => {
                  if (room.id !== currentRoomId) {
                    onJoinRoom(room.id);
                    onClose();
                  }
                }}
              >
                <div className="room-id">
                  <code>{room.id}</code>
                  {room.id === currentRoomId && <span className="current-badge">Current</span>}
                </div>
                <div className="room-users">
                  👥 {room.users} user{room.users !== 1 ? 's' : ''}
                </div>
                {typeof room.lastActive === 'number' && (
                  <div className="room-last-active">
                    Last active {new Date(room.lastActive).toLocaleString()}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="rooms-sidebar-footer">
          <small>Rooms refresh every 5 seconds</small>
        </div>
      </div>
    </div>
  );
}

