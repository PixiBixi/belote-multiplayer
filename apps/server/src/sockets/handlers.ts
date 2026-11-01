import type { Server as HttpServer } from 'node:http'
import type { Result } from '@belote/engine'
import {
  chatSendSchema,
  gameMoveSchema,
  roomConfigureSchema,
  roomCreateSchema,
  roomJoinSchema,
  roomMoveSeatSchema,
  roomRejoinSchema,
  roomSetSeatSchema,
  type ErrorCode,
  type GameEvent,
} from '@belote/protocol'
import { Server } from 'socket.io'
import { z, type ZodType } from 'zod'
import type { Config } from '../config.js'
import { logger } from '../logger.js'
import type { RoomManager } from '../rooms/room-manager.js'
import type { Room } from '../rooms/room.js'
import { isAllowedOrigin } from '../security/origin.js'
import { createRateLimiter, type RateLimiter } from '../security/rate-limit.js'
import type { AckFailure, Presence, TypedServer, TypedSocket } from './types.js'
import { createVoiceRooms } from './voice-room.js'
import { forgetVoiceSocket, leaveVoice, registerVoiceHandlers, type VoiceContext } from './voice.js'

/** socket.io may deliver `undefined` when the client sends no payload object. */
const emptyPayloadSchema = z.union([z.object({}), z.undefined(), z.null()]).transform(() => ({}))

/** Returns the parsed payload, or null when it does not match the contract. */
function parsePayload<T>(schema: ZodType<T>, payload: unknown): T | null {
  const parsed = schema.safeParse(payload)
  return parsed.success ? parsed.data : null
}

type Ack = (result: AckFailure) => void

/** True after reporting a refused result, so an early return narrows it to the success. */
function refused<T>(
  result: Result<T, ErrorCode>,
  ack: Ack,
): result is { okay: false; error: ErrorCode } {
  if (result.okay) return false
  ack({ ok: false, error: result.error })
  return true
}

/**
 * Runs a handler body so that nothing escapes to the process boundary - an
 * uncaught throw in a socket listener is exactly what took the predecessor down.
 * `ack` is checked at runtime too: a client is free to omit it, and calling
 * `undefined` would defeat the whole purpose.
 */
function attempt(ack: unknown, run: () => void): void {
  try {
    run()
  } catch (error) {
    logger.error({ err: error }, 'socket handler threw')
    if (typeof ack !== 'function') return
    try {
      ;(ack as (result: AckFailure) => void)({ ok: false, error: 'invalid_payload' })
    } catch {
      // The client is already gone; nothing left to report to.
    }
  }
}

export function registerSocketHandlers(
  httpServer: HttpServer,
  rooms: RoomManager,
  config: Config,
): TypedServer {
  const io: TypedServer = new Server(httpServer, {
    cors: { origin: config.corsOrigins.length > 0 ? config.corsOrigins : false },
    transports: ['websocket', 'polling'],
    /*
     * Views are the bulk of what this server sends, and they went out as raw JSON. A
     * measured match at four players moved about a megabyte per phone, and deflate takes
     * roughly two thirds off that - the same view text repeats heavily from one move to
     * the next, which is exactly what a compression context exploits.
     *
     * This is a separate channel from the HTTP compression in http.ts: engine.io and ws
     * never touch Fastify's reply pipeline, so compressing one does nothing for the other.
     * engine.io also only builds a deflate config when this option is present - it is not
     * in its defaults - so leaving it out meant off, not automatic.
     *
     * The cost is a zlib context per socket, a few hundred kilobytes with context
     * takeover. At a handful of players that is single-digit megabytes; it would be worth
     * revisiting at hundreds. The threshold leaves small frames alone, since an ack or a
     * chat line is smaller than the deflate block that would wrap it.
     */
    perMessageDeflate: { threshold: 1024 },
    // 64 KiB, down from 1 MB: four times the largest legal SDP (MAX_SDP_LENGTH, 16 KiB),
    // which dwarfs every other payload. Anything bigger is not a client of ours.
    maxHttpBufferSize: 64 * 1024,
    allowRequest: (req, callback) => {
      callback(null, isAllowedOrigin(req.headers.origin, req.headers.host, config.corsOrigins))
    },
  })

  const presences = new Map<string, Presence>()
  const moveLimiter = createRateLimiter({
    capacity: config.moveBurst,
    refillPerSecond: config.movePerSecond,
  })
  const chatLimiter = createRateLimiter({
    capacity: config.chatBurst,
    refillPerSecond: config.chatPerSecond,
  })
  /* A room is the most expensive thing a client can ask for - a seat, a deck and up to
     three timers, held until somebody gives it up. It was the only unlimited event. */
  const createLimiter = createRateLimiter({
    capacity: config.createBurst,
    refillPerSecond: config.createPerSecond,
  })
  /* Configure, start, next round, restart and rejoin each re-broadcast the table and some
     re-deal it. One shared bucket, so alternating between them buys no extra allowance. */
  const controlLimiter = createRateLimiter({
    capacity: config.controlBurst,
    refillPerSecond: config.controlPerSecond,
  })
  const voiceRooms = createVoiceRooms()
  // A purged room's code can be handed out again; its voice session must not survive it.
  rooms.onPurge((code) => voiceRooms.drop(code))
  /* One join in a four-player mesh emits an offer, an answer and a dozen or so
     candidates per pair. Generous for that burst, hostile to a signal flood. */
  const voiceLimiter = createRateLimiter({ capacity: 120, refillPerSecond: 10 })
  const voiceContext: VoiceContext = {
    io,
    voiceRooms,
    config,
    limiter: voiceLimiter,
    presenceOf: (socketId: string) => presences.get(socketId),
  }

  /** Pushes every connected human its own redacted view. */
  const broadcastViews = (room: Room): void => {
    for (let seat = 0; seat < room.seatCount; seat++) {
      const socketId = room.socketAt(seat)
      const view = room.viewFor(seat)
      if (socketId === null || view === null) continue
      io.to(socketId).emit('game:view', view)
    }
  }

  const broadcastLobby = (room: Room): void => {
    const view = room.lobbyView()
    for (let seat = 0; seat < room.seatCount; seat++) {
      const socketId = room.socketAt(seat)
      if (socketId === null) continue
      io.to(socketId).emit('room:state', view)
    }
  }

  const broadcastEvents = (room: Room, events: GameEvent[]): void => {
    for (const event of events) io.to(room.code).emit('game:event', event)
  }

  /** Everything a change owes the table: its events, the lobby state, each seat's view. */
  const publish = (room: Room, events: GameEvent[]): void => {
    broadcastEvents(room, events)
    broadcastLobby(room)
    broadcastViews(room)
    // A table with no human left has nobody to play for: bots alone must not run on.
    rooms.dropIfAbandoned(room)
  }

  /**
   * Re-times the room after anything that can change who has to act. Safe to call
   * unconditionally: the manager keeps the running timer when nothing relevant changed
   * and clears it when the room owes none. A bot move, a timeout or the next deal that
   * fires comes back here through `publish`.
   */
  const retime = (room: Room): void => {
    rooms.schedule(room, (events) => publish(room, events))
  }

  /**
   * Gives up whatever seat this socket is holding, and tells the table. Silent when it
   * holds none, so it is safe to call before taking a seat anywhere.
   *
   * Extracted rather than duplicated: `room:leave` did exactly this and `attach` did
   * none of it, which is how a socket could walk to another table and leave its old
   * seat holding a socket id that would never disconnect again.
   *
   * No grace timer, deliberately: the seat is given up rather than lost. Mid-game a
   * normal bot stands in and the session token can still reclaim the seat.
   */
  const release = (socket: TypedSocket): void => {
    const presence = presences.get(socket.id)
    if (presence === undefined) return
    // Before `presences.delete` below: leaveVoice resolves the room through it.
    leaveVoice(voiceContext, socket)

    const { room } = presence
    const result = room.leave(socket.id)
    presences.delete(socket.id)
    moveLimiter.forget(socket.id)
    chatLimiter.forget(socket.id)
    void socket.leave(room.code)

    if (result === null) return
    rooms.cancelGrace(room, result.seat)
    retime(room)
    publish(room, result.events)
  }

  /** Takes a seat's old socket off the table: a second tab rejoined as that seat. */
  const evict = (socketId: string): void => {
    const stale = io.sockets.sockets.get(socketId)
    // Before `presences.delete`: leaveVoice resolves the room through it.
    if (stale !== undefined) leaveVoice(voiceContext, stale)
    presences.delete(socketId)
    moveLimiter.forget(socketId)
    chatLimiter.forget(socketId)
    stale?.disconnect(true)
  }

  io.on('connection', (socket: TypedSocket) => {
    /* Every client event takes (payload, ack), and every handler acks after it has
       changed state. A missing callback threw there and skipped the broadcast. */
    socket.use((packet, next) => {
      if (typeof packet[2] !== 'function') packet[2] = () => {}
      next()
    })

    const attach = (room: Room, seat: number): void => {
      /*
       * Scoped to a DIFFERENT room on purpose. Re-attaching to the table you are already
       * at happens on a same-socket rejoin, and tearing down there would hand back the
       * very seat the rejoin exists to restore.
       */
      const previous = presences.get(socket.id)
      if (previous !== undefined && previous.room.code !== room.code) release(socket)

      presences.set(socket.id, { room, seat })
      void socket.join(room.code)
    }

    /** The payload, or null after telling the caller it does not match the contract. */
    const parsed = <T>(schema: ZodType<T>, payload: unknown, ack: Ack): T | null => {
      const data = parsePayload(schema, payload)
      if (data === null) ack({ ok: false, error: 'invalid_payload' })
      return data
    }

    /** False after telling the caller it is over this budget. */
    const within = (limiter: RateLimiter, ack: Ack): boolean => {
      if (limiter.allow(socket.id)) return true
      ack({ ok: false, error: 'rate_limited' })
      return false
    }

    /**
     * The seat this socket is sitting in, or null after telling the caller there
     * is none. Six handlers began with the same six lines; a change to what "not
     * at a table" means had to be remembered in all of them.
     */
    const seated = (ack: Ack): Presence | null => {
      const presence = presences.get(socket.id)
      if (presence === undefined) {
        ack({ ok: false, error: 'room_not_found' })
        return null
      }
      return presence
    }

    /**
     * The opening every seated handler shares, in the order they all used: the payload,
     * then the seat, then the budget when there is one. Null once the caller is told.
     */
    const admit = <T>(
      schema: ZodType<T>,
      payload: unknown,
      ack: Ack,
      limiter?: RateLimiter,
    ): { data: T; presence: Presence } | null => {
      const data = parsed(schema, payload, ack)
      if (data === null) return null
      const presence = seated(ack)
      if (presence === null) return null
      if (limiter !== undefined && !within(limiter, ack)) return null
      return { data, presence }
    }

    registerVoiceHandlers(voiceContext, socket, { attempt, emptyPayloadSchema, parsed, admit })

    socket.on('room:create', (payload, ack) => {
      attempt(ack, () => {
        const data = parsed(roomCreateSchema, payload, ack)
        if (data === null) return
        /* Checked after the payload and before the room exists, so a refused burst costs
           nothing and cannot leave a half-created table behind. */
        if (!within(createLimiter, ack)) return
        const created = rooms.create(data.pace, data.rules)
        if (refused(created, ack)) return
        const room = created.value
        const joined = room.join(data.playerName, socket.id)
        if (refused(joined, ack)) return
        attach(room, joined.value.seat)
        ack({
          ok: true,
          roomCode: room.code,
          sessionToken: joined.value.sessionToken,
          seat: joined.value.seat,
        })
        broadcastLobby(room)
      })
    })

    socket.on('room:join', (payload, ack) => {
      attempt(ack, () => {
        const data = parsed(roomJoinSchema, payload, ack)
        if (data === null) return
        const room = rooms.get(data.roomCode)
        if (room === null) {
          ack({ ok: false, error: 'room_not_found' })
          return
        }
        const joined = room.join(data.playerName, socket.id)
        if (refused(joined, ack)) return
        attach(room, joined.value.seat)
        ack({ ok: true, sessionToken: joined.value.sessionToken, seat: joined.value.seat })
        broadcastLobby(room)
      })
    })

    socket.on('room:rejoin', (payload, ack) => {
      attempt(ack, () => {
        const data = parsed(roomRejoinSchema, payload, ack)
        if (data === null) return
        if (!within(controlLimiter, ack)) return
        const room = rooms.get(data.roomCode)
        if (room === null) {
          ack({ ok: false, error: 'room_not_found' })
          return
        }
        const rejoined = room.rejoin(data.sessionToken, socket.id)
        if (refused(rejoined, ack)) return
        if (rejoined.value.supersededSocketId !== null) evict(rejoined.value.supersededSocketId)
        rooms.cancelGrace(room, rejoined.value.seat)
        attach(room, rejoined.value.seat)
        ack({ ok: true, seat: rejoined.value.seat })
        retime(room)
        publish(room, [{ type: 'seatReconnected', seat: rejoined.value.seat }])
      })
    })

    /**
     * Giving up a seat on purpose, which used to be a client-only idea: the
     * button cleared local state and the server was never told. The seat kept a
     * dead socket id forever, so the room could never be reclaimed, and the
     * socket stayed in the old socket.io room and kept receiving its chat.
     *
     * Deliberately the same path as an unexpected disconnect, minus the grace
     * period: somebody who pressed Leave is not coming back to that seat.
     */
    socket.on('room:leave', (payload, ack) => {
      attempt(ack, () => {
        if (parsed(emptyPayloadSchema, payload, ack) === null) return
        // Leaving twice, or from a stale tab, is not an error worth reporting - `release`
        // is silent when there is no seat to give up.
        release(socket)
        ack({ ok: true })
      })
    })

    /**
     * The host changing the table from the lobby. The guard lives in the Room, checked
     * when the event is handled and never at render: a host can press Start and toggle a
     * rule in the same breath, and whichever arrives second must lose. The result goes
     * out as a fresh `room:state` to everyone, so guests watch the host change the table.
     */
    socket.on('room:configure', (payload, ack) => {
      attempt(ack, () => {
        const admitted = admit(roomConfigureSchema, payload, ack, controlLimiter)
        if (admitted === null) return
        const { data, presence } = admitted
        if (refused(presence.room.configure(presence.seat, data), ack)) return
        ack({ ok: true })
        broadcastLobby(presence.room)
      })
    })

    socket.on('room:setSeat', (payload, ack) => {
      attempt(ack, () => {
        const admitted = admit(roomSetSeatSchema, payload, ack, controlLimiter)
        if (admitted === null) return
        const { data, presence } = admitted
        if (refused(presence.room.setSeat(presence.seat, data.seat, data.occupant), ack)) return
        ack({ ok: true })
        broadcastLobby(presence.room)
      })
    })

    socket.on('room:moveSeat', (payload, ack) => {
      attempt(ack, () => {
        const admitted = admit(roomMoveSeatSchema, payload, ack, controlLimiter)
        if (admitted === null) return
        const { data, presence } = admitted
        const moved = presence.room.moveSeat(presence.seat, data.seat)
        if (refused(moved, ack)) return
        if (moved.value.seat !== presence.seat) {
          /* Voice is keyed by seat: leave it under the old one, the client rejoins. */
          leaveVoice(voiceContext, socket)
          presences.set(socket.id, { room: presence.room, seat: moved.value.seat })
        }
        ack({ ok: true, seat: moved.value.seat })
        broadcastLobby(presence.room)
      })
    })

    socket.on('game:start', (payload, ack) => {
      attempt(ack, () => {
        const admitted = admit(emptyPayloadSchema, payload, ack, controlLimiter)
        if (admitted === null) return
        const { presence } = admitted
        const started = presence.room.start(presence.seat, rooms.nextSeed())
        if (refused(started, ack)) return
        ack({ ok: true })
        retime(presence.room)
        publish(presence.room, started.value)
      })
    })

    socket.on('game:nextHand', (payload, ack) => {
      attempt(ack, () => {
        const admitted = admit(emptyPayloadSchema, payload, ack, controlLimiter)
        if (admitted === null) return
        const { presence } = admitted
        const dealt = presence.room.nextHand(presence.seat)
        if (refused(dealt, ack)) return
        ack({ ok: true })
        retime(presence.room)
        publish(presence.room, dealt.value)
      })
    })

    socket.on('game:restart', (payload, ack) => {
      attempt(ack, () => {
        const admitted = admit(emptyPayloadSchema, payload, ack, controlLimiter)
        if (admitted === null) return
        const { presence } = admitted
        const restarted = presence.room.restart(presence.seat, rooms.nextSeed())
        if (refused(restarted, ack)) return
        ack({ ok: true })
        retime(presence.room)
        publish(presence.room, restarted.value)
      })
    })

    socket.on('game:move', (payload, ack) => {
      attempt(ack, () => {
        const admitted = admit(gameMoveSchema, payload, ack, moveLimiter)
        if (admitted === null) return
        const { data, presence } = admitted
        const applied = presence.room.move(presence.seat, data.move)
        if (refused(applied, ack)) return
        ack({ ok: true })
        retime(presence.room)
        publish(presence.room, applied.value)
      })
    })

    socket.on('chat:send', (payload, ack) => {
      attempt(ack, () => {
        const admitted = admit(chatSendSchema, payload, ack, chatLimiter)
        if (admitted === null) return
        const { data, presence } = admitted
        const name = presence.room.nameAt(presence.seat) ?? 'unknown'
        ack({ ok: true })
        io.to(presence.room.code).emit('chat:message', {
          seat: presence.seat,
          name,
          text: data.text,
        })
      })
    })

    socket.on('disconnect', () => {
      attempt(undefined, () => {
        // Before `presences.delete` below: leaveVoice resolves the room through it.
        forgetVoiceSocket(voiceContext, socket)
        moveLimiter.forget(socket.id)
        chatLimiter.forget(socket.id)
        /* Only here, and deliberately not in `release`: the socket is genuinely gone, so
           its bucket is dead weight. `release` runs on every create - it is how a socket
           gives up its old table - so forgetting there would refill the create bucket on
           each create and cancel the limit it exists to impose. The control bucket
           follows the same rule, since leaving and rejoining would refill it. */
        createLimiter.forget(socket.id)
        controlLimiter.forget(socket.id)
        const presence = presences.get(socket.id)
        presences.delete(socket.id)
        if (presence === undefined) return

        const { room } = presence
        const result = room.disconnect(socket.id)
        if (result === null) return

        // The seat is kept; a turn it holds is played by a bot after a short grace.
        retime(room)
        publish(room, result.events)
        rooms.scheduleGrace(room, result.seat, (events) => {
          retime(room)
          publish(room, events)
        })
      })
    })
  })

  return io
}
