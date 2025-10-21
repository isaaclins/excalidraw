# In-Room Text Chat Feature

## Overview

This feature adds real-time text chat functionality to Excalidraw collaboration rooms. Users can send and receive messages in real-time, with chat history automatically provided to new users when they join a room.

## Features

### Server-Side (Go)
- **In-memory storage**: Chat messages are stored per room in memory
- **Message limit**: Maximum 1000 messages per room to prevent memory issues
- **Chat history**: New users receive full chat history when joining a room
- **Auto cleanup**: Chat history is automatically cleared when a room becomes empty
- **Thread-safe**: All chat operations use mutex locks for concurrent access

### Client-Side (TypeScript/React)
- **Chat panel UI**: Expandable/collapsible panel in the bottom-right corner
- **Real-time messaging**: Instant message delivery to all room participants
- **Message formatting**: Shows sender, content, and timestamp
- **Visual distinction**: Own messages highlighted differently from others
- **Keyboard shortcuts**: Press Enter to send messages
- **Auto-scroll**: Automatically scrolls to latest messages
- **State management**: Chat clears when switching rooms

## Architecture

### WebSocket Events

#### Client → Server
- **`server-chat-message`**: Client sends a chat message to the room
  ```typescript
  {
    roomId: string,
    messageData: {
      id: string,
      content: string
    }
  }
  ```

#### Server → Client
- **`client-chat-message`**: Server broadcasts a message to all room members
  ```typescript
  {
    id: string,
    roomId: string,
    sender: string,
    content: string,
    timestamp: number
  }
  ```

- **`chat-history`**: Server sends chat history to newly joined user
  ```typescript
  Array<{
    id: string,
    roomId: string,
    sender: string,
    content: string,
    timestamp: number
  }>
  ```

### Data Flow

```
User A                    Server                     User B
  |                         |                          |
  |--- server-chat-message -->|                        |
  |   (roomId, message)     |                          |
  |                         |                          |
  |                    [Store in memory]               |
  |                    [Limit to 1000]                 |
  |                         |                          |
  |<-- client-chat-message --|                         |
  |                         |--- client-chat-message -->|
  |                         |   (message)              |
  |                         |                          |
  |                    [User B joins]                  |
  |                         |<--- join-room ----------|
  |                         |                          |
  |                         |--- chat-history -------->|
  |                         |   (all messages)         |
```

## Implementation Details

### Server (Go)

**File**: `excalidraw-server/handlers/websocket/collab.go`

Key functions:
- `addChatMessage(roomID, message)`: Adds message to room's history
- `getChatHistory(roomID)`: Retrieves chat history for a room
- `clearChatHistory(roomID)`: Clears history when room is empty
- `handleChatMessage(socket, srv, datas)`: Processes incoming chat messages

Data structures:
```go
type ChatMessage struct {
    ID        string `json:"id"`
    RoomID    string `json:"roomId"`
    Sender    string `json:"sender"`
    Content   string `json:"content"`
    Timestamp int64  `json:"timestamp"`
}

const maxChatMessagesPerRoom = 1000

var (
    chatHistory      = make(map[string][]ChatMessage)
    chatHistoryMutex sync.RWMutex
)
```

### Client (TypeScript/React)

**Files**:
- `excalidraw-app/src/lib/websocket.ts`: CollaborationClient chat methods
- `excalidraw-app/src/components/ChatPanel.tsx`: Chat UI component
- `excalidraw-app/src/components/ChatPanel.css`: Chat styling
- `excalidraw-app/src/components/ExcalidrawWrapper.tsx`: Integration

Key methods in CollaborationClient:
```typescript
sendChatMessage(messageId: string, content: string): void
onChatMessage(callback: (message: ChatMessage) => void): void
onChatHistory(callback: (messages: ChatMessage[]) => void): void
```

ChatPanel component features:
- Collapsible header with message count
- Scrollable message list
- Input field with send button
- Timestamp formatting
- Sender identification (You vs socket ID)
- Auto-scroll to bottom

## Testing

### Unit Tests

**App Tests** (`excalidraw-app/src/lib/__tests__/websocket.test.ts`):
- ✅ Send chat message
- ✅ Prevent sending when not connected
- ✅ Handle receiving chat messages
- ✅ Handle receiving chat history
- ✅ Handle empty content
- ✅ Handle special characters

**Server Tests** (`excalidraw-server/handlers/websocket/collab_test.go`):
- ✅ Add chat message
- ✅ Message limit enforcement
- ✅ Empty room chat history
- ✅ Clear chat history
- ✅ Multiple rooms isolation
- ✅ Concurrent access safety
- ✅ Special character handling

### Integration Test

A Node.js integration test demonstrates:
- Two clients connecting to the server
- Both clients joining the same room
- Message exchange between clients
- Chat history delivery to new users

**Test Results**:
```
✅ Connections: Both clients connected
✅ Room joins: Both clients joined successfully
✅ Messages received: 4 messages exchanged
✅ Chat functionality working!

Messages exchanged:
  1. [Client 2] Hello from Client 1!
  2. [Client 1] Hello from Client 1!
  3. [Client 2] Hi Client 1! This is Client 2.
  4. [Client 1] Hi Client 1! This is Client 2.
```

### Test Coverage

- **App**: 140 tests pass (6 new chat tests)
- **Server**: All existing tests + 7 new chat tests pass
- **Build**: Both app and server build successfully
- **Linting**: No errors

## Usage

### For Users

1. **Connect to a room**: Use the connection dialog to join a collaboration room
2. **Open chat**: Look for the chat panel in the bottom-right corner
3. **Expand panel**: Click the header to expand/collapse
4. **Send message**: Type in the input field and press Enter or click Send
5. **View history**: New messages appear at the bottom, scroll to see older ones

### For Developers

**Starting a chat conversation**:
```typescript
const collab = api.getCollaborationClient();
collab.sendChatMessage('unique-id', 'Hello world!');
```

**Listening for messages**:
```typescript
collab.onChatMessage((message) => {
  console.log(`${message.sender}: ${message.content}`);
});
```

**Accessing chat history**:
```typescript
collab.onChatHistory((messages) => {
  console.log(`Received ${messages.length} messages`);
});
```

## Configuration

### Server

No configuration needed. Chat is automatically enabled with:
- In-memory storage
- 1000 message limit per room
- Automatic cleanup on room empty

### Client

Chat panel automatically appears when:
- User is connected to a server
- User has joined a room

## Security Considerations

1. **Content sanitization**: Messages are displayed as plain text (no HTML rendering)
2. **Input validation**: Server validates all message fields
3. **Rate limiting**: Consider adding rate limits in production
4. **Message size**: Consider adding max message length limit
5. **Persistence**: Messages are ephemeral (not persisted to database)

## Future Enhancements

Potential improvements:
- [ ] Message persistence to database
- [ ] Markdown/link support in messages
- [ ] User mentions (@username)
- [ ] Read receipts
- [ ] Typing indicators
- [ ] Message editing/deletion
- [ ] File attachments
- [ ] Message search
- [ ] User blocking/reporting
- [ ] Emoji picker
- [ ] Message reactions
- [ ] Thread replies

## Troubleshooting

### Chat panel not appearing
- Ensure you're connected to a server
- Verify you've joined a room
- Check browser console for errors

### Messages not sending
- Verify server connection is active
- Check that room ID is valid
- Ensure content is not empty

### Messages not receiving
- Verify WebSocket connection is stable
- Check server logs for errors
- Ensure both clients are in same room

### Chat history not loading
- Verify server is running and accessible
- Check that room was not empty when joining
- Look for errors in server logs

## Related Files

### Server
- `excalidraw-server/handlers/websocket/collab.go` - Main chat implementation
- `excalidraw-server/handlers/websocket/collab_test.go` - Chat tests

### Client
- `excalidraw-app/src/lib/websocket.ts` - WebSocket client methods
- `excalidraw-app/src/lib/__tests__/websocket.test.ts` - Client tests
- `excalidraw-app/src/components/ChatPanel.tsx` - UI component
- `excalidraw-app/src/components/ChatPanel.css` - Styling
- `excalidraw-app/src/components/ExcalidrawWrapper.tsx` - Integration

## License

Same as main project (MIT)
