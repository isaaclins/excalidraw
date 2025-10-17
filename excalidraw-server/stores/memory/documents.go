package memory

import (
	"context"
	"excalidraw-server/core"
	"fmt"
	"sync"

	"github.com/oklog/ulid/v2"
	"github.com/sirupsen/logrus"
)

type documentStore struct {
	mu        sync.RWMutex
	documents map[string]core.Document
}

func NewDocumentStore() core.DocumentStore {
	return &documentStore{
		documents: make(map[string]core.Document),
	}
}

func (s *documentStore) FindID(ctx context.Context, id string) (*core.Document, error) {
	log := logrus.WithField("document_id", id)

	s.mu.RLock()
	doc, ok := s.documents[id]
	s.mu.RUnlock()

	if ok {
		log.Info("Document retrieved successfully")
		return &doc, nil
	}

	log.WithField("error", "document not found").Warn("Document with specified ID not found")
	return nil, fmt.Errorf("document with id %s not found", id)
}

func (s *documentStore) Create(ctx context.Context, document *core.Document) (string, error) {
	id := ulid.Make().String()

	s.mu.Lock()
	s.documents[id] = *document
	s.mu.Unlock()

	log := logrus.WithFields(logrus.Fields{
		"document_id": id,
		"data_length": len(document.Data.Bytes()),
	})
	log.Info("Document created successfully")

	return id, nil
}
