package filesystem

import (
	"bytes"
	"context"
	"excalidraw-server/core"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestNewDocumentStore(t *testing.T) {
	tempDir := t.TempDir()
	store := NewDocumentStore(tempDir)

	if store == nil {
		t.Fatal("NewDocumentStore() returned nil")
	}

	// Verify directory was created
	if _, err := os.Stat(tempDir); os.IsNotExist(err) {
		t.Error("NewDocumentStore() did not create base directory")
	}
}

func TestNewDocumentStore_CreatesDirectory(t *testing.T) {
	tempDir := filepath.Join(t.TempDir(), "nested", "path", "test")
	store := NewDocumentStore(tempDir)

	if store == nil {
		t.Fatal("NewDocumentStore() returned nil")
	}

	// Verify nested directory was created
	if _, err := os.Stat(tempDir); os.IsNotExist(err) {
		t.Error("NewDocumentStore() did not create nested directory structure")
	}
}

func TestCreate_Success(t *testing.T) {
	tempDir := t.TempDir()
	store := NewDocumentStore(tempDir)
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

	// Verify file was created
	filePath := filepath.Join(tempDir, id)
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		t.Error("Create() did not create file on disk")
	}
}

func TestCreate_EmptyDocument(t *testing.T) {
	tempDir := t.TempDir()
	store := NewDocumentStore(tempDir)
	ctx := context.Background()

	doc := &core.Document{
		Data: *bytes.NewBuffer(nil),
	}

	id, err := store.Create(ctx, doc)
	if err != nil {
		t.Fatalf("Create() failed for empty document: %v", err)
	}

	// Verify empty file exists
	filePath := filepath.Join(tempDir, id)
	info, err := os.Stat(filePath)
	if err != nil {
		t.Fatalf("Empty file not created: %v", err)
	}

	if info.Size() != 0 {
		t.Errorf("Empty file size mismatch: got %d, want 0", info.Size())
	}
}

func TestCreate_LargeDocument(t *testing.T) {
	tempDir := t.TempDir()
	store := NewDocumentStore(tempDir)
	ctx := context.Background()

	// Create a large document (5MB)
	largeData := strings.Repeat("x", 5*1024*1024)
	doc := &core.Document{
		Data: *bytes.NewBufferString(largeData),
	}

	id, err := store.Create(ctx, doc)
	if err != nil {
		t.Fatalf("Create() failed for large document: %v", err)
	}

	// Verify file size
	filePath := filepath.Join(tempDir, id)
	info, err := os.Stat(filePath)
	if err != nil {
		t.Fatalf("File not created: %v", err)
	}

	if info.Size() != int64(len(largeData)) {
		t.Errorf("File size mismatch: got %d, want %d", info.Size(), len(largeData))
	}

	// Verify we can read it back
	retrieved, err := store.FindID(ctx, id)
	if err != nil {
		t.Fatalf("FindID() failed: %v", err)
	}

	if retrieved.Data.Len() != len(largeData) {
		t.Errorf("Retrieved size mismatch: got %d, want %d", retrieved.Data.Len(), len(largeData))
	}
}

func TestFindID_Success(t *testing.T) {
	tempDir := t.TempDir()
	store := NewDocumentStore(tempDir)
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
	tempDir := t.TempDir()
	store := NewDocumentStore(tempDir)
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

func TestFindID_PathTraversal(t *testing.T) {
	tempDir := t.TempDir()
	store := NewDocumentStore(tempDir)
	ctx := context.Background()

	// Try to access files outside the base directory
	testCases := []string{
		"../etc/passwd",
		"../../secret",
		"..\\..\\windows\\system32",
		"/etc/passwd",
		"C:\\Windows\\System32",
	}

	for _, id := range testCases {
		t.Run(id, func(t *testing.T) {
			_, err := store.FindID(ctx, id)
			if err == nil {
				t.Error("FindID() should fail for path traversal attempt")
			}
		})
	}
}

func TestDataPersistence(t *testing.T) {
	tempDir := t.TempDir()
	ctx := context.Background()

	// Create document with first store instance
	testData := "persistent data"
	doc := &core.Document{
		Data: *bytes.NewBufferString(testData),
	}

	store1 := NewDocumentStore(tempDir)
	id, err := store1.Create(ctx, doc)
	if err != nil {
		t.Fatalf("Create() failed: %v", err)
	}

	// Create new store instance pointing to same directory
	store2 := NewDocumentStore(tempDir)
	retrieved, err := store2.FindID(ctx, id)
	if err != nil {
		t.Fatalf("FindID() failed with new store instance: %v", err)
	}

	retrievedData := retrieved.Data.String()
	if retrievedData != testData {
		t.Errorf("Data persistence failed: got %q, want %q", retrievedData, testData)
	}
}

func TestMultipleDocuments(t *testing.T) {
	tempDir := t.TempDir()
	store := NewDocumentStore(tempDir)
	ctx := context.Background()

	numDocs := 20
	ids := make([]string, numDocs)
	expectedData := make([]string, numDocs)

	// Create multiple documents
	for i := 0; i < numDocs; i++ {
		data := "document-" + string(rune('A'+i))
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

	// Verify all documents exist
	files, err := os.ReadDir(tempDir)
	if err != nil {
		t.Fatalf("ReadDir() failed: %v", err)
	}

	if len(files) != numDocs {
		t.Errorf("File count mismatch: got %d, want %d", len(files), numDocs)
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
	tempDir := t.TempDir()
	store := NewDocumentStore(tempDir)
	ctx := context.Background()

	numGoroutines := 50
	var wg sync.WaitGroup
	ids := make(chan string, numGoroutines)
	errors := make(chan error, numGoroutines)

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
				errors <- err
				return
			}
			ids <- id
		}(i)
	}

	wg.Wait()
	close(ids)
	close(errors)

	// Check for errors
	for err := range errors {
		t.Errorf("Concurrent Create() failed: %v", err)
	}

	// Verify all IDs are unique
	idSet := make(map[string]bool)
	for id := range ids {
		if idSet[id] {
			t.Errorf("Duplicate ID generated: %s", id)
		}
		idSet[id] = true
	}

	if len(idSet) != numGoroutines {
		t.Errorf("Expected %d unique IDs, got %d", numGoroutines, len(idSet))
	}

	// Verify all files exist
	files, err := os.ReadDir(tempDir)
	if err != nil {
		t.Fatalf("ReadDir() failed: %v", err)
	}

	if len(files) != numGoroutines {
		t.Errorf("File count mismatch: got %d, want %d", len(files), numGoroutines)
	}
}

func TestConcurrentReadWrite(t *testing.T) {
	tempDir := t.TempDir()
	store := NewDocumentStore(tempDir)
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

	numReaders := 20
	numWriters := 10
	var wg sync.WaitGroup
	errors := make(chan error, numReaders+numWriters)

	// Start readers
	for i := 0; i < numReaders; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 10; j++ {
				_, err := store.FindID(ctx, id)
				if err != nil {
					errors <- err
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
					errors <- err
				}
			}
		}(i)
	}

	wg.Wait()
	close(errors)

	// Check for errors
	for err := range errors {
		t.Errorf("Concurrent operation failed: %v", err)
	}
}

func TestDataIntegrity(t *testing.T) {
	tempDir := t.TempDir()
	store := NewDocumentStore(tempDir)
	ctx := context.Background()

	testCases := []struct {
		name string
		data string
	}{
		{"ASCII", "Hello World"},
		{"UTF-8", "Hello 世界 🌍"},
		{"JSON", `{"elements":[],"appState":{}}`},
		{"Special chars", "!@#$%^&*()_+-=[]{}|;':\",./<>?"},
		{"Newlines", "line1\nline2\nline3"},
		{"Tabs", "col1\tcol2\tcol3"},
		{"Mixed", "Hello\nWorld\t世界\n🌍"},
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

func TestFilePermissions(t *testing.T) {
	tempDir := t.TempDir()
	store := NewDocumentStore(tempDir)
	ctx := context.Background()

	doc := &core.Document{
		Data: *bytes.NewBufferString("test data"),
	}

	id, err := store.Create(ctx, doc)
	if err != nil {
		t.Fatalf("Create() failed: %v", err)
	}

	filePath := filepath.Join(tempDir, id)
	info, err := os.Stat(filePath)
	if err != nil {
		t.Fatalf("Stat() failed: %v", err)
	}

	// Check file permissions (0644)
	expectedPerms := os.FileMode(0644)
	actualPerms := info.Mode().Perm()
	if actualPerms != expectedPerms {
		t.Errorf("File permissions mismatch: got %o, want %o", actualPerms, expectedPerms)
	}
}

func TestReadOnlyDirectory(t *testing.T) {
	if os.Getuid() == 0 {
		t.Skip("Skipping test when running as root")
	}

	tempDir := t.TempDir()

	// Make directory read-only
	err := os.Chmod(tempDir, 0444)
	if err != nil {
		t.Fatalf("Chmod() failed: %v", err)
	}
	defer os.Chmod(tempDir, 0755) // Restore permissions for cleanup

	store := NewDocumentStore(tempDir)
	ctx := context.Background()

	doc := &core.Document{
		Data: *bytes.NewBufferString("test data"),
	}

	_, err = store.Create(ctx, doc)
	if err == nil {
		t.Error("Create() should fail on read-only directory")
	}
}

func TestDiskSpace(t *testing.T) {
	// This test verifies behavior when disk is full
	// In practice, this is hard to test without special setup
	// We'll just document expected behavior
	tempDir := t.TempDir()
	store := NewDocumentStore(tempDir)
	ctx := context.Background()

	// Create a very large document
	// On systems with limited disk space, this might fail
	largeData := strings.Repeat("x", 100*1024*1024) // 100MB
	doc := &core.Document{
		Data: *bytes.NewBufferString(largeData),
	}

	_, err := store.Create(ctx, doc)
	// We don't assert error here because it depends on available disk space
	// Just log the result
	if err != nil {
		t.Logf("Large file creation failed (expected on low disk space): %v", err)
	}
}
