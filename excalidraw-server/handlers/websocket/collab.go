package websocket

import (
	"fmt"
	"reflect"
	"regexp"
	"sync"

	"github.com/zishang520/engine.io/v2/types"
	"github.com/zishang520/engine.io/v2/utils"
	socketio "github.com/zishang520/socket.io/v2/socket"
)

type ackInvoker func(err error, payload map[string]any)

var (
	activeRooms = make(map[string]int)
	roomsMutex  sync.RWMutex
)

func GetActiveRooms() map[string]int {
	roomsMutex.RLock()
	defer roomsMutex.RUnlock()

	rooms := make(map[string]int, len(activeRooms))
	for k, v := range activeRooms {
		rooms[k] = v
	}
	return rooms
}

func SetupSocketIO() *socketio.Server {
	opts := socketio.DefaultServerOptions()
	opts.SetMaxHttpBufferSize(5000000)
	opts.SetPath("/socket.io")
	opts.SetAllowEIO3(true)
	localhostOrigin := regexp.MustCompile(`^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$`)
	opts.SetCors(&types.Cors{
		Origin: []any{
			"tauri://localhost",
			localhostOrigin,
		},
		Credentials: true,
	})
	srv := socketio.NewServer(nil, opts)

	//nolint:errcheck // Socket.IO event handlers do not return useful errors
	srv.On("connection", func(clients ...any) {
		socket, ok := clients[0].(*socketio.Socket)
		if !ok {
			return
		}

		me := socket.Id()
		myRoom := socketio.Room(me)
		_ = srv.To(myRoom).Emit("init-room")
		utils.Log().Printf("init room %v\n", myRoom)

		//nolint:errcheck // Socket.IO event handlers do not return useful errors
		socket.On("join-room", func(datas ...any) {
			ack, args := extractAck(datas)
			if len(args) == 0 {
				err := fmt.Errorf("room id is required")
				respondWithAck(socket, ack, "join-room-ack", map[string]any{
					"status": "error",
					"error":  err.Error(),
				}, err)
				return
			}

			roomID, ok := args[0].(string)
			if !ok || roomID == "" {
				err := fmt.Errorf("invalid room id")
				respondWithAck(socket, ack, "join-room-ack", map[string]any{
					"status": "error",
					"error":  err.Error(),
				}, err)
				return
			}

			room := socketio.Room(roomID)
			socket.Join(room)
			utils.Log().Printf("Socket %v has joined %v\n", me, room)

			srv.In(room).FetchSockets()(func(users []*socketio.RemoteSocket, fetchErr error) {
				if fetchErr != nil {
					respondWithAck(socket, ack, "join-room-ack", map[string]any{
						"status": "error",
						"error":  fetchErr.Error(),
					}, fetchErr)
					return
				}

				roomsMutex.Lock()
				activeRooms[roomID] = len(users)
				roomsMutex.Unlock()

				if len(users) <= 1 {
					_ = srv.To(myRoom).Emit("first-in-room")
				} else {
					utils.Log().Printf("emit new user %v in room %v\n", me, room)
					_ = socket.Broadcast().To(room).Emit("new-user", me)
				}

				newRoomUsers := make([]socketio.SocketId, 0, len(users))
				for _, user := range users {
					newRoomUsers = append(newRoomUsers, user.Id())
				}
				utils.Log().Printf("room %v has users %v\n", room, newRoomUsers)
				srv.In(room).Emit("room-user-change", newRoomUsers)

				respondWithAck(socket, ack, "join-room-ack", map[string]any{
					"status":     "ok",
					"user_count": len(users),
				}, nil)
			})
		})

		//nolint:errcheck // Socket.IO event handlers do not return useful errors
		socket.On("server-broadcast", func(datas ...any) {
			handleBroadcast(socket, datas, false)
		})

		//nolint:errcheck // Socket.IO event handlers do not return useful errors
		socket.On("server-volatile-broadcast", func(datas ...any) {
			handleBroadcast(socket, datas, true)
		})

		socket.On("user-follow", func(datas ...any) {
			// TODO: Implement user follow functionality
		})

		socket.On("disconnecting", func(datas ...any) {
			for _, currentRoom := range socket.Rooms().Keys() {
				roomID := string(currentRoom)
				srv.In(currentRoom).FetchSockets()(func(users []*socketio.RemoteSocket, _ error) {
					utils.Log().Printf("disconnecting %v from room %v\n", me, currentRoom)

					otherClients := make([]socketio.SocketId, 0, len(users))
					for _, userInRoom := range users {
						if userInRoom.Id() != me {
							otherClients = append(otherClients, userInRoom.Id())
						}
					}

					roomsMutex.Lock()
					if len(otherClients) == 0 {
						delete(activeRooms, roomID)
					} else {
						activeRooms[roomID] = len(otherClients)
					}
					roomsMutex.Unlock()

					if len(otherClients) > 0 {
						utils.Log().Printf("leaving user, room %v has users  %v\n", currentRoom, otherClients)
						srv.In(currentRoom).Emit("room-user-change", otherClients)
					}
				})
			}
		})

		socket.On("disconnect", func(datas ...any) {
			socket.RemoveAllListeners("")
			socket.Disconnect(true)
		})
	})

	return srv
}

func handleBroadcast(socket *socketio.Socket, datas []any, volatile bool) {
	roomID, payload, metadata, ack := parseBroadcastArgs(datas)
	if roomID == "" {
		err := fmt.Errorf("missing room id")
		respondWithAck(socket, ack, "broadcast-ack", makeBroadcastAckPayload(payload, err), err)
		return
	}

	utils.Log().Printf(" user %v sends update to room %v\n", socket.Id(), roomID)

	var emitErr error
	if volatile {
		emitErr = socket.Volatile().Broadcast().To(socketio.Room(roomID)).Emit("client-broadcast", payload, metadata)
	} else {
		emitErr = socket.Broadcast().To(socketio.Room(roomID)).Emit("client-broadcast", payload, metadata)
	}

	if emitErr != nil {
		respondWithAck(socket, ack, "broadcast-ack", makeBroadcastAckPayload(payload, emitErr), emitErr)
		return
	}

	respondWithAck(socket, ack, "broadcast-ack", makeBroadcastAckPayload(payload, nil), nil)
}

func extractAck(datas []any) (ack ackInvoker, args []any) {
	if len(datas) == 0 {
		return nil, datas
	}

	candidate := datas[len(datas)-1]
	ack = wrapAck(candidate)
	if ack == nil {
		return nil, datas
	}

	return ack, datas[:len(datas)-1]
}

func wrapAck(candidate any) ackInvoker {
	if candidate == nil {
		return nil
	}

	value := reflect.ValueOf(candidate)
	if !value.IsValid() || value.Kind() != reflect.Func {
		return nil
	}

	typ := value.Type()
	return func(err error, payload map[string]any) {
		args := buildAckArgs(typ, err, payload)
		value.Call(args)
	}
}

func buildAckArgs(typ reflect.Type, err error, payload map[string]any) []reflect.Value {
	numIn := typ.NumIn()
	args := make([]reflect.Value, numIn)

	for i := 0; i < numIn; i++ {
		paramType := typ.In(i)
		var argValue any

		switch {
		case numIn == 1:
			if err != nil {
				argValue = err
			} else {
				argValue = payload
			}
		case i == 0:
			argValue = err
		case i == 1:
			argValue = payload
		default:
			argValue = nil
		}

		args[i] = coerceValue(argValue, paramType)
	}

	return args
}

func coerceValue(value any, targetType reflect.Type) reflect.Value {
	if value == nil {
		return reflect.Zero(targetType)
	}

	rv := reflect.ValueOf(value)
	if rv.Type().AssignableTo(targetType) {
		return rv
	}

	if rv.Type().ConvertibleTo(targetType) {
		return rv.Convert(targetType)
	}

	if targetType.Kind() == reflect.Interface {
		if rv.Type().Implements(targetType) || targetType.NumMethod() == 0 {
			return rv
		}
	}

	if targetType.Kind() == reflect.String {
		return reflect.ValueOf(fmt.Sprint(value)).Convert(targetType)
	}

	if targetType.Kind() == reflect.Map && targetType.Key().Kind() == reflect.String {
		if payload, ok := value.(map[string]any); ok {
			return convertMap(payload, targetType)
		}
	}

	return reflect.Zero(targetType)
}

func convertMap(source map[string]any, targetType reflect.Type) reflect.Value {
	result := reflect.MakeMapWithSize(targetType, len(source))
	for key, val := range source {
		keyValue := reflect.ValueOf(key).Convert(targetType.Key())
		valueValue := reflect.ValueOf(val)
		if !valueValue.Type().AssignableTo(targetType.Elem()) {
			if valueValue.Type().ConvertibleTo(targetType.Elem()) {
				valueValue = valueValue.Convert(targetType.Elem())
			} else if targetType.Elem().Kind() != reflect.Interface {
				continue
			}
		}
		result.SetMapIndex(keyValue, valueValue)
	}
	return result
}

func respondWithAck(socket *socketio.Socket, ack ackInvoker, event string, payload map[string]any, ackErr error) {
	if ack != nil {
		ack(ackErr, payload)
	}

	if event != "" && payload != nil {
		_ = socket.Emit(event, payload)
	}
}

func parseBroadcastArgs(datas []any) (roomID string, payload, metadata any, ack ackInvoker) {
	ack, args := extractAck(datas)
	if len(args) < 3 {
		return "", nil, nil, ack
	}

	roomID, _ = args[0].(string)
	payload = args[1]
	metadata = args[2]
	return roomID, payload, metadata, ack
}

func makeBroadcastAckPayload(original any, ackErr error) map[string]any {
	response := map[string]any{
		"status": "ok",
	}

	if ackErr != nil {
		response["status"] = "error"
		response["error"] = ackErr.Error()
	}

	if messageID := extractMessageID(original); messageID != "" {
		response["messageId"] = messageID
	}

	return response
}

func extractMessageID(original any) string {
	value, ok := original.(map[string]any)
	if !ok {
		return ""
	}

	if id, exists := value["__collabMessageId"].(string); exists {
		return id
	}

	return ""
}
