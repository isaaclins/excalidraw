package stores

import (
	"excalidraw-server/core"
	"excalidraw-server/stores/filesystem"
	"excalidraw-server/stores/memory"
	"excalidraw-server/stores/sqlite"
	"os"

	"github.com/sirupsen/logrus"
)

func GetStore() core.DocumentStore {
	storageType := os.Getenv("STORAGE_TYPE")
	var store core.DocumentStore

	storageField := logrus.Fields{
		"storageType": storageType,
	}

	switch storageType {
	case "filesystem":
		basePath := os.Getenv("LOCAL_STORAGE_PATH")
		storageField["basePath"] = basePath
		store = filesystem.NewDocumentStore(basePath)
	case "sqlite":
		dataSourceName := os.Getenv("DATA_SOURCE_NAME")
		storageField["dataSourceName"] = dataSourceName
		store = sqlite.NewDocumentStore(dataSourceName)
	default:
		store = memory.NewDocumentStore()
		storageField["storageType"] = "in-memory"
	}
	logrus.WithFields(storageField).Info("Use storage")
	return store
}
