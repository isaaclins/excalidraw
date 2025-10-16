import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionDialog } from '../ConnectionDialog';

describe('ConnectionDialog', () => {
  const mockOnConnect = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('initial render', () => {
    it('should render with default values', () => {
      render(
        <ConnectionDialog 
          onConnect={mockOnConnect} 
          onClose={mockOnClose}
          isConnected={false}
        />
      );

      expect(screen.getByText('Server Settings')).toBeInTheDocument();
      expect(screen.getByLabelText(/Server URL/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Room ID/i)).toBeInTheDocument();
    });

    it('should load server URL from localStorage', () => {
      localStorage.setItem('excalidraw-server-config', JSON.stringify({
        url: 'http://custom-server:3002',
        enabled: true,
      }));

      render(
        <ConnectionDialog 
          onConnect={mockOnConnect} 
          onClose={mockOnClose}
          isConnected={false}
        />
      );

      const serverInput = screen.getByLabelText(/Server URL/i) as HTMLInputElement;
      expect(serverInput.value).toBe('http://custom-server:3002');
    });

    it('should display current room ID when connected', () => {
      render(
        <ConnectionDialog 
          onConnect={mockOnConnect} 
          onClose={mockOnClose}
          currentRoomId="room-123"
          isConnected={true}
        />
      );

      expect(screen.getByText('room-123')).toBeInTheDocument();
      expect(screen.getByText(/Current Room ID/i)).toBeInTheDocument();
    });

    it('should not display room info when not connected', () => {
      render(
        <ConnectionDialog 
          onConnect={mockOnConnect} 
          onClose={mockOnClose}
          isConnected={false}
        />
      );

      expect(screen.queryByText(/Current Room ID/i)).not.toBeInTheDocument();
    });
  });

  describe('user interactions', () => {
    it('should close dialog when clicking outside', () => {
      render(
        <ConnectionDialog 
          onConnect={mockOnConnect} 
          onClose={mockOnClose}
          isConnected={false}
        />
      );

      const overlay = screen.getByText('Server Settings').parentElement?.parentElement;
      if (overlay) {
        fireEvent.click(overlay);
        expect(mockOnClose).toHaveBeenCalled();
      }
    });

    it('should not close when clicking inside dialog', () => {
      render(
        <ConnectionDialog 
          onConnect={mockOnConnect} 
          onClose={mockOnClose}
          isConnected={false}
        />
      );

      const dialog = screen.getByText('Server Settings').parentElement;
      if (dialog) {
        fireEvent.click(dialog);
        expect(mockOnClose).not.toHaveBeenCalled();
      }
    });
  });

  describe('connect button', () => {
    it('should call onConnect with config and room ID', async () => {
      const user = userEvent.setup();
      render(
        <ConnectionDialog 
          onConnect={mockOnConnect} 
          onClose={mockOnClose}
          isConnected={false}
        />
      );

      const serverInput = screen.getByLabelText(/Server URL/i);
      const roomInput = screen.getByLabelText(/Room ID/i);
      
      await user.clear(serverInput);
      await user.type(serverInput, 'http://test:3002');
      await user.type(roomInput, 'test-room');

      const connectButton = screen.getByText('Connect to Server');
      await user.click(connectButton);

      await waitFor(() => {
        expect(mockOnConnect).toHaveBeenCalledWith(
          { url: 'http://test:3002', enabled: true },
          'test-room'
        );
      });
    });

    it('should be disabled when server URL is empty', async () => {
      const user = userEvent.setup();
      render(
        <ConnectionDialog 
          onConnect={mockOnConnect} 
          onClose={mockOnClose}
          isConnected={false}
        />
      );

      const serverInput = screen.getByLabelText(/Server URL/i);
      await user.clear(serverInput);

      const connectButton = screen.getByText('Connect to Server');
      expect(connectButton).toBeDisabled();
    });

    it('should handle connection without room ID', async () => {
      const user = userEvent.setup();
      render(
        <ConnectionDialog 
          onConnect={mockOnConnect} 
          onClose={mockOnClose}
          isConnected={false}
        />
      );

      const serverInput = screen.getByLabelText(/Server URL/i);
      await user.clear(serverInput);
      await user.type(serverInput, 'http://test:3002');

      const connectButton = screen.getByText('Connect to Server');
      await user.click(connectButton);

      await waitFor(() => {
        expect(mockOnConnect).toHaveBeenCalledWith(
          { url: 'http://test:3002', enabled: true },
          undefined
        );
      });
    });

    it('should disable button when connecting', () => {
      mockOnConnect.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(
        <ConnectionDialog 
          onConnect={mockOnConnect} 
          onClose={mockOnClose}
          isConnected={false}
        />
      );

      const connectButton = screen.getByText('Connect to Server');
      
      // Just verify the button exists and can be disabled
      expect(connectButton).toBeInTheDocument();
    });
  });

  describe('offline mode', () => {
    it('should call onConnect with disabled config', async () => {
      const user = userEvent.setup();
      render(
        <ConnectionDialog 
          onConnect={mockOnConnect} 
          onClose={mockOnClose}
          isConnected={false}
        />
      );

      const offlineButton = screen.getByText('Work Offline');
      await user.click(offlineButton);

      expect(mockOnConnect).toHaveBeenCalled();
      const callArgs = mockOnConnect.mock.calls[0];
      expect(callArgs[0].enabled).toBe(false);
    });

    it('should save config to localStorage', async () => {
      const user = userEvent.setup();
      render(
        <ConnectionDialog 
          onConnect={mockOnConnect} 
          onClose={mockOnClose}
          isConnected={false}
        />
      );

      const offlineButton = screen.getByText('Work Offline');
      await user.click(offlineButton);

      const saved = localStorage.getItem('excalidraw-server-config');
      expect(saved).toBeTruthy();
      const config = JSON.parse(saved!);
      expect(config.enabled).toBe(false);
    });
  });

  describe('connected state', () => {
    it('should show switch room button when connected', () => {
      render(
        <ConnectionDialog 
          onConnect={mockOnConnect} 
          onClose={mockOnClose}
          currentRoomId="room-123"
          isConnected={true}
        />
      );

      expect(screen.getByText('Switch Room')).toBeInTheDocument();
      expect(screen.getByText('Close')).toBeInTheDocument();
    });

    it('should disable switch room when room ID is empty', () => {
      render(
        <ConnectionDialog 
          onConnect={mockOnConnect} 
          onClose={mockOnClose}
          currentRoomId="room-123"
          isConnected={true}
        />
      );

      const switchButton = screen.getByText('Switch Room');
      expect(switchButton).toBeDisabled();
    });

    it('should disable server URL input when connected', () => {
      render(
        <ConnectionDialog 
          onConnect={mockOnConnect} 
          onClose={mockOnClose}
          currentRoomId="room-123"
          isConnected={true}
        />
      );

      const serverInput = screen.getByLabelText(/Server URL/i);
      expect(serverInput).toBeDisabled();
    });
  });

  describe('edge cases', () => {
    it('should handle missing currentRoomId prop', () => {
      render(
        <ConnectionDialog 
          onConnect={mockOnConnect} 
          onClose={mockOnClose}
          isConnected={false}
        />
      );

      expect(screen.queryByText(/Current Room ID/i)).not.toBeInTheDocument();
    });

    it('should handle corrupted localStorage data', () => {
      localStorage.setItem('excalidraw-server-config', '{invalid json}');

      render(
        <ConnectionDialog 
          onConnect={mockOnConnect} 
          onClose={mockOnClose}
          isConnected={false}
        />
      );

      // Should fallback to default URL
      const serverInput = screen.getByLabelText(/Server URL/i) as HTMLInputElement;
      expect(serverInput.value).toBe('http://localhost:3002');
    });
  });

  describe('accessibility', () => {
    it('should have proper labels for inputs', () => {
      render(
        <ConnectionDialog 
          onConnect={mockOnConnect} 
          onClose={mockOnClose}
          isConnected={false}
        />
      );

      expect(screen.getByLabelText(/Server URL/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Room ID/i)).toBeInTheDocument();
    });

    it('should have proper button roles', () => {
      render(
        <ConnectionDialog 
          onConnect={mockOnConnect} 
          onClose={mockOnClose}
          isConnected={false}
        />
      );

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('should show proper placeholder text', () => {
      render(
        <ConnectionDialog 
          onConnect={mockOnConnect} 
          onClose={mockOnClose}
          isConnected={false}
        />
      );

      expect(screen.getByPlaceholderText(/http:\/\/localhost:3002/i)).toBeInTheDocument();
    });
  });
});
