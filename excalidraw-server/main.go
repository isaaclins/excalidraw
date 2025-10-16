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
	"os"
	"os/signal"
	"syscall"

	"github.com/sirupsen/logrus"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	socketio "github.com/zishang520/socket.io/v2/socket"
)

func setupRouter(documentStore core.DocumentStore) *chi.Mux {
	r := chi.NewRouter()
	r.Use(middleware.Logger)

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:*", "tauri://localhost"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "Content-Length"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Route("/api/v2", func(r chi.Router) {
		r.Post("/post/", documents.HandleCreate(documentStore))
		r.Route("/{id}", func(r chi.Router) {
			r.Get("/", documents.HandleGet(documentStore))
		})
	})

	r.Get("/api/rooms", func(w http.ResponseWriter, r *http.Request) {
		rooms := websocket.GetActiveRooms()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(rooms)
	})

	// Snapshot API routes - only available with SQLite store
	if snapshotStore, ok := documentStore.(snapshots.SnapshotStore); ok {
		r.Route("/api/rooms/{roomId}/snapshots", func(r chi.Router) {
			r.Post("/", snapshots.HandleCreateSnapshot(snapshotStore))
			r.Get("/", snapshots.HandleListSnapshots(snapshotStore))
			r.Get("/count", snapshots.HandleGetSnapshotCount(snapshotStore))
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
	SignalC := make(chan os.Signal)

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
	r := setupRouter(documentStore)
	ioo := websocket.SetupSocketIO()
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
