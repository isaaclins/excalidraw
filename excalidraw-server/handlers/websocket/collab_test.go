package websocket

import (
	"testing"
)

func TestAddChatMessage(t *testing.T) {
	// Clear any existing chat history
	chatHistoryMutex.Lock()
	chatHistory = make(map[string][]ChatMessage)
	chatHistoryMutex.Unlock()

	roomID := "test-room-1"
	message := ChatMessage{
		ID:        "msg-1",
		RoomID:    roomID,
		Sender:    "user-1",
		Content:   "Hello world",
		Timestamp: 1234567890,
	}

	addChatMessage(roomID, message)

	messages := getChatHistory(roomID)
	if len(messages) != 1 {
		t.Errorf("Expected 1 message, got %d", len(messages))
	}

	if messages[0].ID != message.ID {
		t.Errorf("Expected message ID %s, got %s", message.ID, messages[0].ID)
	}

	if messages[0].Content != message.Content {
		t.Errorf("Expected content %s, got %s", message.Content, messages[0].Content)
	}
}

func TestChatMessageLimit(t *testing.T) {
	// Clear any existing chat history
	chatHistoryMutex.Lock()
	chatHistory = make(map[string][]ChatMessage)
	chatHistoryMutex.Unlock()

	roomID := "test-room-2"

	// Add more than the maximum number of messages
	for i := 0; i < maxChatMessagesPerRoom+100; i++ {
		message := ChatMessage{
			ID:        string(rune(i)),
			RoomID:    roomID,
			Sender:    "user-1",
			Content:   "Message content",
			Timestamp: int64(i),
		}
		addChatMessage(roomID, message)
	}

	messages := getChatHistory(roomID)
	if len(messages) != maxChatMessagesPerRoom {
		t.Errorf("Expected %d messages, got %d", maxChatMessagesPerRoom, len(messages))
	}

	// Verify that we kept the most recent messages
	if messages[len(messages)-1].Timestamp != int64(maxChatMessagesPerRoom+99) {
		t.Errorf("Expected last message timestamp to be %d, got %d", maxChatMessagesPerRoom+99, messages[len(messages)-1].Timestamp)
	}
}

func TestGetChatHistoryEmpty(t *testing.T) {
	// Clear any existing chat history
	chatHistoryMutex.Lock()
	chatHistory = make(map[string][]ChatMessage)
	chatHistoryMutex.Unlock()

	roomID := "nonexistent-room"
	messages := getChatHistory(roomID)

	if len(messages) != 0 {
		t.Errorf("Expected 0 messages for nonexistent room, got %d", len(messages))
	}
}

func TestClearChatHistory(t *testing.T) {
	// Clear any existing chat history
	chatHistoryMutex.Lock()
	chatHistory = make(map[string][]ChatMessage)
	chatHistoryMutex.Unlock()

	roomID := "test-room-3"
	message := ChatMessage{
		ID:        "msg-1",
		RoomID:    roomID,
		Sender:    "user-1",
		Content:   "Test message",
		Timestamp: 1234567890,
	}

	addChatMessage(roomID, message)

	// Verify message was added
	messages := getChatHistory(roomID)
	if len(messages) != 1 {
		t.Errorf("Expected 1 message before clear, got %d", len(messages))
	}

	// Clear history
	clearChatHistory(roomID)

	// Verify history was cleared
	messages = getChatHistory(roomID)
	if len(messages) != 0 {
		t.Errorf("Expected 0 messages after clear, got %d", len(messages))
	}
}

func TestMultipleRoomsChatHistory(t *testing.T) {
	// Clear any existing chat history
	chatHistoryMutex.Lock()
	chatHistory = make(map[string][]ChatMessage)
	chatHistoryMutex.Unlock()

	room1 := "test-room-4"
	room2 := "test-room-5"

	message1 := ChatMessage{
		ID:        "msg-1",
		RoomID:    room1,
		Sender:    "user-1",
		Content:   "Message in room 1",
		Timestamp: 1234567890,
	}

	message2 := ChatMessage{
		ID:        "msg-2",
		RoomID:    room2,
		Sender:    "user-2",
		Content:   "Message in room 2",
		Timestamp: 1234567891,
	}

	addChatMessage(room1, message1)
	addChatMessage(room2, message2)

	messages1 := getChatHistory(room1)
	messages2 := getChatHistory(room2)

	if len(messages1) != 1 {
		t.Errorf("Expected 1 message in room1, got %d", len(messages1))
	}

	if len(messages2) != 1 {
		t.Errorf("Expected 1 message in room2, got %d", len(messages2))
	}

	if messages1[0].Content != "Message in room 1" {
		t.Errorf("Wrong content in room1: %s", messages1[0].Content)
	}

	if messages2[0].Content != "Message in room 2" {
		t.Errorf("Wrong content in room2: %s", messages2[0].Content)
	}
}

func TestChatMessageConcurrency(t *testing.T) {
	// Clear any existing chat history
	chatHistoryMutex.Lock()
	chatHistory = make(map[string][]ChatMessage)
	chatHistoryMutex.Unlock()

	roomID := "test-room-6"
	numMessages := 100

	// Add messages concurrently
	done := make(chan bool, numMessages)
	for i := 0; i < numMessages; i++ {
		go func(index int) {
			message := ChatMessage{
				ID:        string(rune(index)),
				RoomID:    roomID,
				Sender:    "user-1",
				Content:   "Concurrent message",
				Timestamp: int64(index),
			}
			addChatMessage(roomID, message)
			done <- true
		}(i)
	}

	// Wait for all goroutines to complete
	for i := 0; i < numMessages; i++ {
		<-done
	}

	messages := getChatHistory(roomID)
	if len(messages) != numMessages {
		t.Errorf("Expected %d messages, got %d", numMessages, len(messages))
	}
}

func TestChatMessageSpecialCharacters(t *testing.T) {
	// Clear any existing chat history
	chatHistoryMutex.Lock()
	chatHistory = make(map[string][]ChatMessage)
	chatHistoryMutex.Unlock()

	roomID := "test-room-7"
	specialContent := "Hello 👋 <script>alert('test')</script> 你好 مرحبا"

	message := ChatMessage{
		ID:        "msg-1",
		RoomID:    roomID,
		Sender:    "user-1",
		Content:   specialContent,
		Timestamp: 1234567890,
	}

	addChatMessage(roomID, message)

	messages := getChatHistory(roomID)
	if len(messages) != 1 {
		t.Errorf("Expected 1 message, got %d", len(messages))
	}

	if messages[0].Content != specialContent {
		t.Errorf("Expected content %s, got %s", specialContent, messages[0].Content)
	}
}
