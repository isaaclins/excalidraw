package snapshots

import (
	"context"
	"encoding/json"
	"excalidraw-server/stores/sqlite"
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/render"
	"github.com/sirupsen/logrus"
)

type (
	CreateSnapshotRequest struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Thumbnail   string `json:"thumbnail"`
		CreatedBy   string `json:"created_by"`
		Data        string `json:"data"`
	}

	CreateSnapshotResponse struct {
		ID string `json:"id"`
	}

	UpdateSnapshotRequest struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}

	UpdateSettingsRequest struct {
		MaxSnapshots     int `json:"max_snapshots"`
		AutoSaveInterval int `json:"auto_save_interval"`
	}

	SnapshotStore interface {
		CreateSnapshot(ctx context.Context, roomID, name, description, thumbnail, createdBy string, data []byte) (string, error)
		ListSnapshots(ctx context.Context, roomID string) ([]sqlite.Snapshot, error)
		GetSnapshot(ctx context.Context, id string) (*sqlite.Snapshot, error)
		DeleteSnapshot(ctx context.Context, id string) error
		UpdateSnapshotMetadata(ctx context.Context, id, name, description string) error
		GetRoomSettings(ctx context.Context, roomID string) (*sqlite.RoomSettings, error)
		UpdateRoomSettings(ctx context.Context, roomID string, maxSnapshots, autoSaveInterval int) error
	}
)

// HandleCreateSnapshot creates a new snapshot for a room
func HandleCreateSnapshot(store SnapshotStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		roomID := chi.URLParam(r, "roomId")

		var req CreateSnapshotRequest
		err := json.NewDecoder(r.Body).Decode(&req)
		if err != nil {
			logrus.WithField("error", err).Error("Failed to decode request")
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		id, err := store.CreateSnapshot(r.Context(), roomID, req.Name, req.Description, req.Thumbnail, req.CreatedBy, []byte(req.Data))
		if err != nil {
			logrus.WithField("error", err).Error("Failed to create snapshot")
			http.Error(w, "Failed to create snapshot", http.StatusInternalServerError)
			return
		}

		render.JSON(w, r, CreateSnapshotResponse{ID: id})
		render.Status(r, http.StatusCreated)
	}
}

// HandleListSnapshots lists all snapshots for a room
func HandleListSnapshots(store SnapshotStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		roomID := chi.URLParam(r, "roomId")

		snapshots, err := store.ListSnapshots(r.Context(), roomID)
		if err != nil {
			logrus.WithField("error", err).Error("Failed to list snapshots")
			http.Error(w, "Failed to list snapshots", http.StatusInternalServerError)
			return
		}

		if snapshots == nil {
			snapshots = []sqlite.Snapshot{}
		}

		render.JSON(w, r, snapshots)
	}
}

// HandleGetSnapshot retrieves a specific snapshot
func HandleGetSnapshot(store SnapshotStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		snapshotID := chi.URLParam(r, "snapshotId")

		snapshot, err := store.GetSnapshot(r.Context(), snapshotID)
		if err != nil {
			logrus.WithField("error", err).Error("Failed to get snapshot")
			http.Error(w, "Snapshot not found", http.StatusNotFound)
			return
		}

		render.JSON(w, r, snapshot)
	}
}

// HandleDeleteSnapshot deletes a snapshot
func HandleDeleteSnapshot(store SnapshotStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		snapshotID := chi.URLParam(r, "snapshotId")

		err := store.DeleteSnapshot(r.Context(), snapshotID)
		if err != nil {
			logrus.WithField("error", err).Error("Failed to delete snapshot")
			http.Error(w, "Failed to delete snapshot", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// HandleUpdateSnapshot updates a snapshot's metadata
func HandleUpdateSnapshot(store SnapshotStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		snapshotID := chi.URLParam(r, "snapshotId")

		var req UpdateSnapshotRequest
		body, err := io.ReadAll(r.Body)
		if err != nil {
			logrus.WithField("error", err).Error("Failed to read request body")
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		err = json.Unmarshal(body, &req)
		if err != nil {
			logrus.WithField("error", err).Error("Failed to decode request")
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		err = store.UpdateSnapshotMetadata(r.Context(), snapshotID, req.Name, req.Description)
		if err != nil {
			logrus.WithField("error", err).Error("Failed to update snapshot")
			http.Error(w, "Failed to update snapshot", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// HandleGetRoomSettings retrieves room settings
func HandleGetRoomSettings(store SnapshotStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		roomID := chi.URLParam(r, "roomId")

		settings, err := store.GetRoomSettings(r.Context(), roomID)
		if err != nil {
			logrus.WithField("error", err).Error("Failed to get room settings")
			http.Error(w, "Failed to get room settings", http.StatusInternalServerError)
			return
		}

		render.JSON(w, r, settings)
	}
}

// HandleUpdateRoomSettings updates room settings
func HandleUpdateRoomSettings(store SnapshotStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		roomID := chi.URLParam(r, "roomId")

		var req UpdateSettingsRequest
		err := json.NewDecoder(r.Body).Decode(&req)
		if err != nil {
			logrus.WithField("error", err).Error("Failed to decode request")
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Validate settings
		if req.MaxSnapshots < 1 {
			req.MaxSnapshots = 10
		}
		if req.AutoSaveInterval < 60 {
			req.AutoSaveInterval = 300
		}

		err = store.UpdateRoomSettings(r.Context(), roomID, req.MaxSnapshots, req.AutoSaveInterval)
		if err != nil {
			logrus.WithField("error", err).Error("Failed to update room settings")
			http.Error(w, "Failed to update room settings", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// HandleListRoomsWithSnapshots lists all rooms that have snapshots
func HandleListRoomsWithSnapshots(db interface {
	Query(query string, args ...interface{}) (interface{}, error)
}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type RoomInfo struct {
			RoomID        string `json:"room_id"`
			SnapshotCount int    `json:"snapshot_count"`
		}

		// This would need proper implementation with the actual DB interface
		// For now, return empty array
		render.JSON(w, r, []RoomInfo{})
	}
}

// HandleGetSnapshotCount returns the count of snapshots for a room
func HandleGetSnapshotCount(store SnapshotStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		roomID := chi.URLParam(r, "roomId")

		snapshots, err := store.ListSnapshots(r.Context(), roomID)
		if err != nil {
			logrus.WithField("error", err).Error("Failed to list snapshots")
			http.Error(w, "Failed to get snapshot count", http.StatusInternalServerError)
			return
		}

		count := len(snapshots)
		render.JSON(w, r, map[string]int{"count": count})
	}
}

// ParseIntParam parses an integer parameter from URL
func ParseIntParam(r *http.Request, param string, defaultValue int) int {
	value := chi.URLParam(r, param)
	if value == "" {
		return defaultValue
	}

	intValue, err := strconv.Atoi(value)
	if err != nil {
		return defaultValue
	}

	return intValue
}
