package stores

import (
	"excalidraw-server/core"
	"excalidraw-server/stores/filesystem"
	"excalidraw-server/stores/memory"
	"excalidraw-server/stores/sqlite"
	"os"
	"path/filepath"
	"strings"

	"github.com/sirupsen/logrus"
)

const defaultSQLiteFile = "excalidraw.db"

func GetStore() core.DocumentStore {
	storageType := strings.ToLower(strings.TrimSpace(os.Getenv("STORAGE_TYPE")))
	log := logrus.WithField("storageType", storageType)

	switch storageType {
	case "", "sqlite":
		store := buildSQLiteStore()
		if store != nil {
			log.WithField("backend", "sqlite").Info("Use storage")
			return store
		}
		log.WithField("backend", "sqlite").Warn("Falling back to in-memory store")
		return memory.NewDocumentStore()
	case "filesystem":
		basePath := os.Getenv("LOCAL_STORAGE_PATH")
		log.WithFields(logrus.Fields{
			"backend":   "filesystem",
			"base_path": basePath,
		}).Info("Use storage")
		return filesystem.NewDocumentStore(basePath)
	case "memory":
		log.WithField("backend", "memory").Warn("Using non-persistent in-memory store")
		return memory.NewDocumentStore()
	default:
		log.WithField("backend", storageType).Warn("Unknown storage type, defaulting to sqlite")
		store := buildSQLiteStore()
		if store != nil {
			return store
		}
		log.Warn("SQLite initialization failed, falling back to in-memory store")
		return memory.NewDocumentStore()
	}
}

func buildSQLiteStore() core.DocumentStore {
	dataSourceName := strings.TrimSpace(os.Getenv("DATA_SOURCE_NAME"))
	if dataSourceName == "" {
		dataDir := filepath.Join(".", "data")
		if err := os.MkdirAll(dataDir, 0o755); err != nil {
			logrus.WithError(err).Error("Failed to create default data directory")
			return nil
		}
		dataSourceName = filepath.Join(dataDir, defaultSQLiteFile)
	} else {
		dir := filepath.Dir(dataSourceName)
		if dir != "." && dir != "" {
			if err := os.MkdirAll(dir, 0o755); err != nil {
				logrus.WithError(err).Error("Failed to create data directory for sqlite store")
				return nil
			}
		}
	}

	logrus.WithField("dataSourceName", dataSourceName).Info("Initializing sqlite storage")

	// sqlite.NewDocumentStore exits the process on failure, so there is no error to return.
	// We still return nil to signal failure if directory preparation failed earlier.
	return sqlite.NewDocumentStore(dataSourceName)
}
