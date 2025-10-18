package sqlite

import (
	"bytes"
	"context"
	"excalidraw-server/core"
	"fmt"

	"database/sql"
	stdlog "log"

	_ "github.com/mattn/go-sqlite3"
	"github.com/oklog/ulid/v2"
	"github.com/sirupsen/logrus"
)

type documentStore struct {
	db *sql.DB
}

func NewDocumentStore(dataSourceName string) core.DocumentStore {
	db, err := sql.Open("sqlite3", dataSourceName)

	if err != nil {
		stdlog.Fatal(err)
	}

	// Create documents table
	sts := `CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, data BLOB);`
	_, err = db.Exec(sts)
	if err != nil {
		stdlog.Fatal(err)
	}

	// Create snapshots table
	snapshotsTable := `CREATE TABLE IF NOT EXISTS snapshots (
		id TEXT PRIMARY KEY,
		room_id TEXT NOT NULL,
		name TEXT,
		description TEXT,
		thumbnail TEXT,
		created_by TEXT,
		created_at INTEGER NOT NULL,
		data BLOB NOT NULL
	);`
	_, err = db.Exec(snapshotsTable)
	if err != nil {
		stdlog.Fatal(err)
	}

	// Create room_settings table
	settingsTable := `CREATE TABLE IF NOT EXISTS room_settings (
		room_id TEXT PRIMARY KEY,
		max_snapshots INTEGER DEFAULT 10,
		auto_save_interval INTEGER DEFAULT 300
	);`
	_, err = db.Exec(settingsTable)
	if err != nil {
		stdlog.Fatal(err)
	}

	return &documentStore{db}
}

func (s *documentStore) FindID(ctx context.Context, id string) (*core.Document, error) {
	log := logrus.WithField("document_id", id)
	log.Debug("Retrieving document by ID")
	var data []byte
	err := s.db.QueryRowContext(ctx, "SELECT data FROM documents WHERE id = ?", id).Scan(&data)
	if err != nil {
		if err == sql.ErrNoRows {
			log.WithField("error", "document not found").Warn("Document with specified ID not found")
			return nil, fmt.Errorf("document with id %s not found", id)
		}
		log.WithField("error", err).Error("Failed to retrieve document")
		return nil, err
	}
	document := core.Document{
		Data: *bytes.NewBuffer(data),
	}
	log.Info("Document retrieved successfully")
	return &document, nil
}

func (s *documentStore) Create(ctx context.Context, document *core.Document) (string, error) {
	id := ulid.Make().String()
	data := document.Data.Bytes()
	log := logrus.WithFields(logrus.Fields{
		"document_id": id,
		"data_length": len(data),
	})

	_, err := s.db.ExecContext(ctx, "INSERT INTO documents (id, data) VALUES (?, ?)", id, data)
	if err != nil {
		log.WithField("error", err).Error("Failed to create document")
		return "", err
	}
	log.Info("Document created successfully")
	return id, nil
}

// Snapshot represents a room snapshot
type Snapshot struct {
	ID          string `json:"id"`
	RoomID      string `json:"room_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Thumbnail   string `json:"thumbnail"`
	CreatedBy   string `json:"created_by"`
	CreatedAt   int64  `json:"created_at"`
	Data        []byte `json:"data,omitempty"`
}

// RoomSettings represents settings for a room
type RoomSettings struct {
	RoomID           string `json:"room_id"`
	MaxSnapshots     int    `json:"max_snapshots"`
	AutoSaveInterval int    `json:"auto_save_interval"`
}

// CreateSnapshot creates a new snapshot for a room
func (s *documentStore) CreateSnapshot(ctx context.Context, roomID, name, description, thumbnail, createdBy string, data []byte) (string, error) {
	id := ulid.Make().String()
	createdAt := ulid.Now()

	log := logrus.WithFields(logrus.Fields{
		"snapshot_id": id,
		"room_id":     roomID,
		"data_length": len(data),
	})

	// Check room settings for max snapshots
	settings, err := s.GetRoomSettings(ctx, roomID)
	if err != nil {
		// If no settings exist, create default
		settings = &RoomSettings{
			RoomID:           roomID,
			MaxSnapshots:     10,
			AutoSaveInterval: 300,
		}
	}

	// Count existing snapshots
	var count int
	err = s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM snapshots WHERE room_id = ?", roomID).Scan(&count)
	if err != nil {
		log.WithField("error", err).Error("Failed to count snapshots")
		return "", err
	}

	// If at limit, delete oldest snapshot
	if count >= settings.MaxSnapshots {
		_, err = s.db.ExecContext(ctx,
			"DELETE FROM snapshots WHERE id = (SELECT id FROM snapshots WHERE room_id = ? ORDER BY created_at ASC LIMIT 1)",
			roomID)
		if err != nil {
			log.WithField("error", err).Error("Failed to delete oldest snapshot")
		}
	}

	// Insert new snapshot
	_, err = s.db.ExecContext(ctx,
		"INSERT INTO snapshots (id, room_id, name, description, thumbnail, created_by, created_at, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		id, roomID, name, description, thumbnail, createdBy, createdAt, data)
	if err != nil {
		log.WithField("error", err).Error("Failed to create snapshot")
		return "", err
	}

	log.Info("Snapshot created successfully")
	return id, nil
}

// ListSnapshots lists all snapshots for a room
func (s *documentStore) ListSnapshots(ctx context.Context, roomID string) ([]Snapshot, error) {
	log := logrus.WithField("room_id", roomID)
	log.Debug("Listing snapshots for room")

	rows, err := s.db.QueryContext(ctx,
		"SELECT id, room_id, name, description, thumbnail, created_by, created_at FROM snapshots WHERE room_id = ? ORDER BY created_at DESC",
		roomID)
	if err != nil {
		log.WithField("error", err).Error("Failed to list snapshots")
		return nil, err
	}
	defer func() {
		if cerr := rows.Close(); cerr != nil {
			log.WithError(cerr).Warn("Failed to close snapshot rows")
		}
	}()

	var snapshots []Snapshot
	for rows.Next() {
		var snapshot Snapshot
		var name, description, thumbnail, createdBy sql.NullString
		err = rows.Scan(&snapshot.ID, &snapshot.RoomID, &name, &description, &thumbnail, &createdBy, &snapshot.CreatedAt)
		if err != nil {
			log.WithField("error", err).Error("Failed to scan snapshot")
			continue
		}
		snapshot.Name = name.String
		snapshot.Description = description.String
		snapshot.Thumbnail = thumbnail.String
		snapshot.CreatedBy = createdBy.String
		snapshots = append(snapshots, snapshot)
	}

	log.Info("Snapshots listed successfully")
	return snapshots, nil
}

// GetSnapshot retrieves a specific snapshot by ID
func (s *documentStore) GetSnapshot(ctx context.Context, id string) (*Snapshot, error) {
	log := logrus.WithField("snapshot_id", id)
	log.Debug("Retrieving snapshot by ID")

	var snapshot Snapshot
	var name, description, thumbnail, createdBy sql.NullString
	err := s.db.QueryRowContext(ctx,
		"SELECT id, room_id, name, description, thumbnail, created_by, created_at, data FROM snapshots WHERE id = ?",
		id).Scan(&snapshot.ID, &snapshot.RoomID, &name, &description, &thumbnail, &createdBy, &snapshot.CreatedAt, &snapshot.Data)
	if err != nil {
		if err == sql.ErrNoRows {
			log.WithField("error", "snapshot not found").Warn("Snapshot with specified ID not found")
			return nil, fmt.Errorf("snapshot with id %s not found", id)
		}
		log.WithField("error", err).Error("Failed to retrieve snapshot")
		return nil, err
	}

	snapshot.Name = name.String
	snapshot.Description = description.String
	snapshot.Thumbnail = thumbnail.String
	snapshot.CreatedBy = createdBy.String

	log.Info("Snapshot retrieved successfully")
	return &snapshot, nil
}

// DeleteSnapshot deletes a snapshot by ID
func (s *documentStore) DeleteSnapshot(ctx context.Context, id string) error {
	log := logrus.WithField("snapshot_id", id)
	log.Debug("Deleting snapshot")

	result, err := s.db.ExecContext(ctx, "DELETE FROM snapshots WHERE id = ?", id)
	if err != nil {
		log.WithField("error", err).Error("Failed to delete snapshot")
		return err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("snapshot with id %s not found", id)
	}

	log.Info("Snapshot deleted successfully")
	return nil
}

// UpdateSnapshotMetadata updates a snapshot's name and description
func (s *documentStore) UpdateSnapshotMetadata(ctx context.Context, id, name, description string) error {
	log := logrus.WithField("snapshot_id", id)
	log.Debug("Updating snapshot metadata")

	result, err := s.db.ExecContext(ctx,
		"UPDATE snapshots SET name = ?, description = ? WHERE id = ?",
		name, description, id)
	if err != nil {
		log.WithField("error", err).Error("Failed to update snapshot metadata")
		return err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("snapshot with id %s not found", id)
	}

	log.Info("Snapshot metadata updated successfully")
	return nil
}

// GetRoomSettings retrieves settings for a room
func (s *documentStore) GetRoomSettings(ctx context.Context, roomID string) (*RoomSettings, error) {
	log := logrus.WithField("room_id", roomID)
	log.Debug("Retrieving room settings")

	var settings RoomSettings
	err := s.db.QueryRowContext(ctx,
		"SELECT room_id, max_snapshots, auto_save_interval FROM room_settings WHERE room_id = ?",
		roomID).Scan(&settings.RoomID, &settings.MaxSnapshots, &settings.AutoSaveInterval)
	if err != nil {
		if err == sql.ErrNoRows {
			log.Debug("No settings found for room, returning defaults")
			return &RoomSettings{
				RoomID:           roomID,
				MaxSnapshots:     10,
				AutoSaveInterval: 300,
			}, nil
		}
		log.WithField("error", err).Error("Failed to retrieve room settings")
		return nil, err
	}

	log.Info("Room settings retrieved successfully")
	return &settings, nil
}

// UpdateRoomSettings updates settings for a room
func (s *documentStore) UpdateRoomSettings(ctx context.Context, roomID string, maxSnapshots, autoSaveInterval int) error {
	log := logrus.WithFields(logrus.Fields{
		"room_id":            roomID,
		"max_snapshots":      maxSnapshots,
		"auto_save_interval": autoSaveInterval,
	})
	log.Debug("Updating room settings")

	_, err := s.db.ExecContext(ctx,
		"INSERT INTO room_settings (room_id, max_snapshots, auto_save_interval) VALUES (?, ?, ?) ON CONFLICT(room_id) DO UPDATE SET max_snapshots = ?, auto_save_interval = ?",
		roomID, maxSnapshots, autoSaveInterval, maxSnapshots, autoSaveInterval)
	if err != nil {
		log.WithField("error", err).Error("Failed to update room settings")
		return err
	}

	log.Info("Room settings updated successfully")
	return nil
}
