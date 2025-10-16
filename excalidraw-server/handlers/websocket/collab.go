package websocket

import (
	"sync"

	"github.com/zishang520/engine.io/v2/types"
	"github.com/zishang520/engine.io/v2/utils"
	socketio "github.com/zishang520/socket.io/v2/socket"
)

var (
	activeRooms = make(map[string]int) // roomId -> user count
	roomsMutex  sync.RWMutex
)

func GetActiveRooms() map[string]int {
	roomsMutex.RLock()
	defer roomsMutex.RUnlock()

	rooms := make(map[string]int)
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
	opts.SetCors(&types.Cors{
		Origin:      "*",
		Credentials: true,
	})
	ioo := socketio.NewServer(nil, opts)

	ioo.On("connection", func(clients ...any) {
		socket := clients[0].(*socketio.Socket)
		me := socket.Id()
		myRoom := socketio.Room(me)
		ioo.To(myRoom).Emit("init-room")
		utils.Log().Println("init room ", myRoom)

		socket.On("join-room", func(datas ...any) {
			room := socketio.Room(datas[0].(string))
			roomId := datas[0].(string)
			utils.Log().Printf("Socket %v has joined %v\n", me, room)
			socket.Join(room)
			ioo.In(room).FetchSockets()(func(usersInRoom []*socketio.RemoteSocket, _ error) {
				// Update active rooms count
				roomsMutex.Lock()
				activeRooms[roomId] = len(usersInRoom)
				roomsMutex.Unlock()

				if len(usersInRoom) <= 1 {
					ioo.To(myRoom).Emit("first-in-room")
				} else {
					utils.Log().Printf("emit new user %v in room %v\n", me, room)
					socket.Broadcast().To(room).Emit("new-user", me)
				}

				// Inform all clients by new users.
				newRoomUsers := []socketio.SocketId{}
				for _, user := range usersInRoom {
					newRoomUsers = append(newRoomUsers, user.Id())
				}
				utils.Log().Println(" room ", room, " has users ", newRoomUsers)
				ioo.In(room).Emit(
					"room-user-change",
					newRoomUsers,
				)
			})
		})

		socket.On("server-broadcast", func(datas ...any) {
			roomID := datas[0].(string)
			utils.Log().Printf(" user %v sends update to room %v\n", me, roomID)
			socket.Broadcast().To(socketio.Room(roomID)).Emit("client-broadcast", datas[1], datas[2])
		})

		socket.On("server-volatile-broadcast", func(datas ...any) {
			roomID := datas[0].(string)
			utils.Log().Printf(" user %v sends volatile update to room %v\n", me, roomID)
			socket.Volatile().Broadcast().To(socketio.Room(roomID)).Emit("client-broadcast", datas[1], datas[2])
		})

		socket.On("user-follow", func(datas ...any) {
			// TODO: Implement user follow functionality
		})

		socket.On("disconnecting", func(datas ...any) {
			for _, currentRoom := range socket.Rooms().Keys() {
				roomId := string(currentRoom)
				ioo.In(currentRoom).FetchSockets()(func(usersInRoom []*socketio.RemoteSocket, _ error) {
					otherClients := []socketio.SocketId{}
					utils.Log().Printf("disconnecting %v from room %v\n", me, currentRoom)
					for _, userInRoom := range usersInRoom {
						if userInRoom.Id() != me {
							otherClients = append(otherClients, userInRoom.Id())
						}
					}

					// Update active rooms count
					roomsMutex.Lock()
					if len(otherClients) == 0 {
						delete(activeRooms, roomId)
					} else {
						activeRooms[roomId] = len(otherClients)
					}
					roomsMutex.Unlock()

					if len(otherClients) > 0 {
						utils.Log().Printf("leaving user, room %v has users  %v\n", currentRoom, otherClients)
						ioo.In(currentRoom).Emit(
							"room-user-change",
							otherClients,
						)
					}
				})
			}
		})

		socket.On("disconnect", func(datas ...any) {
			socket.RemoveAllListeners("")
			socket.Disconnect(true)
		})
	})

	return ioo
}
