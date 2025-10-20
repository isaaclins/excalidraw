import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RenderResult } from '@testing-library/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { ConnectionDialog } from '../ConnectionDialog';
import type { ServerConfig } from '../../lib/api';

type ConnectionDialogProps = ComponentProps<typeof ConnectionDialog>;
type RenderDialogResult = RenderResult & {
	user: ReturnType<typeof userEvent['setup']>;
	onServerConfigChange: ReturnType<typeof vi.fn>;
	onSelectRoom: ReturnType<typeof vi.fn>;
	onDisconnect: ReturnType<typeof vi.fn>;
};

const renderDialog = (overrides: Partial<ConnectionDialogProps> = {}): RenderDialogResult => {
	const onServerConfigChange = vi.fn();
	const onSelectRoom = vi.fn();
	const onDisconnect = vi.fn();

	const props: ConnectionDialogProps = {
		serverConfig: { url: '', enabled: false } as ServerConfig,
		username: '',
		onUsernameChange: vi.fn(),
		onServerConfigChange: onServerConfigChange as ConnectionDialogProps['onServerConfigChange'],
		onSelectRoom: onSelectRoom as ConnectionDialogProps['onSelectRoom'],
		onDisconnect: onDisconnect as ConnectionDialogProps['onDisconnect'],
		onClose: vi.fn(),
		currentRoomId: undefined,
		...overrides,
	};

	const user = userEvent.setup();
	const renderResult = render(<ConnectionDialog {...props} />);

	return {
		...renderResult,
		user,
		onServerConfigChange,
		onSelectRoom,
		onDisconnect,
	} as RenderDialogResult;
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	vi.clearAllMocks();
	fetchMock = vi.fn().mockResolvedValue({
		ok: true,
		json: async () => ({}),
	});
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetAllMocks();
});

describe('ConnectionDialog', () => {
	it('renders username and server inputs', () => {
		renderDialog();

		expect(screen.getByLabelText(/Username/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/Server URL/i)).toBeInTheDocument();
	});

		it('shows stored server hint when input blank', async () => {
			renderDialog({ serverConfig: { url: 'http://localhost:3002', enabled: false } });
			await waitFor(() => expect(fetchMock).toHaveBeenCalled());

		expect(screen.getByText(/Currently using:/i)).toHaveTextContent('http://localhost:3002');
	});

	it('disables connect button without server URL', async () => {
		const { user } = renderDialog();
		const connectButton = screen.getByRole('button', { name: /^connect$/i });
		expect(connectButton).toBeDisabled();

		await user.type(screen.getByLabelText(/Server URL/i), 'http://example.com');
		expect(connectButton).not.toBeDisabled();
	});

	it('fetches rooms and updates config when connecting', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ alpha: 2, beta: 1 }),
		});

		const { user, onServerConfigChange } = renderDialog();

		await user.type(screen.getByLabelText(/Server URL/i), 'http://example.com/');
		await user.click(screen.getByRole('button', { name: /^connect$/i }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('http://example.com/api/rooms'));
		await waitFor(() =>
			expect(onServerConfigChange).toHaveBeenCalledWith({ url: 'http://example.com', enabled: false }),
		);

		expect(screen.getByText('alpha')).toBeInTheDocument();
		expect(screen.getByText('beta')).toBeInTheDocument();
	});

	it('joins selected room', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ roomOne: 1 }),
		});

		const { user, onSelectRoom } = renderDialog();

		await user.type(screen.getByLabelText(/Server URL/i), 'http://example.com');
		await user.click(screen.getByRole('button', { name: /^connect$/i }));

		await waitFor(() => screen.getByText('roomOne'));
		await user.click(screen.getByText('roomOne'));

		expect(onSelectRoom).toHaveBeenCalledWith('roomOne', 'http://example.com');
	});

	it('creates new room using username', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({}),
		});

		const { user, onSelectRoom } = renderDialog({ username: 'Alice' });

		await user.type(screen.getByLabelText(/Server URL/i), 'http://example.com');
		await user.click(screen.getByRole('button', { name: /^connect$/i }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());

		await user.click(screen.getByRole('button', { name: /Create “Alice's Room”/i }));

		expect(onSelectRoom).toHaveBeenCalledWith(expect.stringMatching(/^alice-s-room-/), 'http://example.com');
	});

		it('invokes disconnect handler', async () => {
			const { user, onDisconnect } = renderDialog({
			serverConfig: { url: 'http://example.com', enabled: true },
			currentRoomId: 'alpha',
		});

			await waitFor(() => expect(fetchMock).toHaveBeenCalled());

		await user.click(screen.getByRole('button', { name: /disconnect/i }));

		expect(onDisconnect).toHaveBeenCalledWith('http://example.com');
	});
});

