package memory

import (
	"context"
	"excalidraw-server/core"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/oklog/ulid/v2"
	"github.com/sirupsen/logrus"
)

type documentStore struct {
	mu        sync.RWMutex
	documents map[string]core.Document
	rooms     map[string]int64
}

func NewDocumentStore() core.DocumentStore {
	return &documentStore{
		documents: make(map[string]core.Document),
		rooms:     make(map[string]int64),
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

func (s *documentStore) TouchRoom(ctx context.Context, roomID string) error {
	if roomID == "" {
		return fmt.Errorf("room id is required")
	}

	s.mu.Lock()
	s.rooms[roomID] = time.Now().UnixMilli()
	s.mu.Unlock()

	return nil
}

func (s *documentStore) ListRooms(ctx context.Context) ([]core.Room, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rooms := make([]core.Room, 0, len(s.rooms))
	for id, last := range s.rooms {
		rooms = append(rooms, core.Room{ID: id, LastActive: last})
	}

	sort.Slice(rooms, func(i, j int) bool {
		if rooms[i].LastActive == rooms[j].LastActive {
			return rooms[i].ID < rooms[j].ID
		}
		return rooms[i].LastActive > rooms[j].LastActive
	})

	return rooms, nil
}

func (s *documentStore) DeleteRoom(ctx context.Context, roomID string) error {
	if roomID == "" {
		return fmt.Errorf("room id is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.rooms, roomID)
	return nil
}
