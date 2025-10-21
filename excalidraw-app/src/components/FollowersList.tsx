import { useMemo, useCallback } from 'react';
import './FollowersList.css';

interface Collaborator {
  id: string;
  username: string;
  color: string;
  pointer?: { x: number; y: number };
}

interface FollowersListProps {
  collaborators: Collaborator[];
  followedUserId: string | null;
  onFollowUser: (userId: string | null) => void;
  isVisible: boolean;
  onClose: () => void;
}

export function FollowersList({
  collaborators,
  followedUserId,
  onFollowUser,
  isVisible,
  onClose,
}: FollowersListProps) {
  const collaboratorList = useMemo(() => {
    return collaborators;
  }, [collaborators]);

  const handleFollowClick = useCallback((userId: string) => {
    if (followedUserId === userId) {
      // Stop following
      onFollowUser(null);
    } else {
      // Start following
      onFollowUser(userId);
    }
  }, [followedUserId, onFollowUser]);

  if (!isVisible) return null;

  return (
    <div className="followers-list-overlay" onClick={onClose}>
      <div className="followers-list" onClick={(e) => e.stopPropagation()}>
        <div className="followers-list-header">
          <h3>👥 Collaborators</h3>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="collaborators-container">
          {collaboratorList.length === 0 ? (
            <div className="no-collaborators">
              No other collaborators in this room
            </div>
          ) : (
            collaboratorList.map((collab) => (
              <div
                key={collab.id}
                className={`collaborator-item ${followedUserId === collab.id ? 'following' : ''}`}
              >
                <div className="collaborator-info">
                  <div
                    className="collaborator-avatar"
                    style={{ backgroundColor: collab.color }}
                  >
                    {collab.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="collaborator-details">
                    <div className="collaborator-username">{collab.username}</div>
                    <div className="collaborator-status">
                      {collab.pointer ? (
                        <span className="status-active">● Active</span>
                      ) : (
                        <span className="status-idle">● Idle</span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  className={`follow-button ${followedUserId === collab.id ? 'following' : ''}`}
                  onClick={() => handleFollowClick(collab.id)}
                  title={followedUserId === collab.id ? 'Stop following' : 'Follow this user'}
                >
                  {followedUserId === collab.id ? '👁️ Following' : '👁️‍🗨️ Follow'}
                </button>
              </div>
            ))
          )}
        </div>

        {followedUserId && (
          <div className="followers-list-footer">
            <button
              className="stop-following-button"
              onClick={() => onFollowUser(null)}
            >
              Stop Following
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
