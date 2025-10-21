package core

import (
	"bytes"
	"context"
)

type (
	Document struct {
		Data bytes.Buffer
	}

	DocumentStore interface {
		FindID(ctx context.Context, id string) (*Document, error)
		Create(ctx context.Context, document *Document) (string, error)
	}

	Room struct {
		ID         string
		LastActive int64
	}

	RoomRegistry interface {
		ListRooms(ctx context.Context) ([]Room, error)
		TouchRoom(ctx context.Context, roomID string) error
	}
)
