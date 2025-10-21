package main

import (
	"encoding/json"
	"excalidraw-server/core"
	"excalidraw-server/handlers/api/documents"
	"excalidraw-server/handlers/api/snapshots"
	"excalidraw-server/handlers/websocket"
	"excalidraw-server/stores"
	"flag"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"sort"
	"syscall"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/sirupsen/logrus"
	socketio "github.com/zishang520/socket.io/v2/socket"
)

func setupRouter(documentStore core.DocumentStore, roomRegistry core.RoomRegistry) *chi.Mux {
	r := chi.NewRouter()
	r.Use(middleware.Logger)

	corsOptions := cors.Options{
		AllowedOrigins: []string{"tauri://localhost"},
		AllowOriginFunc: func(r *http.Request, origin string) bool {
			if origin == "" {
				return false
			}

			parsed, err := url.Parse(origin)
			if err != nil {
				return false
			}

			switch parsed.Scheme {
			case "http", "https":
				switch parsed.Hostname() {
				case "localhost", "127.0.0.1", "[::1]":
					return true
				}
			case "tauri":
				return parsed.Hostname() == "localhost"
			}

			return false
		},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "Content-Length"},
		AllowCredentials: true,
		MaxAge:           300,
	}

	r.Use(cors.Handler(corsOptions))

	r.Route("/api/v2", func(r chi.Router) {
		r.Post("/post/", documents.HandleCreate(documentStore))
		r.Route("/{id}", func(r chi.Router) {
			r.Get("/", documents.HandleGet(documentStore))
		})
	})

	r.Get("/api/rooms", func(w http.ResponseWriter, r *http.Request) {
		activeRooms := websocket.GetActiveRooms()
		roomMap := make(map[string]*struct {
			ID         string `json:"id"`
			Users      int    `json:"users"`
			LastActive *int64 `json:"lastActive,omitempty"`
		})

		for id, count := range activeRooms {
			roomMap[id] = &struct {
				ID         string `json:"id"`
				Users      int    `json:"users"`
				LastActive *int64 `json:"lastActive,omitempty"`
			}{
				ID:    id,
				Users: count,
			}
		}

		if roomRegistry != nil {
			if storedRooms, err := roomRegistry.ListRooms(r.Context()); err != nil {
				logrus.WithError(err).Warn("failed to list rooms from registry")
			} else {
				for _, room := range storedRooms {
					entry, exists := roomMap[room.ID]
					if !exists {
						entry = &struct {
							ID         string `json:"id"`
							Users      int    `json:"users"`
							LastActive *int64 `json:"lastActive,omitempty"`
						}{ID: room.ID}
						roomMap[room.ID] = entry
					}

					if room.LastActive > 0 {
						lastActive := room.LastActive
						entry.LastActive = &lastActive
					}
				}
			}
		}

		roomList := make([]struct {
			ID         string `json:"id"`
			Users      int    `json:"users"`
			LastActive *int64 `json:"lastActive,omitempty"`
		}, 0, len(roomMap))
		for _, entry := range roomMap {
			roomList = append(roomList, *entry)
		}

		sort.Slice(roomList, func(i, j int) bool {
			if roomList[i].Users == roomList[j].Users {
				li := int64(0)
				if roomList[i].LastActive != nil {
					li = *roomList[i].LastActive
				}
				lj := int64(0)
				if roomList[j].LastActive != nil {
					lj = *roomList[j].LastActive
				}
				if li == lj {
					return roomList[i].ID < roomList[j].ID
				}
				return li > lj
			}
			return roomList[i].Users > roomList[j].Users
		})

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(roomList); err != nil {
			http.Error(w, "failed to encode response", http.StatusInternalServerError)
		}
	})

	// Snapshot API routes - only available with SQLite store
	if snapshotStore, ok := documentStore.(snapshots.SnapshotStore); ok {
		r.Route("/api/rooms/{roomId}/snapshots", func(r chi.Router) {
			r.Post("/", snapshots.HandleCreateSnapshot(snapshotStore))
			r.Get("/", snapshots.HandleListSnapshots(snapshotStore))
			r.Get("/count", snapshots.HandleGetSnapshotCount(snapshotStore))
		})

		r.Route("/api/rooms/{roomId}/autosave", func(r chi.Router) {
			r.Put("/", snapshots.HandleUpsertAutosaveSnapshot(snapshotStore))
		})

		r.Route("/api/rooms/{roomId}", func(r chi.Router) {
			r.Delete("/", snapshots.HandleDeleteRoom(snapshotStore))
		})

		r.Route("/api/snapshots/{snapshotId}", func(r chi.Router) {
			r.Get("/", snapshots.HandleGetSnapshot(snapshotStore))
			r.Delete("/", snapshots.HandleDeleteSnapshot(snapshotStore))
			r.Put("/", snapshots.HandleUpdateSnapshot(snapshotStore))
		})

		r.Route("/api/rooms/{roomId}/settings", func(r chi.Router) {
			r.Get("/", snapshots.HandleGetRoomSettings(snapshotStore))
			r.Put("/", snapshots.HandleUpdateRoomSettings(snapshotStore))
		})

		logrus.Info("Snapshot API routes registered")
	} else {
		logrus.Warn("Snapshot API not available - requires SQLite storage")
	}

	return r
}

func waitForShutdown(ioo *socketio.Server) {
	exit := make(chan struct{})
	SignalC := make(chan os.Signal, 1)

	signal.Notify(SignalC, os.Interrupt, syscall.SIGHUP, syscall.SIGINT, syscall.SIGTERM, syscall.SIGQUIT)
	go func() {
		for s := range SignalC {
			switch s {
			case os.Interrupt, syscall.SIGHUP, syscall.SIGINT, syscall.SIGTERM, syscall.SIGQUIT:
				close(exit)
				return
			}
		}
	}()

	<-exit
	ioo.Close(nil)
	os.Exit(0)
	fmt.Println("Shutting down...")
	// TODO(patwie): Close other resources
	os.Exit(0)
}

func main() {
	// Define a log level flag
	logLevel := flag.String("loglevel", "info", "Set the logging level: debug, info, warn, error, fatal, panic")
	listenAddr := flag.String("listen", ":3002", "Set the server listen address")
	flag.Parse()

	// Set the log level
	level, err := logrus.ParseLevel(*logLevel)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Invalid log level: %v\n", err)
		os.Exit(1)
	}
	logrus.SetLevel(level)

	documentStore := stores.GetStore()
	var roomRegistry core.RoomRegistry
	if registry, ok := documentStore.(core.RoomRegistry); ok {
		roomRegistry = registry
	}

	r := setupRouter(documentStore, roomRegistry)
	ioo := websocket.SetupSocketIO(roomRegistry)
	r.Handle("/socket.io/", ioo.ServeHandler(nil))

	logrus.WithField("addr", *listenAddr).Info("starting server")
	go func() {
		if err := http.ListenAndServe(*listenAddr, r); err != nil {
			logrus.WithField("event", "start server").Fatal(err)
		}
	}()

	logrus.Debug("Server is running in the background")
	waitForShutdown(ioo)

}
