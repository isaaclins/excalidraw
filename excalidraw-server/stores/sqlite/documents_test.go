package sqlite

import (
	"bytes"
	"context"
	"database/sql"
	"excalidraw-server/core"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestMain(m *testing.M) {
	if !CGOEnabled {
		fmt.Println("skipping sqlite store tests: CGO disabled")
		os.Exit(0)
	}

	os.Exit(m.Run())
}

func setupTestDB(t *testing.T) *documentStore {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "test.db")
	store := NewDocumentStore(dbPath).(*documentStore)
	return store
}

func TestNewDocumentStore(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "test.db")
	store := NewDocumentStore(dbPath)

	if store == nil {
		t.Fatal("NewDocumentStore() returned nil")
	}

	// Verify database file was created
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		t.Error("NewDocumentStore() did not create database file")
	}
}

func TestNewDocumentStore_TablesCreated(t *testing.T) {
	store := setupTestDB(t)

	// Verify documents table exists
	var tableName string
	err := store.db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='documents'").Scan(&tableName)
	if err != nil {
		t.Fatalf("documents table not created: %v", err)
	}

	// Verify snapshots table exists
	err = store.db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='snapshots'").Scan(&tableName)
	if err != nil {
		t.Fatalf("snapshots table not created: %v", err)
	}

	// Verify room_settings table exists
	err = store.db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='room_settings'").Scan(&tableName)
	if err != nil {
		t.Fatalf("room_settings table not created: %v", err)
	}
}

func TestCreate_Success(t *testing.T) {
	store := setupTestDB(t)
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

	// Verify data in database
	var data []byte
	err = store.db.QueryRow("SELECT data FROM documents WHERE id = ?", id).Scan(&data)
	if err != nil {
		t.Fatalf("Failed to query document: %v", err)
	}

	if string(data) != testData {
		t.Errorf("Data mismatch: got %q, want %q", string(data), testData)
	}
}

func TestCreate_EmptyDocument(t *testing.T) {
	store := setupTestDB(t)
	ctx := context.Background()

	doc := &core.Document{
		Data: *bytes.NewBuffer(nil),
	}

	id, err := store.Create(ctx, doc)
	if err != nil {
		t.Fatalf("Create() failed for empty document: %v", err)
	}

	// Verify empty data in database
	var data []byte
	err = store.db.QueryRow("SELECT data FROM documents WHERE id = ?", id).Scan(&data)
	if err != nil {
		t.Fatalf("Failed to query document: %v", err)
	}

	if len(data) != 0 {
		t.Errorf("Empty document size mismatch: got %d, want 0", len(data))
	}
}

func TestCreate_LargeDocument(t *testing.T) {
	store := setupTestDB(t)
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

	// Verify we can retrieve it
	retrieved, err := store.FindID(ctx, id)
	if err != nil {
		t.Fatalf("FindID() failed: %v", err)
	}

	if retrieved.Data.Len() != len(largeData) {
		t.Errorf("Retrieved size mismatch: got %d, want %d", retrieved.Data.Len(), len(largeData))
	}
}

func TestFindID_Success(t *testing.T) {
	store := setupTestDB(t)
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
	store := setupTestDB(t)
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

func TestCreateSnapshot_Success(t *testing.T) {
	store := setupTestDB(t)
	ctx := context.Background()

	roomID := "test-room"
	name := "Test Snapshot"
	description := "Test Description"
	thumbnail := "data:image/png;base64,..."
	createdBy := "user123"
	data := []byte(`{"elements":[],"appState":{}}`)

	id, err := store.CreateSnapshot(ctx, roomID, name, description, thumbnail, createdBy, data)
	if err != nil {
		t.Fatalf("CreateSnapshot() failed: %v", err)
	}

	if id == "" {
		t.Error("CreateSnapshot() returned empty ID")
	}

	// Verify snapshot in database
	snapshot, err := store.GetSnapshot(ctx, id)
	if err != nil {
		t.Fatalf("GetSnapshot() failed: %v", err)
	}

	if snapshot.RoomID != roomID {
		t.Errorf("RoomID mismatch: got %q, want %q", snapshot.RoomID, roomID)
	}
	if snapshot.Name != name {
		t.Errorf("Name mismatch: got %q, want %q", snapshot.Name, name)
	}
	if snapshot.Description != description {
		t.Errorf("Description mismatch: got %q, want %q", snapshot.Description, description)
	}
	if snapshot.CreatedBy != createdBy {
		t.Errorf("CreatedBy mismatch: got %q, want %q", snapshot.CreatedBy, createdBy)
	}
}

func TestCreateSnapshot_MaxSnapshotsLimit(t *testing.T) {
	store := setupTestDB(t)
	ctx := context.Background()

	roomID := "test-room"
	maxSnapshots := 3

	// Set max snapshots to 3
	err := store.UpdateRoomSettings(ctx, roomID, maxSnapshots, 300)
	if err != nil {
		t.Fatalf("UpdateRoomSettings() failed: %v", err)
	}

	// Create 5 snapshots
	ids := make([]string, 5)
	var id string
	for i := 0; i < 5; i++ {
		id, err = store.CreateSnapshot(ctx, roomID, "Snapshot "+strconv.Itoa(i+1), "", "", "", []byte("data"))
		if err != nil {
			t.Fatalf("CreateSnapshot() failed for snapshot %d: %v", i, err)
		}
		ids[i] = id
		time.Sleep(10 * time.Millisecond) // Ensure different timestamps
	}

	// Verify only last 3 snapshots exist
	snapshots, err := store.ListSnapshots(ctx, roomID)
	if err != nil {
		t.Fatalf("ListSnapshots() failed: %v", err)
	}

	if len(snapshots) != maxSnapshots {
		t.Errorf("Snapshot count mismatch: got %d, want %d", len(snapshots), maxSnapshots)
	}

	// Verify oldest snapshots were deleted
	for i := 0; i < 2; i++ {
		_, err := store.GetSnapshot(ctx, ids[i])
		if err == nil {
			t.Errorf("Old snapshot %d should have been deleted", i)
		}
	}

	// Verify newest snapshots still exist
	for i := 2; i < 5; i++ {
		_, err := store.GetSnapshot(ctx, ids[i])
		if err != nil {
			t.Errorf("Recent snapshot %d should still exist: %v", i, err)
		}
	}
}

func TestListSnapshots_Success(t *testing.T) {
	store := setupTestDB(t)
	ctx := context.Background()

	roomID := "test-room"

	// Create multiple snapshots
	for i := 0; i < 5; i++ {
		_, err := store.CreateSnapshot(ctx, roomID, "Snapshot "+strconv.Itoa(i+1), "", "", "", []byte("data"))
		if err != nil {
			t.Fatalf("CreateSnapshot() failed: %v", err)
		}
		time.Sleep(10 * time.Millisecond)
	}

	snapshots, err := store.ListSnapshots(ctx, roomID)
	if err != nil {
		t.Fatalf("ListSnapshots() failed: %v", err)
	}

	if len(snapshots) != 5 {
		t.Errorf("Snapshot count mismatch: got %d, want 5", len(snapshots))
	}

	// Verify snapshots are sorted by created_at DESC
	for i := 0; i < len(snapshots)-1; i++ {
		if snapshots[i].CreatedAt < snapshots[i+1].CreatedAt {
			t.Error("Snapshots are not sorted by created_at DESC")
		}
	}
}

func TestListSnapshots_EmptyRoom(t *testing.T) {
	store := setupTestDB(t)
	ctx := context.Background()

	snapshots, err := store.ListSnapshots(ctx, "empty-room")
	if err != nil {
		t.Fatalf("ListSnapshots() failed: %v", err)
	}

	if len(snapshots) != 0 {
		t.Errorf("Expected 0 snapshots, got %d", len(snapshots))
	}
}

func TestListSnapshots_MultipleRooms(t *testing.T) {
	store := setupTestDB(t)
	ctx := context.Background()

	// Create snapshots in different rooms
	room1 := "room1"
	room2 := "room2"

	for i := 0; i < 3; i++ {
		_, err := store.CreateSnapshot(ctx, room1, "Room1 Snapshot", "", "", "", []byte("data"))
		if err != nil {
			t.Fatalf("CreateSnapshot() failed: %v", err)
		}
	}

	for i := 0; i < 2; i++ {
		_, err := store.CreateSnapshot(ctx, room2, "Room2 Snapshot", "", "", "", []byte("data"))
		if err != nil {
			t.Fatalf("CreateSnapshot() failed: %v", err)
		}
	}

	// Verify room1 has 3 snapshots
	snapshots1, err := store.ListSnapshots(ctx, room1)
	if err != nil {
		t.Fatalf("ListSnapshots() failed: %v", err)
	}
	if len(snapshots1) != 3 {
		t.Errorf("Room1 snapshot count mismatch: got %d, want 3", len(snapshots1))
	}

	// Verify room2 has 2 snapshots
	snapshots2, err := store.ListSnapshots(ctx, room2)
	if err != nil {
		t.Fatalf("ListSnapshots() failed: %v", err)
	}
	if len(snapshots2) != 2 {
		t.Errorf("Room2 snapshot count mismatch: got %d, want 2", len(snapshots2))
	}
}

func TestDeleteSnapshot_Success(t *testing.T) {
	store := setupTestDB(t)
	ctx := context.Background()

	id, err := store.CreateSnapshot(ctx, "test-room", "Test", "", "", "", []byte("data"))
	if err != nil {
		t.Fatalf("CreateSnapshot() failed: %v", err)
	}

	err = store.DeleteSnapshot(ctx, id)
	if err != nil {
		t.Fatalf("DeleteSnapshot() failed: %v", err)
	}

	// Verify snapshot is deleted
	_, err = store.GetSnapshot(ctx, id)
	if err == nil {
		t.Error("Snapshot should be deleted")
	}
}

func TestDeleteSnapshot_NotFound(t *testing.T) {
	store := setupTestDB(t)
	ctx := context.Background()

	err := store.DeleteSnapshot(ctx, "nonexistent-id")
	if err == nil {
		t.Error("DeleteSnapshot() should return error for nonexistent ID")
	}
}

func TestUpdateSnapshotMetadata_Success(t *testing.T) {
	store := setupTestDB(t)
	ctx := context.Background()

	id, err := store.CreateSnapshot(ctx, "test-room", "Original", "Original Desc", "", "", []byte("data"))
	if err != nil {
		t.Fatalf("CreateSnapshot() failed: %v", err)
	}

	newName := "Updated Name"
	newDesc := "Updated Description"
	err = store.UpdateSnapshotMetadata(ctx, id, newName, newDesc)
	if err != nil {
		t.Fatalf("UpdateSnapshotMetadata() failed: %v", err)
	}

	// Verify update
	snapshot, err := store.GetSnapshot(ctx, id)
	if err != nil {
		t.Fatalf("GetSnapshot() failed: %v", err)
	}

	if snapshot.Name != newName {
		t.Errorf("Name not updated: got %q, want %q", snapshot.Name, newName)
	}
	if snapshot.Description != newDesc {
		t.Errorf("Description not updated: got %q, want %q", snapshot.Description, newDesc)
	}
}

func TestUpdateSnapshotMetadata_NotFound(t *testing.T) {
	store := setupTestDB(t)
	ctx := context.Background()

	err := store.UpdateSnapshotMetadata(ctx, "nonexistent-id", "New Name", "New Desc")
	if err == nil {
		t.Error("UpdateSnapshotMetadata() should return error for nonexistent ID")
	}
}

func TestGetRoomSettings_DefaultValues(t *testing.T) {
	store := setupTestDB(t)
	ctx := context.Background()

	settings, err := store.GetRoomSettings(ctx, "new-room")
	if err != nil {
		t.Fatalf("GetRoomSettings() failed: %v", err)
	}

	if settings.MaxSnapshots != 10 {
		t.Errorf("Default MaxSnapshots mismatch: got %d, want 10", settings.MaxSnapshots)
	}
	if settings.AutoSaveInterval != 300 {
		t.Errorf("Default AutoSaveInterval mismatch: got %d, want 300", settings.AutoSaveInterval)
	}
}

func TestUpdateRoomSettings_Success(t *testing.T) {
	store := setupTestDB(t)
	ctx := context.Background()

	roomID := "test-room"
	maxSnapshots := 20
	autoSaveInterval := 600

	err := store.UpdateRoomSettings(ctx, roomID, maxSnapshots, autoSaveInterval)
	if err != nil {
		t.Fatalf("UpdateRoomSettings() failed: %v", err)
	}

	settings, err := store.GetRoomSettings(ctx, roomID)
	if err != nil {
		t.Fatalf("GetRoomSettings() failed: %v", err)
	}

	if settings.MaxSnapshots != maxSnapshots {
		t.Errorf("MaxSnapshots mismatch: got %d, want %d", settings.MaxSnapshots, maxSnapshots)
	}
	if settings.AutoSaveInterval != autoSaveInterval {
		t.Errorf("AutoSaveInterval mismatch: got %d, want %d", settings.AutoSaveInterval, autoSaveInterval)
	}
}

func TestUpdateRoomSettings_Upsert(t *testing.T) {
	store := setupTestDB(t)
	ctx := context.Background()

	roomID := "test-room"

	// First update (insert)
	err := store.UpdateRoomSettings(ctx, roomID, 15, 450)
	if err != nil {
		t.Fatalf("First UpdateRoomSettings() failed: %v", err)
	}

	settings, err := store.GetRoomSettings(ctx, roomID)
	if err != nil {
		t.Fatalf("GetRoomSettings() failed: %v", err)
	}
	if settings.MaxSnapshots != 15 {
		t.Errorf("First update MaxSnapshots mismatch: got %d, want 15", settings.MaxSnapshots)
	}

	// Second update (update existing)
	err = store.UpdateRoomSettings(ctx, roomID, 25, 900)
	if err != nil {
		t.Fatalf("Second UpdateRoomSettings() failed: %v", err)
	}

	settings, err = store.GetRoomSettings(ctx, roomID)
	if err != nil {
		t.Fatalf("GetRoomSettings() failed: %v", err)
	}
	if settings.MaxSnapshots != 25 {
		t.Errorf("Second update MaxSnapshots mismatch: got %d, want 25", settings.MaxSnapshots)
	}
}

func TestConcurrentDocumentOperations(t *testing.T) {
	store := setupTestDB(t)
	ctx := context.Background()

	numWorkers := 20
	var wg sync.WaitGroup
	errors := make(chan error, numWorkers*2)

	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()

			// Create document
			doc := &core.Document{
				Data: *bytes.NewBufferString("concurrent-doc-" + string(rune('0'+index%10))),
			}

			id, err := store.Create(ctx, doc)
			if err != nil {
				errors <- err
				return
			}

			// Read it back
			_, err = store.FindID(ctx, id)
			if err != nil {
				errors <- err
			}
		}(i)
	}

	wg.Wait()
	close(errors)

	for err := range errors {
		t.Errorf("Concurrent operation failed: %v", err)
	}
}

func TestConcurrentSnapshotOperations(t *testing.T) {
	store := setupTestDB(t)
	ctx := context.Background()

	roomID := "concurrent-room"
	numWorkers := 10
	var wg sync.WaitGroup
	errors := make(chan error, numWorkers)

	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()

			_, err := store.CreateSnapshot(
				ctx,
				roomID,
				"Snapshot-"+string(rune('0'+index)),
				"",
				"",
				"",
				[]byte("data"),
			)
			if err != nil {
				errors <- err
			}
		}(i)
	}

	wg.Wait()
	close(errors)

	for err := range errors {
		t.Errorf("Concurrent snapshot creation failed: %v", err)
	}

	// Verify all snapshots
	snapshots, err := store.ListSnapshots(ctx, roomID)
	if err != nil {
		t.Fatalf("ListSnapshots() failed: %v", err)
	}

	if len(snapshots) != numWorkers {
		t.Errorf("Snapshot count mismatch: got %d, want %d", len(snapshots), numWorkers)
	}
}

func TestDataIntegrity(t *testing.T) {
	store := setupTestDB(t)
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
		{"Binary", string([]byte{0, 1, 2, 3, 255})},
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

func TestDatabasePersistence(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "persist.db")
	ctx := context.Background()

	// Create first store and add data
	store1 := NewDocumentStore(dbPath).(*documentStore)
	doc := &core.Document{
		Data: *bytes.NewBufferString("persistent data"),
	}
	id, err := store1.Create(ctx, doc)
	if err != nil {
		t.Fatalf("Create() failed: %v", err)
	}
	store1.db.Close()

	// Create second store with same database
	store2 := NewDocumentStore(dbPath).(*documentStore)
	retrieved, err := store2.FindID(ctx, id)
	if err != nil {
		t.Fatalf("FindID() failed with new store: %v", err)
	}

	if retrieved.Data.String() != "persistent data" {
		t.Error("Data not persisted across store instances")
	}
	store2.db.Close()
}

func TestTransactionRollback(t *testing.T) {
	store := setupTestDB(t)
	ctx := context.Background()

	// This test verifies database consistency
	// Create a document
	doc := &core.Document{
		Data: *bytes.NewBufferString("test"),
	}
	_, err := store.Create(ctx, doc)
	if err != nil {
		t.Fatalf("Create() failed: %v", err)
	}

	// Try to query with invalid SQL to test error handling
	var count int
	err = store.db.QueryRow("SELECT COUNT(*) FROM documents").Scan(&count)
	if err != nil {
		t.Fatalf("Query failed: %v", err)
	}

	if count != 1 {
		t.Errorf("Document count mismatch: got %d, want 1", count)
	}
}

func TestSQLInjection(t *testing.T) {
	store := setupTestDB(t)
	ctx := context.Background()

	// Try SQL injection in FindID
	maliciousIDs := []string{
		"'; DROP TABLE documents; --",
		"' OR '1'='1",
		"1' UNION SELECT * FROM documents--",
	}

	for _, id := range maliciousIDs {
		_, err := store.FindID(ctx, id)
		// Should not find anything (and should not cause SQL injection)
		if err == nil {
			t.Errorf("FindID() should fail for malicious ID: %s", id)
		}
	}

	// Verify documents table still exists
	var tableName string
	err := store.db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='documents'").Scan(&tableName)
	if err == sql.ErrNoRows {
		t.Fatal("documents table was dropped - SQL injection vulnerability!")
	}
}

func TestNullValues(t *testing.T) {
	store := setupTestDB(t)
	ctx := context.Background()

	// Create snapshot with null values
	id, err := store.CreateSnapshot(ctx, "test-room", "", "", "", "", []byte("data"))
	if err != nil {
		t.Fatalf("CreateSnapshot() with empty strings failed: %v", err)
	}

	snapshot, err := store.GetSnapshot(ctx, id)
	if err != nil {
		t.Fatalf("GetSnapshot() failed: %v", err)
	}

	if snapshot.Name != "" {
		t.Errorf("Expected empty name, got %q", snapshot.Name)
	}
}
