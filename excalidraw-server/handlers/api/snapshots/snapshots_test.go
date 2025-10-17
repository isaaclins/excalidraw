package snapshots

import (
	"bytes"
	"context"
	"encoding/json"
	"excalidraw-server/stores/sqlite"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

// Mock snapshot store for testing
type mockSnapshotStore struct {
	snapshots     map[string]*sqlite.Snapshot
	roomSnapshots map[string][]string // roomID -> []snapshotIDs
	roomSettings  map[string]*sqlite.RoomSettings
	createErr     error
	listErr       error
	getErr        error
	deleteErr     error
	updateErr     error
	settingsErr   error
}

func newMockSnapshotStore() *mockSnapshotStore {
	return &mockSnapshotStore{
		snapshots:     make(map[string]*sqlite.Snapshot),
		roomSnapshots: make(map[string][]string),
		roomSettings:  make(map[string]*sqlite.RoomSettings),
	}
}

func (m *mockSnapshotStore) CreateSnapshot(ctx context.Context, roomID, name, description, thumbnail, createdBy string, data []byte) (string, error) {
	if m.createErr != nil {
		return "", m.createErr
	}
	id := fmt.Sprintf("snapshot-%d", len(m.snapshots))
	snapshot := &sqlite.Snapshot{
		ID:          id,
		RoomID:      roomID,
		Name:        name,
		Description: description,
		Thumbnail:   thumbnail,
		CreatedBy:   createdBy,
		CreatedAt:   123456789,
		Data:        data,
	}
	m.snapshots[id] = snapshot
	m.roomSnapshots[roomID] = append(m.roomSnapshots[roomID], id)
	return id, nil
}

func (m *mockSnapshotStore) ListSnapshots(ctx context.Context, roomID string) ([]sqlite.Snapshot, error) {
	if m.listErr != nil {
		return nil, m.listErr
	}
	ids, exists := m.roomSnapshots[roomID]
	if !exists {
		return []sqlite.Snapshot{}, nil
	}
	result := make([]sqlite.Snapshot, 0, len(ids))
	for _, id := range ids {
		if snapshot, ok := m.snapshots[id]; ok {
			result = append(result, *snapshot)
		}
	}
	return result, nil
}

func (m *mockSnapshotStore) GetSnapshot(ctx context.Context, id string) (*sqlite.Snapshot, error) {
	if m.getErr != nil {
		return nil, m.getErr
	}
	snapshot, exists := m.snapshots[id]
	if !exists {
		return nil, fmt.Errorf("snapshot with id %s not found", id)
	}
	return snapshot, nil
}

func (m *mockSnapshotStore) DeleteSnapshot(ctx context.Context, id string) error {
	if m.deleteErr != nil {
		return m.deleteErr
	}
	snapshot, exists := m.snapshots[id]
	if !exists {
		return fmt.Errorf("snapshot with id %s not found", id)
	}
	delete(m.snapshots, id)
	// Remove from room snapshots
	roomID := snapshot.RoomID
	ids := m.roomSnapshots[roomID]
	for i, sid := range ids {
		if sid == id {
			m.roomSnapshots[roomID] = append(ids[:i], ids[i+1:]...)
			break
		}
	}
	return nil
}

func (m *mockSnapshotStore) UpdateSnapshotMetadata(ctx context.Context, id, name, description string) error {
	if m.updateErr != nil {
		return m.updateErr
	}
	snapshot, exists := m.snapshots[id]
	if !exists {
		return fmt.Errorf("snapshot with id %s not found", id)
	}
	snapshot.Name = name
	snapshot.Description = description
	return nil
}

func (m *mockSnapshotStore) GetRoomSettings(ctx context.Context, roomID string) (*sqlite.RoomSettings, error) {
	if m.settingsErr != nil {
		return nil, m.settingsErr
	}
	settings, exists := m.roomSettings[roomID]
	if !exists {
		// Return defaults
		return &sqlite.RoomSettings{
			RoomID:           roomID,
			MaxSnapshots:     10,
			AutoSaveInterval: 300,
		}, nil
	}
	return settings, nil
}

func (m *mockSnapshotStore) UpdateRoomSettings(ctx context.Context, roomID string, maxSnapshots, autoSaveInterval int) error {
	if m.settingsErr != nil {
		return m.settingsErr
	}
	m.roomSettings[roomID] = &sqlite.RoomSettings{
		RoomID:           roomID,
		MaxSnapshots:     maxSnapshots,
		AutoSaveInterval: autoSaveInterval,
	}
	return nil
}

func TestHandleCreateSnapshot_Success(t *testing.T) {
	store := newMockSnapshotStore()
	handler := HandleCreateSnapshot(store)

	reqBody := CreateSnapshotRequest{
		Name:        "Test Snapshot",
		Description: "Test Description",
		Thumbnail:   "data:image/png;base64,...",
		CreatedBy:   "user123",
		Data:        `{"elements":[],"appState":{}}`,
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/rooms/room-1/snapshots", bytes.NewReader(body))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("roomId", "room-1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusOK)
	}

	var response CreateSnapshotResponse
	err := json.NewDecoder(rec.Body).Decode(&response)
	if err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if response.ID == "" {
		t.Error("Response ID is empty")
	}
}

func TestHandleCreateSnapshot_InvalidJSON(t *testing.T) {
	store := newMockSnapshotStore()
	handler := HandleCreateSnapshot(store)

	req := httptest.NewRequest(http.MethodPost, "/api/rooms/room-1/snapshots", strings.NewReader("invalid json"))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("roomId", "room-1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestHandleCreateSnapshot_StoreError(t *testing.T) {
	store := newMockSnapshotStore()
	store.createErr = fmt.Errorf("database error")
	handler := HandleCreateSnapshot(store)

	reqBody := CreateSnapshotRequest{
		Name: "Test",
		Data: "data",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/rooms/room-1/snapshots", bytes.NewReader(body))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("roomId", "room-1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusInternalServerError)
	}
}

func TestHandleListSnapshots_Success(t *testing.T) {
	store := newMockSnapshotStore()
	handler := HandleListSnapshots(store)

	// Add some snapshots
	roomID := "room-1"
	store.CreateSnapshot(context.Background(), roomID, "Snap1", "", "", "", []byte("data1"))
	store.CreateSnapshot(context.Background(), roomID, "Snap2", "", "", "", []byte("data2"))

	req := httptest.NewRequest(http.MethodGet, "/api/rooms/"+roomID+"/snapshots", http.NoBody)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("roomId", roomID)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusOK)
	}

	var snapshots []sqlite.Snapshot
	err := json.NewDecoder(rec.Body).Decode(&snapshots)
	if err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if len(snapshots) != 2 {
		t.Errorf("Snapshot count mismatch: got %d, want 2", len(snapshots))
	}
}

func TestHandleListSnapshots_EmptyRoom(t *testing.T) {
	store := newMockSnapshotStore()
	handler := HandleListSnapshots(store)

	req := httptest.NewRequest(http.MethodGet, "/api/rooms/empty-room/snapshots", http.NoBody)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("roomId", "empty-room")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusOK)
	}

	var snapshots []sqlite.Snapshot
	err := json.NewDecoder(rec.Body).Decode(&snapshots)
	if err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if len(snapshots) != 0 {
		t.Errorf("Expected empty array, got %d snapshots", len(snapshots))
	}
}

func TestHandleListSnapshots_StoreError(t *testing.T) {
	store := newMockSnapshotStore()
	store.listErr = fmt.Errorf("database error")
	handler := HandleListSnapshots(store)

	req := httptest.NewRequest(http.MethodGet, "/api/rooms/room-1/snapshots", http.NoBody)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("roomId", "room-1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusInternalServerError)
	}
}

func TestHandleGetSnapshot_Success(t *testing.T) {
	store := newMockSnapshotStore()
	handler := HandleGetSnapshot(store)

	// Create a snapshot
	id, _ := store.CreateSnapshot(context.Background(), "room-1", "Test", "Desc", "", "user1", []byte("data"))

	req := httptest.NewRequest(http.MethodGet, "/api/snapshots/"+id, http.NoBody)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("snapshotId", id)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusOK)
	}

	var snapshot sqlite.Snapshot
	err := json.NewDecoder(rec.Body).Decode(&snapshot)
	if err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if snapshot.ID != id {
		t.Errorf("Snapshot ID mismatch: got %q, want %q", snapshot.ID, id)
	}
	if snapshot.Name != "Test" {
		t.Errorf("Snapshot name mismatch: got %q, want %q", snapshot.Name, "Test")
	}
}

func TestHandleGetSnapshot_NotFound(t *testing.T) {
	store := newMockSnapshotStore()
	handler := HandleGetSnapshot(store)

	req := httptest.NewRequest(http.MethodGet, "/api/snapshots/nonexistent", http.NoBody)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("snapshotId", "nonexistent")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusNotFound)
	}
}

func TestHandleDeleteSnapshot_Success(t *testing.T) {
	store := newMockSnapshotStore()
	handler := HandleDeleteSnapshot(store)

	// Create a snapshot
	id, _ := store.CreateSnapshot(context.Background(), "room-1", "Test", "", "", "", []byte("data"))

	req := httptest.NewRequest(http.MethodDelete, "/api/snapshots/"+id, http.NoBody)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("snapshotId", id)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusNoContent)
	}

	// Verify snapshot is deleted
	_, err := store.GetSnapshot(context.Background(), id)
	if err == nil {
		t.Error("Snapshot should be deleted")
	}
}

func TestHandleDeleteSnapshot_NotFound(t *testing.T) {
	store := newMockSnapshotStore()
	store.deleteErr = fmt.Errorf("not found")
	handler := HandleDeleteSnapshot(store)

	req := httptest.NewRequest(http.MethodDelete, "/api/snapshots/nonexistent", http.NoBody)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("snapshotId", "nonexistent")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusInternalServerError)
	}
}

func TestHandleUpdateSnapshot_Success(t *testing.T) {
	store := newMockSnapshotStore()
	handler := HandleUpdateSnapshot(store)

	// Create a snapshot
	id, _ := store.CreateSnapshot(context.Background(), "room-1", "Original", "Original Desc", "", "", []byte("data"))

	reqBody := UpdateSnapshotRequest{
		Name:        "Updated",
		Description: "Updated Desc",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPut, "/api/snapshots/"+id, bytes.NewReader(body))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("snapshotId", id)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusNoContent)
	}

	// Verify update
	snapshot, _ := store.GetSnapshot(context.Background(), id)
	if snapshot.Name != "Updated" {
		t.Errorf("Name not updated: got %q, want %q", snapshot.Name, "Updated")
	}
}

func TestHandleUpdateSnapshot_InvalidJSON(t *testing.T) {
	store := newMockSnapshotStore()
	handler := HandleUpdateSnapshot(store)

	req := httptest.NewRequest(http.MethodPut, "/api/snapshots/id", strings.NewReader("invalid"))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("snapshotId", "id")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestHandleGetRoomSettings_Success(t *testing.T) {
	store := newMockSnapshotStore()
	handler := HandleGetRoomSettings(store)

	// Set custom settings
	roomID := "room-1"
	store.UpdateRoomSettings(context.Background(), roomID, 20, 600)

	req := httptest.NewRequest(http.MethodGet, "/api/rooms/"+roomID+"/settings", http.NoBody)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("roomId", roomID)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusOK)
	}

	var settings sqlite.RoomSettings
	err := json.NewDecoder(rec.Body).Decode(&settings)
	if err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if settings.MaxSnapshots != 20 {
		t.Errorf("MaxSnapshots mismatch: got %d, want 20", settings.MaxSnapshots)
	}
}

func TestHandleGetRoomSettings_Defaults(t *testing.T) {
	store := newMockSnapshotStore()
	handler := HandleGetRoomSettings(store)

	req := httptest.NewRequest(http.MethodGet, "/api/rooms/new-room/settings", http.NoBody)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("roomId", "new-room")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusOK)
	}

	var settings sqlite.RoomSettings
	err := json.NewDecoder(rec.Body).Decode(&settings)
	if err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if settings.MaxSnapshots != 10 {
		t.Errorf("Default MaxSnapshots mismatch: got %d, want 10", settings.MaxSnapshots)
	}
	if settings.AutoSaveInterval != 300 {
		t.Errorf("Default AutoSaveInterval mismatch: got %d, want 300", settings.AutoSaveInterval)
	}
}

func TestHandleUpdateRoomSettings_Success(t *testing.T) {
	store := newMockSnapshotStore()
	handler := HandleUpdateRoomSettings(store)

	reqBody := UpdateSettingsRequest{
		MaxSnapshots:     25,
		AutoSaveInterval: 900,
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPut, "/api/rooms/room-1/settings", bytes.NewReader(body))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("roomId", "room-1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusNoContent)
	}

	// Verify update
	settings, _ := store.GetRoomSettings(context.Background(), "room-1")
	if settings.MaxSnapshots != 25 {
		t.Errorf("MaxSnapshots not updated: got %d, want 25", settings.MaxSnapshots)
	}
}

func TestHandleUpdateRoomSettings_Validation(t *testing.T) {
	store := newMockSnapshotStore()
	handler := HandleUpdateRoomSettings(store)

	testCases := []struct {
		name                     string
		maxSnapshots             int
		autoSaveInterval         int
		expectedMaxSnapshots     int
		expectedAutoSaveInterval int
	}{
		{"Zero max snapshots", 0, 500, 10, 500},
		{"Negative max snapshots", -5, 500, 10, 500},
		{"Low auto-save interval", 20, 30, 20, 300},
		{"Both invalid", 0, 30, 10, 300},
	}

	for i, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			reqBody := UpdateSettingsRequest{
				MaxSnapshots:     tc.maxSnapshots,
				AutoSaveInterval: tc.autoSaveInterval,
			}
			body, _ := json.Marshal(reqBody)

			roomID := fmt.Sprintf("test-room-%d", i)
			req := httptest.NewRequest(http.MethodPut, "/api/rooms/"+roomID+"/settings", bytes.NewReader(body))
			rctx := chi.NewRouteContext()
			rctx.URLParams.Add("roomId", roomID)
			req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

			rec := httptest.NewRecorder()
			handler(rec, req)

			if rec.Code != http.StatusNoContent {
				t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusNoContent)
			}

			settings, _ := store.GetRoomSettings(context.Background(), roomID)
			if settings.MaxSnapshots != tc.expectedMaxSnapshots {
				t.Errorf("MaxSnapshots mismatch: got %d, want %d", settings.MaxSnapshots, tc.expectedMaxSnapshots)
			}
			if settings.AutoSaveInterval != tc.expectedAutoSaveInterval {
				t.Errorf("AutoSaveInterval mismatch: got %d, want %d", settings.AutoSaveInterval, tc.expectedAutoSaveInterval)
			}
		})
	}
}

func TestHandleGetSnapshotCount_Success(t *testing.T) {
	store := newMockSnapshotStore()
	handler := HandleGetSnapshotCount(store)

	// Create snapshots
	roomID := "room-1"
	store.CreateSnapshot(context.Background(), roomID, "Snap1", "", "", "", []byte("data"))
	store.CreateSnapshot(context.Background(), roomID, "Snap2", "", "", "", []byte("data"))
	store.CreateSnapshot(context.Background(), roomID, "Snap3", "", "", "", []byte("data"))

	req := httptest.NewRequest(http.MethodGet, "/api/rooms/"+roomID+"/snapshots/count", http.NoBody)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("roomId", roomID)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusOK)
	}

	var result map[string]int
	err := json.NewDecoder(rec.Body).Decode(&result)
	if err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if result["count"] != 3 {
		t.Errorf("Count mismatch: got %d, want 3", result["count"])
	}
}

func TestHandleGetSnapshotCount_EmptyRoom(t *testing.T) {
	store := newMockSnapshotStore()
	handler := HandleGetSnapshotCount(store)

	req := httptest.NewRequest(http.MethodGet, "/api/rooms/empty-room/snapshots/count", http.NoBody)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("roomId", "empty-room")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()
	handler(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Status code mismatch: got %d, want %d", rec.Code, http.StatusOK)
	}

	var result map[string]int
	err := json.NewDecoder(rec.Body).Decode(&result)
	if err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if result["count"] != 0 {
		t.Errorf("Count mismatch: got %d, want 0", result["count"])
	}
}

func TestConcurrentSnapshotOperations(t *testing.T) {
	store := newMockSnapshotStore()
	createHandler := HandleCreateSnapshot(store)
	listHandler := HandleListSnapshots(store)

	roomID := "concurrent-room"
	numWorkers := 10
	done := make(chan bool, numWorkers)
	errors := make(chan error, numWorkers*2)

	for i := 0; i < numWorkers; i++ {
		go func(index int) {
			defer func() { done <- true }()

			// Create
			reqBody := CreateSnapshotRequest{
				Name: fmt.Sprintf("Snapshot-%d", index),
				Data: "data",
			}
			body, _ := json.Marshal(reqBody)

			createReq := httptest.NewRequest(http.MethodPost, "/api/rooms/"+roomID+"/snapshots", bytes.NewReader(body))
			rctx := chi.NewRouteContext()
			rctx.URLParams.Add("roomId", roomID)
			createReq = createReq.WithContext(context.WithValue(createReq.Context(), chi.RouteCtxKey, rctx))

			createRec := httptest.NewRecorder()
			createHandler(createRec, createReq)

			if createRec.Code != http.StatusOK {
				errors <- fmt.Errorf("worker %d: create failed with status %d", index, createRec.Code)
				return
			}
		}(i)
	}

	// Wait for all creates
	for i := 0; i < numWorkers; i++ {
		<-done
	}

	// List all snapshots
	listReq := httptest.NewRequest(http.MethodGet, "/api/rooms/"+roomID+"/snapshots", http.NoBody)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("roomId", roomID)
	listReq = listReq.WithContext(context.WithValue(listReq.Context(), chi.RouteCtxKey, rctx))

	listRec := httptest.NewRecorder()
	listHandler(listRec, listReq)

	var snapshots []sqlite.Snapshot
	json.NewDecoder(listRec.Body).Decode(&snapshots)

	if len(snapshots) != numWorkers {
		t.Errorf("Expected %d snapshots, got %d", numWorkers, len(snapshots))
	}

	close(errors)
	for err := range errors {
		t.Error(err)
	}
}
