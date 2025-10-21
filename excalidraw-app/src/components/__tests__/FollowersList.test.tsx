import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FollowersList } from '../FollowersList';

describe('FollowersList', () => {
  const mockCollaborators = [
    {
      id: 'user-1',
      username: 'Alice',
      color: '#ff6b6b',
      pointer: { x: 100, y: 200 },
    },
    {
      id: 'user-2',
      username: 'Bob',
      color: '#4ecdc4',
    },
    {
      id: 'user-3',
      username: 'Charlie',
      color: '#ffe66d',
      pointer: { x: 300, y: 400 },
    },
  ];

  it('should not render when not visible', () => {
    const { container } = render(
      <FollowersList
        collaborators={[]}
        followedUserId={null}
        onFollowUser={vi.fn()}
        isVisible={false}
        onClose={vi.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render collaborators list when visible', () => {
    render(
      <FollowersList
        collaborators={mockCollaborators}
        followedUserId={null}
        onFollowUser={vi.fn()}
        isVisible={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('👥 Collaborators')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('should show active status for users with pointer', () => {
    render(
      <FollowersList
        collaborators={mockCollaborators}
        followedUserId={null}
        onFollowUser={vi.fn()}
        isVisible={true}
        onClose={vi.fn()}
      />
    );

    const activeStatuses = screen.getAllByText(/● Active/);
    expect(activeStatuses).toHaveLength(2); // Alice and Charlie
  });

  it('should show idle status for users without pointer', () => {
    render(
      <FollowersList
        collaborators={mockCollaborators}
        followedUserId={null}
        onFollowUser={vi.fn()}
        isVisible={true}
        onClose={vi.fn()}
      />
    );

    const idleStatuses = screen.getAllByText(/● Idle/);
    expect(idleStatuses).toHaveLength(1); // Bob
  });

  it('should call onFollowUser when follow button is clicked', () => {
    const onFollowUser = vi.fn();
    render(
      <FollowersList
        collaborators={mockCollaborators}
        followedUserId={null}
        onFollowUser={onFollowUser}
        isVisible={true}
        onClose={vi.fn()}
      />
    );

    const followButtons = screen.getAllByRole('button', { name: /Follow/ });
    fireEvent.click(followButtons[0]);

    expect(onFollowUser).toHaveBeenCalledWith('user-1');
  });

  it('should show Following status for followed user', () => {
    render(
      <FollowersList
        collaborators={mockCollaborators}
        followedUserId="user-2"
        onFollowUser={vi.fn()}
        isVisible={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('👁️ Following')).toBeInTheDocument();
  });

  it('should call onFollowUser with null when unfollow button is clicked', () => {
    const onFollowUser = vi.fn();
    render(
      <FollowersList
        collaborators={mockCollaborators}
        followedUserId="user-2"
        onFollowUser={onFollowUser}
        isVisible={true}
        onClose={vi.fn()}
      />
    );

    const followingButton = screen.getByRole('button', { name: /👁️ Following/ });
    fireEvent.click(followingButton);

    expect(onFollowUser).toHaveBeenCalledWith(null);
  });

  it('should show Stop Following button when following a user', () => {
    render(
      <FollowersList
        collaborators={mockCollaborators}
        followedUserId="user-1"
        onFollowUser={vi.fn()}
        isVisible={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Stop Following/ })).toBeInTheDocument();
  });

  it('should call onFollowUser with null when Stop Following button is clicked', () => {
    const onFollowUser = vi.fn();
    render(
      <FollowersList
        collaborators={mockCollaborators}
        followedUserId="user-1"
        onFollowUser={onFollowUser}
        isVisible={true}
        onClose={vi.fn()}
      />
    );

    const stopButton = screen.getByRole('button', { name: /Stop Following/ });
    fireEvent.click(stopButton);

    expect(onFollowUser).toHaveBeenCalledWith(null);
  });

  it('should call onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <FollowersList
        collaborators={mockCollaborators}
        followedUserId={null}
        onFollowUser={vi.fn()}
        isVisible={true}
        onClose={onClose}
      />
    );

    const closeButton = screen.getByRole('button', { name: '×' });
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalled();
  });

  it('should call onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <FollowersList
        collaborators={mockCollaborators}
        followedUserId={null}
        onFollowUser={vi.fn()}
        isVisible={true}
        onClose={onClose}
      />
    );

    const overlay = container.querySelector('.followers-list-overlay');
    fireEvent.click(overlay!);

    expect(onClose).toHaveBeenCalled();
  });

  it('should not call onClose when sidebar itself is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <FollowersList
        collaborators={mockCollaborators}
        followedUserId={null}
        onFollowUser={vi.fn()}
        isVisible={true}
        onClose={onClose}
      />
    );

    const sidebar = container.querySelector('.followers-list');
    fireEvent.click(sidebar!);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('should show message when no collaborators', () => {
    render(
      <FollowersList
        collaborators={[]}
        followedUserId={null}
        onFollowUser={vi.fn()}
        isVisible={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('No other collaborators in this room')).toBeInTheDocument();
  });

  it('should render collaborator avatars with first letter of username', () => {
    render(
      <FollowersList
        collaborators={mockCollaborators}
        followedUserId={null}
        onFollowUser={vi.fn()}
        isVisible={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('A')).toBeInTheDocument(); // Alice
    expect(screen.getByText('B')).toBeInTheDocument(); // Bob
    expect(screen.getByText('C')).toBeInTheDocument(); // Charlie
  });

  it('should apply following class to followed user item', () => {
    const { container } = render(
      <FollowersList
        collaborators={mockCollaborators}
        followedUserId="user-2"
        onFollowUser={vi.fn()}
        isVisible={true}
        onClose={vi.fn()}
      />
    );

    const followingItems = container.querySelectorAll('.collaborator-item.following');
    expect(followingItems).toHaveLength(1);
  });
});
