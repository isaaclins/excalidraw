import { useState, useEffect } from 'react';
import './RoomsSidebar.css';

interface Room {
  id: string;
  users: number;
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
          const data = await response.json();
          const roomList: Room[] = Object.entries(data).map(([id, users]) => ({
            id,
            users: users as number,
          }));
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
          <h3>Active Rooms</h3>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="rooms-list">
          {loading && rooms.length === 0 ? (
            <div className="rooms-loading">Loading rooms...</div>
          ) : rooms.length === 0 ? (
            <div className="rooms-empty">No active rooms</div>
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

