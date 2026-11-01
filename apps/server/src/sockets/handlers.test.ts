import { createServer, type Server as HttpServer } from 'node:http'
import type { GameEvent, LobbyView, PlayerView } from '@belote/protocol'
import { io as connect, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { RoomManager, type Timers } from '../rooms/room-manager.js'
import { registerSocketHandlers } from './handlers.js'

let httpServer: HttpServer
let ioServer: ReturnType<typeof registerSocketHandlers>
let rooms: RoomManager
let url: string
const clients: Socket[] = []

/* Game timers are faked and fired by hand: a bot never waits on the wall clock here.
   Only socket delivery is real, and `until` waits for exactly that. */
const pending = new Map<number, () => void>()
const timers: Timers = {
  setTimeout(fn) {
    const handle = pending.size + Math.random()
    pending.set(handle, fn)
    return handle
  },
  clearTimeout(handle) {
    pending.delete(handle as number)
  },
}
const fireTimers = (): void => {
  const batch = [...pending.values()]
  pending.clear()
  for (const fn of batch) fn()
}

beforeEach(async () => {
  pending.clear()
  const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' })
  rooms = new RoomManager({
    maxRooms: 10,
    gracePeriodMs: config.gracePeriodMs,
    timers,
    seedSource: () => 42,
  })
  httpServer = createServer()
  ioServer = registerSocketHandlers(httpServer, rooms, config)
  await new Promise<void>((resolve) => httpServer.listen(0, resolve))
  const address = httpServer.address()
  if (address === null || typeof address === 'string') throw new Error('expected a TCP address')
  url = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect()
  await ioServer.close()
  await new Promise<void>((resolve) => httpServer.close(() => resolve()))
})

type PlainAck = { ok: true } | { ok: false; error: string }
type CreateAck = { ok: true; roomCode: string; sessionToken: string; seat: number } | { ok: false }
type JoinAck = { ok: true; sessionToken: string; seat: number } | { ok: false; error: string }

const newPlayer = () => {
  const socket = connect(url, { transports: ['websocket'], forceNew: true })
  clients.push(socket)
  const state = {
    socket,
    views: [] as PlayerView[],
    lobbies: [] as LobbyView[],
    events: [] as GameEvent[],
  }
  socket.on('game:view', (v: PlayerView) => state.views.push(v))
  socket.on('room:state', (v: LobbyView) => state.lobbies.push(v))
  socket.on('game:event', (e: GameEvent) => state.events.push(e))
  return state
}
type Player = ReturnType<typeof newPlayer>

const emit = <T>(player: Player, event: string, payload: unknown): Promise<T> =>
  new Promise((resolve) => player.socket.emit(event, payload, resolve))

/** Polls a condition for socket delivery; never used to wait for a game timer. */
const until = async (condition: () => boolean, what: string): Promise<void> => {
  for (let i = 0; i < 400; i++) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(`timed out waiting for ${what}`)
}

const lastView = (p: Player): PlayerView => {
  const view = p.views.at(-1)
  if (view === undefined) throw new Error('no view yet')
  return view
}

const lastViewSeat = (p: Player, seat: number): string | undefined => {
  const info = p.views.at(-1)?.seats[seat]
  return info?.kind === 'human' ? info.status : undefined
}

const createRoom = async (host: Player, name = 'Ana') => {
  const ack = await emit<CreateAck>(host, 'room:create', {
    playerName: name,
    pace: null,
    rules: {},
  })
  if (!ack.ok) throw new Error('room:create failed')
  return ack
}

/** Host at seat 0, one guest at seat 1, bots at 2 and 3, game started. */
const startTwoHumans = async () => {
  const host = newPlayer()
  const guest = newPlayer()
  const created = await createRoom(host)
  const joined = await emit<JoinAck>(guest, 'room:join', {
    roomCode: created.roomCode,
    playerName: 'Ben',
  })
  if (!joined.ok) throw new Error('room:join failed')
  for (const seat of [2, 3]) {
    const set = await emit<PlainAck>(host, 'room:setSeat', {
      seat,
      occupant: { kind: 'bot', level: 'normal' },
    })
    expect(set).toEqual({ ok: true })
  }
  expect(await emit<PlainAck>(host, 'game:start', {})).toEqual({ ok: true })
  await until(() => host.views.length > 0 && guest.views.length > 0, 'first views')
  return { host, guest, roomCode: created.roomCode, guestToken: joined.sessionToken }
}

/** Fires game timers until `who` is on turn, then waits for the view that says so. */
const untilOnTurn = async (p: Player, seat: number): Promise<void> => {
  for (let i = 0; i < 500; i++) {
    await until(() => p.views.length > 0, 'a view')
    if (lastView(p).hand.currentSeat === seat && lastView(p).hand.phase !== 'done') return
    fireTimers()
    const count = p.views.length
    await until(() => p.views.length > count, 'the next view')
  }
  throw new Error('never reached the turn')
}

describe('room lifecycle over sockets', () => {
  it('creates a room as host at seat 0 with a token', async () => {
    const ack = await createRoom(newPlayer())
    expect(ack.roomCode).toHaveLength(6)
    expect(ack.seat).toBe(0)
    expect(ack.sessionToken).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('rejects an invalid payload without dropping the connection', async () => {
    const p = newPlayer()
    expect(await emit<PlainAck>(p, 'room:create', { playerName: '', pace: null })).toEqual({
      ok: false,
      error: 'invalid_payload',
    })
    expect(await createRoom(p)).toMatchObject({ ok: true })
  })

  it('reports room_not_found for an unknown code', async () => {
    expect(
      await emit<PlainAck>(newPlayer(), 'room:join', { roomCode: 'ZZZZZZ', playerName: 'Ben' }),
    ).toEqual({ ok: false, error: 'room_not_found' })
  })

  it('seats joiners in order and answers room_full to a fifth', async () => {
    const host = newPlayer()
    const created = await createRoom(host)
    const seats: number[] = []
    for (const name of ['Ben', 'Cleo', 'Dan']) {
      const ack = await emit<JoinAck>(newPlayer(), 'room:join', {
        roomCode: created.roomCode,
        playerName: name,
      })
      if (ack.ok) seats.push(ack.seat)
    }
    expect(seats).toEqual([1, 2, 3])
    expect(
      await emit<PlainAck>(newPlayer(), 'room:join', {
        roomCode: created.roomCode,
        playerName: 'E',
      }),
    ).toEqual({ ok: false, error: 'room_full' })
  })
})

describe('lobby seat handlers', () => {
  it('puts a bot in a seat and broadcasts the lobby to everybody', async () => {
    const host = newPlayer()
    const guest = newPlayer()
    const created = await createRoom(host)
    await emit<JoinAck>(guest, 'room:join', { roomCode: created.roomCode, playerName: 'Ben' })

    expect(
      await emit<PlainAck>(host, 'room:setSeat', {
        seat: 2,
        occupant: { kind: 'bot', level: 'hard' },
      }),
    ).toEqual({ ok: true })
    await until(() => guest.lobbies.at(-1)?.seats[2]?.kind === 'bot', 'the guest lobby')
    expect(guest.lobbies.at(-1)?.seats[2]).toMatchObject({ kind: 'bot', level: 'hard' })
  })

  it('refuses setSeat from a guest and on a human seat', async () => {
    const host = newPlayer()
    const guest = newPlayer()
    const created = await createRoom(host)
    await emit<JoinAck>(guest, 'room:join', { roomCode: created.roomCode, playerName: 'Ben' })
    const bot = { kind: 'bot', level: 'easy' }
    expect(await emit<PlainAck>(guest, 'room:setSeat', { seat: 2, occupant: bot })).toEqual({
      ok: false,
      error: 'not_host',
    })
    expect(await emit<PlainAck>(host, 'room:setSeat', { seat: 1, occupant: bot })).toEqual({
      ok: false,
      error: 'seat_taken',
    })
    expect(await emit<PlainAck>(host, 'room:setSeat', { seat: 9, occupant: bot })).toEqual({
      ok: false,
      error: 'invalid_payload',
    })
  })

  it('moves a human to an empty seat and keeps their socket bound to it', async () => {
    const host = newPlayer()
    const guest = newPlayer()
    const created = await createRoom(host)
    await emit<JoinAck>(guest, 'room:join', { roomCode: created.roomCode, playerName: 'Ben' })

    expect(await emit(guest, 'room:moveSeat', { seat: 2 })).toEqual({ ok: true, seat: 2 })
    expect(await emit<PlainAck>(guest, 'room:moveSeat', { seat: 0 })).toEqual({
      ok: false,
      error: 'seat_taken',
    })
    await until(() => host.lobbies.at(-1)?.seats[2]?.kind === 'human', 'the host lobby')
    expect(host.lobbies.at(-1)?.seats.map((s) => s.kind)).toEqual([
      'human',
      'empty',
      'human',
      'empty',
    ])
  })

  it('refuses game:start until every seat is filled', async () => {
    const host = newPlayer()
    await createRoom(host)
    expect(await emit<PlainAck>(host, 'game:start', {})).toEqual({
      ok: false,
      error: 'seats_not_filled',
    })
  })
})

describe('a human move over the wire', () => {
  it('goes schema -> handler -> engine -> ack, events and fresh views', async () => {
    const { host, guest } = await startTwoHumans()
    await untilOnTurn(host, 0)

    const view = lastView(host)
    const move = view.you.legalMoves[0]
    if (move === undefined) throw new Error('no legal move')
    const viewsBefore = host.views.length
    const bidsBefore = view.hand.bids.length

    expect(await emit<PlainAck>(host, 'game:move', { move })).toEqual({ ok: true })
    await until(() => host.views.length > viewsBefore, 'the post-move view')
    // Whatever the phase was, the move left a matching event on every member's feed.
    const eventType =
      move.type === 'play' ? 'cardPlayed' : move.type === 'declare' ? 'declared' : 'bid'
    const seenBy = (p: Player) => p.events.some((e) => e.type === eventType)
    await until(() => seenBy(host) && seenBy(guest), `a ${eventType} event on both feeds`)
    if (view.hand.phase === 'bidding') expect(lastView(host).hand.bids.length).toBe(bidsBefore + 1)
    expect(lastView(host).you.hand.length).toBe(
      view.you.hand.length - (move.type === 'play' ? 1 : 0),
    )
  })

  it('answers not_your_turn to a guest out of turn and invalid_payload to junk', async () => {
    const { host, guest } = await startTwoHumans()
    await untilOnTurn(host, 0)
    expect(await emit<PlainAck>(guest, 'game:move', { move: { type: 'pass' } })).toEqual({
      ok: false,
      error: 'not_your_turn',
    })
    expect(
      await emit<PlainAck>(host, 'game:move', { move: { type: 'play', cardId: 'ZZ' } }),
    ).toEqual({ ok: false, error: 'invalid_payload' })
    expect(await emit<PlainAck>(host, 'game:move', { move: { type: 'nuke' } })).toEqual({
      ok: false,
      error: 'invalid_payload',
    })
  })

  it('answers illegal_move to a legal-looking move the engine refuses', async () => {
    const { host } = await startTwoHumans()
    await untilOnTurn(host, 0)
    // Bidding is under way, so playing a card is never legal.
    const card = lastView(host).you.hand[0]
    expect(
      await emit<PlainAck>(host, 'game:move', { move: { type: 'play', cardId: card?.id } }),
    ).toEqual({ ok: false, error: 'illegal_move' })
  })

  it('never sends a member a card from another hand', async () => {
    const { host, guest } = await startTwoHumans()
    await untilOnTurn(host, 0)
    for (const [me, other] of [
      [host, guest],
      [guest, host],
    ] as const) {
      const mine = lastView(me)
      const theirs = lastView(other).you.hand.map((c) => c.id)
      const text = JSON.stringify({ ...mine, you: undefined })
      for (const id of theirs) expect(text).not.toContain(`"id":"${id}"`)
      expect(mine.hand.handCounts).toHaveLength(4)
    }
  })
})

describe('leave and rejoin over the wire', () => {
  it('turns a leaver into a stand-in bot, and the session token takes the seat back', async () => {
    const { host, guest, roomCode, guestToken } = await startTwoHumans()

    expect(await emit<PlainAck>(guest, 'room:leave', {})).toEqual({ ok: true })
    await until(() => host.events.some((e) => e.type === 'botTookOver'), 'botTookOver')
    expect(host.events).toContainEqual({ type: 'botTookOver', seat: 1 })
    await until(() => lastView(host).seats[1]?.kind === 'bot', 'the bot view')
    expect(lastView(host).seats[1]).toMatchObject({ kind: 'bot', standingInFor: 'Ben' })

    const back = newPlayer()
    const ack = await emit<PlainAck>(back, 'room:rejoin', { roomCode, sessionToken: guestToken })
    expect(ack).toEqual({ ok: true, seat: 1 })
    await until(() => back.views.length > 0, 'the reclaimed view')
    expect(lastView(back).you.seat).toBe(1)
    await until(() => lastViewSeat(host, 1) === 'active', 'the host view of the reclaimed seat')
    expect(lastView(host).seats[1]).toMatchObject({ kind: 'human', name: 'Ben' })
  })

  it('gives a stand-in seat back to a join under the same name, from another browser', async () => {
    const { host, guest, roomCode, guestToken } = await startTwoHumans()
    expect(await emit<PlainAck>(guest, 'room:leave', {})).toEqual({ ok: true })
    await until(() => lastView(host).seats[1]?.kind === 'bot', 'the bot view')

    const back = newPlayer()
    const ack = await emit<PlainAck>(back, 'room:join', { roomCode, playerName: 'Ben' })
    expect(ack).toEqual({ ok: true, seat: 1, sessionToken: guestToken })
    await until(() => back.views.length > 0, 'the reclaimed view')
    expect(lastView(back).you.seat).toBe(1)
    await until(() => lastViewSeat(host, 1) === 'active', 'the host view of the reclaimed seat')
  })

  it('keeps the seat of a dropped connection and reports it disconnected', async () => {
    const { host, guest } = await startTwoHumans()
    guest.socket.disconnect()
    await until(
      () => lastViewSeat(host, 1) === 'disconnected',
      'the disconnected status in the host view',
    )
    expect(host.events).toContainEqual({ type: 'seatDisconnected', seat: 1 })
    expect(lastView(host).seats[1]).toMatchObject({ kind: 'human', status: 'disconnected' })
  })
})

describe('hand flow over the wire', () => {
  it('refuses nextHand mid-hand and restart before the game is over', async () => {
    const { host } = await startTwoHumans()
    expect(await emit<PlainAck>(host, 'game:nextHand', {})).toEqual({
      ok: false,
      error: 'hand_in_progress',
    })
    expect(await emit<PlainAck>(host, 'game:restart', {})).toEqual({
      ok: false,
      error: 'hand_in_progress',
    })
  })

  it('relays chat with the seat name', async () => {
    const { host, guest } = await startTwoHumans()
    const heard: string[] = []
    guest.socket.on('chat:message', (m: { name: string; text: string }) =>
      heard.push(`${m.name}:${m.text}`),
    )
    await emit<PlainAck>(host, 'chat:send', { text: 'belote !' })
    await until(() => heard.length > 0, 'the chat message')
    expect(heard).toEqual(['Ana:belote !'])
  })
})
