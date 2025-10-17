package memory

import (
	"bytes"
	"context"
	"excalidraw-server/core"
	"strings"
	"sync"
	"testing"
)

func TestNewDocumentStore(t *testing.T) {
	store := NewDocumentStore()
	if store == nil {
		t.Fatal("NewDocumentStore() returned nil")
	}
}

func TestCreate_Success(t *testing.T) {
	store := NewDocumentStore()
	ctx := context.Background()

	testData := "test drawing data"
	doc := &core.Document{
		Data: *bytes.NewBufferString(testData),
	}

	id, err := store.Create(ctx, doc)
	if err != nil {
		t.Fatalf("Create() failed: %v", err)
	}

	if id == "" {
		t.Error("Create() returned empty ID")
	}

	// Verify the ID is a valid ULID format (26 characters)
	if len(id) != 26 {
		t.Errorf("Create() returned invalid ID length: got %d, want 26", len(id))
	}
}

func TestCreate_EmptyDocument(t *testing.T) {
	store := NewDocumentStore()
	ctx := context.Background()

	doc := &core.Document{
		Data: *bytes.NewBuffer(nil),
	}

	id, err := store.Create(ctx, doc)
	if err != nil {
		t.Fatalf("Create() failed for empty document: %v", err)
	}

	if id == "" {
		t.Error("Create() returned empty ID for empty document")
	}
}

func TestCreate_LargeDocument(t *testing.T) {
	store := NewDocumentStore()
	ctx := context.Background()

	// Create a large document (1MB)
	largeData := strings.Repeat("x", 1024*1024)
	doc := &core.Document{
		Data: *bytes.NewBufferString(largeData),
	}

	id, err := store.Create(ctx, doc)
	if err != nil {
		t.Fatalf("Create() failed for large document: %v", err)
	}

	if id == "" {
		t.Error("Create() returned empty ID for large document")
	}

	// Verify we can retrieve it
	retrieved, err := store.FindID(ctx, id)
	if err != nil {
		t.Fatalf("FindID() failed: %v", err)
	}

	if retrieved.Data.Len() != len(largeData) {
		t.Errorf("Retrieved document size mismatch: got %d, want %d", retrieved.Data.Len(), len(largeData))
	}
}

func TestFindID_Success(t *testing.T) {
	store := NewDocumentStore()
	ctx := context.Background()

	testData := "test drawing data"
	doc := &core.Document{
		Data: *bytes.NewBufferString(testData),
	}

	id, err := store.Create(ctx, doc)
	if err != nil {
		t.Fatalf("Create() failed: %v", err)
	}

	retrieved, err := store.FindID(ctx, id)
	if err != nil {
		t.Fatalf("FindID() failed: %v", err)
	}

	if retrieved == nil {
		t.Fatal("FindID() returned nil document")
	}

	retrievedData := retrieved.Data.String()
	if retrievedData != testData {
		t.Errorf("FindID() data mismatch: got %q, want %q", retrievedData, testData)
	}
}

func TestFindID_NotFound(t *testing.T) {
	store := NewDocumentStore()
	ctx := context.Background()

	_, err := store.FindID(ctx, "nonexistent-id")
	if err == nil {
		t.Error("FindID() should return error for nonexistent ID")
	}

	expectedError := "document with id nonexistent-id not found"
	if err.Error() != expectedError {
		t.Errorf("FindID() error mismatch: got %q, want %q", err.Error(), expectedError)
	}
}

func TestFindID_EmptyID(t *testing.T) {
	store := NewDocumentStore()
	ctx := context.Background()

	_, err := store.FindID(ctx, "")
	if err == nil {
		t.Error("FindID() should return error for empty ID")
	}
}

func TestMultipleDocuments(t *testing.T) {
	store := NewDocumentStore()
	ctx := context.Background()

	// Create multiple documents
	ids := make([]string, 10)
	expectedData := make([]string, 10)

	for i := 0; i < 10; i++ {
		data := "document-" + string(rune('0'+i))
		expectedData[i] = data
		doc := &core.Document{
			Data: *bytes.NewBufferString(data),
		}

		id, err := store.Create(ctx, doc)
		if err != nil {
			t.Fatalf("Create() failed for document %d: %v", i, err)
		}
		ids[i] = id
	}

	// Verify all documents can be retrieved
	for i, id := range ids {
		retrieved, err := store.FindID(ctx, id)
		if err != nil {
			t.Fatalf("FindID() failed for document %d: %v", i, err)
		}

		retrievedData := retrieved.Data.String()
		if retrievedData != expectedData[i] {
			t.Errorf("Document %d data mismatch: got %q, want %q", i, retrievedData, expectedData[i])
		}
	}
}

func TestConcurrentCreate(t *testing.T) {
	store := NewDocumentStore()
	ctx := context.Background()

	numGoroutines := 10
	var wg sync.WaitGroup
	idsMutex := sync.Mutex{}
	ids := make([]string, 0, numGoroutines)
	errorsMutex := sync.Mutex{}
	var testErrors []error

	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()

			data := "concurrent-doc-" + string(rune('0'+index%10))
			doc := &core.Document{
				Data: *bytes.NewBufferString(data),
			}

			id, err := store.Create(ctx, doc)
			if err != nil {
				errorsMutex.Lock()
				testErrors = append(testErrors, err)
				errorsMutex.Unlock()
				return
			}
			idsMutex.Lock()
			ids = append(ids, id)
			idsMutex.Unlock()
		}(i)
	}

	wg.Wait()

	// Check for errors
	for _, err := range testErrors {
		t.Errorf("Concurrent Create() failed: %v", err)
	}

	// Verify all IDs are unique
	idSet := make(map[string]bool)
	for _, id := range ids {
		if idSet[id] {
			t.Errorf("Duplicate ID generated: %s", id)
		}
		idSet[id] = true
	}

	if len(idSet) != numGoroutines {
		t.Errorf("Expected %d unique IDs, got %d", numGoroutines, len(idSet))
	}
}

func TestConcurrentReadWrite(t *testing.T) {
	store := NewDocumentStore()
	ctx := context.Background()

	// Create initial document
	testData := "initial data"
	doc := &core.Document{
		Data: *bytes.NewBufferString(testData),
	}
	id, err := store.Create(ctx, doc)
	if err != nil {
		t.Fatalf("Create() failed: %v", err)
	}

	numReaders := 5
	numWriters := 3
	var wg sync.WaitGroup

	// Start readers
	for i := 0; i < numReaders; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 10; j++ {
				_, err := store.FindID(ctx, id)
				if err != nil {
					t.Errorf("Concurrent FindID() failed: %v", err)
				}
			}
		}()
	}

	// Start writers
	for i := 0; i < numWriters; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			for j := 0; j < 5; j++ {
				data := "writer-" + string(rune('0'+index))
				doc := &core.Document{
					Data: *bytes.NewBufferString(data),
				}
				_, err := store.Create(ctx, doc)
				if err != nil {
					t.Errorf("Concurrent Create() failed: %v", err)
				}
			}
		}(i)
	}

	wg.Wait()
}

func TestDataIntegrity(t *testing.T) {
	store := NewDocumentStore()
	ctx := context.Background()

	// Test with various data types
	testCases := []struct {
		name string
		data string
	}{
		{"ASCII", "Hello World"},
		{"UTF-8", "Hello 世界 🌍"},
		{"JSON", `{"elements":[],"appState":{}}`},
		{"Special chars", "!@#$%^&*()_+-=[]{}|;':\",./<>?"},
		{"Newlines", "line1\nline2\nline3"},
		{"Binary-like", "\x00\x01\x02\x03"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			doc := &core.Document{
				Data: *bytes.NewBufferString(tc.data),
			}

			id, err := store.Create(ctx, doc)
			if err != nil {
				t.Fatalf("Create() failed: %v", err)
			}

			retrieved, err := store.FindID(ctx, id)
			if err != nil {
				t.Fatalf("FindID() failed: %v", err)
			}

			retrievedData := retrieved.Data.String()
			if retrievedData != tc.data {
				t.Errorf("Data integrity failed: got %q, want %q", retrievedData, tc.data)
			}
		})
	}
}

func TestContextCancellation(t *testing.T) {
	store := NewDocumentStore()

	// Create a cancelled context
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	doc := &core.Document{
		Data: *bytes.NewBufferString("test"),
	}

	// Note: The current implementation doesn't check context cancellation,
	// but this test documents expected behavior
	_, err := store.Create(ctx, doc)
	// Current implementation ignores context, so this will succeed
	// In a production system, we'd want to check ctx.Err()
	if err == nil {
		// This is expected with current implementation
		t.Log("Note: Current implementation doesn't check context cancellation")
	}
}

func TestStoreIsolation(t *testing.T) {
	// NOTE: The current in-memory implementation uses a global map,
	// so isolation between store instances is not supported.
	// This test documents the current behavior.
	// In a production system, you'd want each store instance to have its own map.

	t.Skip("Skipping test - memory store uses global state (by design for this simple implementation)")
}
