import type { Server as HttpServer } from 'node:http'
import { Server, type Socket } from 'socket.io'

/**
 * Signaling untuk Room Remote (WebRTC 1:1). Server ini HANYA menukar pesan
 * kecil (kode room, offer/answer SDP, kandidat ICE, dan teks hasil
 * terjemahan) — video & audio mengalir langsung antar browser lewat WebRTC,
 * tidak lewat server ini sama sekali.
 */

interface RoomState {
  sockets: Set<string>
}

const rooms = new Map<string, RoomState>();

export function attachSignaling(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: '*' },
  })

  io.on('connection', (socket: Socket) => {
    let joinedRoom: string | null = null

    socket.on('room:join', (roomCode: unknown) => {
      if (typeof roomCode !== 'string' || !roomCode.trim()) return
      const code = roomCode.trim().toUpperCase()

      const existing = rooms.get(code)
      const peerCount = existing?.sockets.size ?? 0
      if (peerCount >= 2) {
        socket.emit('room:full')
        return
      }

      joinedRoom = code
      socket.join(code)
      const state = existing ?? { sockets: new Set<string>() }
      state.sockets.add(socket.id)
      rooms.set(code, state)

      socket.emit('room:joined', { code, isInitiator: state.sockets.size === 1 })
      socket.to(code).emit('room:peer-joined')
    })

    socket.on('signal', (payload: { code: string; data: unknown }) => {
      if (!payload?.code) return
      socket.to(payload.code).emit('signal', payload.data)
    })

    socket.on('chat:message', (payload: { code: string; message: unknown }) => {
      if (!payload?.code) return
      socket.to(payload.code).emit('chat:message', payload.message)
    })

    socket.on('disconnect', () => {
      if (!joinedRoom) return
      const state = rooms.get(joinedRoom)
      if (!state) return
      state.sockets.delete(socket.id)
      socket.to(joinedRoom).emit('room:peer-left')
      if (state.sockets.size === 0) {
        rooms.delete(joinedRoom)
      }
    })
  })

  return io
}
