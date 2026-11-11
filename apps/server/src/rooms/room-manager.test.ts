import { DEFAULT_TABLE_RULES, replay } from '@belote/engine'
import {
  BETWEEN_HANDS_SECONDS,
  BOT_DELAY_MS,
  TRICK_PAUSE_MS,
  type GameEvent,
  type PlayerView,
} from '@belote/protocol'
import { describe, expect, it } from 'vitest'
import { ABSENT_TURN_GRACE_MS, RoomManager, type Timers } from './room-manager.js'
import type { Room } from './room.js'

/** Collects scheduled callbacks with their delay so a test can fire them on demand. */
const manualTimers = () => {
  const pending = new Map<number, { fn: () => void; ms: number }>()
  let nextHandle = 1
  const timers: Timers = {
    setTimeout(fn, ms) {
      const handle = nextHandle++
      pending.set(handle, { fn, ms })
      return handle
    },
    clearTimeout(handle) {
      pending.delete(handle as number)
    },
  }
  return {
    timers,
    fireAll: () => {
      const callbacks = [...pending.values()]
      pending.clear()
      for (const { fn } of callbacks) fn()
    },
    delays: () => [...pending.values()].map((p) => p.ms),
    pendingCount: () => pending.size,
  }
}

const managerWith = (overrides: { maxRooms?: number } = {}) => {
  const clock = manualTimers()
  const time = { now: 1_000_000 }
  // The first deal keeps seed 42; every later one gets its own, as the crypto source gives.
  let seed = 41
  const manager = new RoomManager({
    maxRooms: overrides.maxRooms ?? 10,
    gracePeriodMs: 60_000,
    timers: clock.timers,
    seedSource: () => ++seed,
    now: () => time.now,
  })
  return { manager, clock, time }
}

const createdRoom = (manager: RoomManager, pace: { turnSeconds: number } | null = null) => {
  const created = manager.create(pace, { ...DEFAULT_TABLE_RULES, target: 501 })
  if (!created.okay) throw new Error(created.error)
  return created.value
}

/** Ana at seat 0 (host) and three normal bots, dealt and ready. */
const startedTable = (manager: RoomManager, pace: { turnSeconds: number } | null = null) => {
  const room = createdRoom(manager, pace)
  const joined = room.join('Ana', 'socket-0')
  if (!joined.okay) throw new Error(joined.error)
  for (const seat of [1, 2, 3]) room.setSeat(0, seat, { kind: 'bot', level: 'normal' })
  const started = room.start(0, manager.nextSeed())
  if (!started.okay) throw new Error(started.error)
  return { room, token: joined.value.sessionToken }
}

const views = (room: Room): PlayerView[] =>
  [0, 1, 2, 3].flatMap((seat) => {
    const view = room.viewFor(seat)
    return view === null ? [] : [view]
  })

/** Everything a view says besides the seat's own hand and the rule-public declarations. */
const publicPart = (view: PlayerView): string =>
  JSON.stringify({
    ...view,
    you: undefined,
    hand: { ...view.hand, announced: undefined, shownDeclarations: undefined },
  })

const assertNoLeak = (room: Room): void => {
  const all = views(room)
  for (const a of all) {
    const text = publicPart(a)
    for (const b of all) {
      if (a.you.seat === b.you.seat) continue
      for (const card of b.you.hand) expect(text).not.toContain(`"id":"${card.id}"`)
    }
  }
}

describe('RoomManager.create', () => {
  it('creates a room reachable by its code, case-insensitively', () => {
    const { manager } = managerWith()
    const room = createdRoom(manager)
    expect(manager.get(room.code)).toBe(room)
    expect(manager.get(room.code.toLowerCase())).toBe(room)
  })

  it('returns null for an unknown code', () => {
    expect(managerWith().manager.get('ZZZZZZ')).toBeNull()
  })

  it('refuses to exceed the room cap, bounding memory', () => {
    const { manager } = managerWith({ maxRooms: 2 })
    expect(manager.create(null).okay).toBe(true)
    expect(manager.create(null).okay).toBe(true)
    expect(manager.create(null)).toEqual({ okay: false, error: 'server_full' })
  })

  it('caps the rooms one client holds, so one address cannot fill the server', () => {
    const manager = new RoomManager({ maxRooms: 10, maxRoomsPerOwner: 2, gracePeriodMs: 0 })
    const create = (owner: string) => manager.create(null, undefined, owner)
    expect(create('203.0.113.7').okay).toBe(true)
    expect(create('203.0.113.7').okay).toBe(true)
    expect(create('203.0.113.7')).toEqual({ okay: false, error: 'rate_limited' })
    expect(create('198.51.100.1').okay).toBe(true)
  })

  it('gives a client its allowance back when its rooms are purged', () => {
    const manager = new RoomManager({ maxRooms: 10, maxRoomsPerOwner: 1, gracePeriodMs: 0 })
    const create = () => manager.create(null, undefined, '203.0.113.7')
    expect(create().okay).toBe(true)
    expect(create().okay).toBe(false)
    expect(manager.purge()).toBe(1)
    expect(create().okay).toBe(true)
  })

  it('gives the allowance back when an abandoned room is dropped too', () => {
    const manager = new RoomManager({ maxRooms: 10, maxRoomsPerOwner: 1, gracePeriodMs: 0 })
    const created = manager.create(null, undefined, '203.0.113.7')
    if (!created.okay) throw new Error(created.error)
    expect(manager.dropIfAbandoned(created.value)).toBe(true)
    expect(manager.create(null, undefined, '203.0.113.7').okay).toBe(true)
  })
})

describe('RoomManager.purge', () => {
  it('removes rooms nobody is connected to, and tells its listeners', () => {
    const { manager } = managerWith()
    const gone = createdRoom(manager)
    createdRoom(manager).join('Ana', 'socket-0')
    const purged: string[] = []
    manager.onPurge((code) => purged.push(code))
    expect(manager.purge()).toBe(1)
    expect(purged).toEqual([gone.code])
    expect(manager.size).toBe(1)
  })

  it('drops a room at once when no human is left, and cancels its timers', () => {
    const { manager, clock } = managerWith()
    const { room } = startedTable(manager)
    manager.schedule(room, () => undefined)
    expect(clock.pendingCount()).toBe(1)
    room.leave('socket-0')
    expect(manager.dropIfAbandoned(room)).toBe(true)
    expect(manager.get(room.code)).toBeNull()
    expect(clock.pendingCount()).toBe(0)
  })
})

describe('bots', () => {
  it('plays a bot turn after BOT_DELAY_MS, plus the trick pause after a completed trick', () => {
    const { manager, clock } = managerWith()
    const { room } = startedTable(manager)
    room.leave('socket-0')
    manager.schedule(room, () => undefined)
    expect(clock.delays()).toEqual([BOT_DELAY_MS])

    let sawPause = false
    for (let i = 0; i < 500 && room.phase === 'playing'; i++) {
      const wasPause = room.trickJustCompleted && room.automation().kind === 'bot'
      if (wasPause) {
        expect(clock.delays()).toEqual([BOT_DELAY_MS + TRICK_PAUSE_MS])
        sawPause = true
        break
      }
      clock.fireAll()
    }
    expect(sawPause).toBe(true)
  })

  it('plays a whole game to the end with four bots, then restarts it', () => {
    const { manager, clock, time } = managerWith()
    const { room, token } = startedTable(manager)
    room.leave('socket-0')

    const events: GameEvent[] = []
    const notify = (batch: GameEvent[]): void => {
      events.push(...batch)
      assertNoLeak(room)
    }
    manager.schedule(room, notify)
    let fired = 0
    while (clock.pendingCount() > 0 && fired < 20_000) {
      time.now += 1000
      clock.fireAll()
      fired++
    }

    const types = events.map((e) => e.type)
    expect(fired).toBeLessThan(20_000)
    expect(room.phase).toBe('finished')
    expect(types.filter((t) => t === 'gameEnded')).toHaveLength(1)
    expect(types.at(-1)).toBe('gameEnded')
    expect(types.filter((t) => t === 'handStarted').length).toBeGreaterThan(1)
    expect(types).toContain('handEnded')
    expect(clock.pendingCount()).toBe(0)

    const final = room.viewFor(0)
    expect(final?.phase).toBe('finished')
    expect(Math.max(...(final?.scores ?? [0]))).toBeGreaterThanOrEqual(501)

    // The host comes back and starts a new game on the same table.
    expect(room.rejoin(token, 'socket-new').okay).toBe(true)
    const restarted = room.restart(0, 7)
    expect(restarted.okay && restarted.value.map((e) => e.type)).toEqual([
      'gameRestarted',
      'handStarted',
    ])
    expect(room.viewFor(0)?.scores).toEqual([0, 0])
    expect(room.viewFor(0)?.history).toEqual([])
  })

  it('deals the next hand by itself after BETWEEN_HANDS_SECONDS and exposes the deadline', () => {
    const { manager, clock, time } = managerWith()
    const { room } = startedTable(manager)
    room.leave('socket-0')
    const events: GameEvent[] = []
    manager.schedule(room, (batch) => events.push(...batch))
    while (room.automation().kind !== 'hand') clock.fireAll()

    expect(clock.delays()).toEqual([BETWEEN_HANDS_SECONDS * 1000])
    expect(room.viewFor(0)?.nextHandDeadline).toBe(time.now + BETWEEN_HANDS_SECONDS * 1000)
    const before = events.filter((e) => e.type === 'handStarted').length
    clock.fireAll()
    expect(events.filter((e) => e.type === 'handStarted')).toHaveLength(before + 1)
    expect(room.viewFor(0)?.nextHandDeadline).toBeNull()
  })

  it('lets a human skip the wait with nextHand, and refuses it mid-hand', () => {
    const { manager, clock } = managerWith()
    const { room } = startedTable(manager, { turnSeconds: 10 })
    expect(room.nextHand(0, manager.nextSeed())).toEqual({ okay: false, error: 'hand_in_progress' })
    manager.schedule(room, () => undefined)
    for (let i = 0; i < 2000 && room.automation().kind !== 'hand'; i++) clock.fireAll()
    expect(room.automation().kind).toBe('hand')
    const dealt = room.nextHand(0, manager.nextSeed())
    expect(dealt.okay && dealt.value[0]).toMatchObject({ type: 'handStarted', number: 2 })
  })
})

describe('hidden information', () => {
  it("never puts another seat's cards in a view, at every step of a game", () => {
    const { manager, clock } = managerWith()
    const { room } = startedTable(manager)
    room.leave('socket-0')
    manager.schedule(room, () => assertNoLeak(room))
    assertNoLeak(room)
    for (let i = 0; i < 400 && clock.pendingCount() > 0; i++) clock.fireAll()
    expect(room.viewFor(1)?.you.hand.length).toBeGreaterThanOrEqual(0)
  })

  it('shows only counts for the other hands', () => {
    const { manager } = managerWith()
    const { room } = startedTable(manager)
    const view = room.viewFor(0)
    expect(view?.you.hand).toHaveLength(view?.hand.phase === 'bidding' ? 5 : 8)
    expect(view?.hand.handCounts).toHaveLength(4)
    expect(Object.keys(view?.hand ?? {})).not.toContain('hands')
  })
})

describe('turn clock', () => {
  const untilHumanTurn = (room: Room, clock: ReturnType<typeof manualTimers>) => {
    for (let i = 0; i < 500 && room.automation().kind !== 'human'; i++) clock.fireAll()
  }

  it('gives a human turn a deadline and none to a bot', () => {
    const { manager, clock, time } = managerWith()
    const { room } = startedTable(manager, { turnSeconds: 10 })
    manager.schedule(room, () => undefined)
    if (room.automation().kind === 'bot') expect(room.viewFor(0)?.turnDeadline).toBeNull()
    untilHumanTurn(room, clock)
    expect(room.viewFor(0)?.turnDeadline).toBe(time.now + 10_000)
    expect(clock.delays()).toEqual([10_000])
  })

  it('plays a normal bot move for the human on expiry and says so', () => {
    const { manager, clock } = managerWith()
    const { room } = startedTable(manager, { turnSeconds: 10 })
    const events: GameEvent[] = []
    manager.schedule(room, (batch) => events.push(...batch))
    untilHumanTurn(room, clock)
    const counter = room.moveCounter
    events.length = 0

    clock.fireAll()
    expect(events[0]).toEqual({ type: 'turnTimedOut', seat: 0 })
    expect(events.length).toBeGreaterThan(1)
    expect(room.moveCounter).toBeGreaterThan(counter)
    // The human is still the human: only that move was played for them.
    expect(room.seatInfos()[0]?.kind).toBe('human')
  })

  it('arms no clock for a human on a table without pace', () => {
    const { manager, clock } = managerWith()
    const { room } = startedTable(manager)
    manager.schedule(room, () => undefined)
    for (let i = 0; i < 500 && clock.pendingCount() > 0; i++) clock.fireAll()
    expect(room.automation().kind).toBe('none')
    expect(room.viewFor(0)?.turnDeadline).toBeNull()
  })

  it('keeps the running clock when nothing changed (a rejoin loop cannot stall the table)', () => {
    const { manager, clock, time } = managerWith()
    const { room } = startedTable(manager, { turnSeconds: 10 })
    manager.schedule(room, () => undefined)
    untilHumanTurn(room, clock)
    const deadline = room.viewFor(0)?.turnDeadline
    time.now += 4000
    manager.schedule(room, () => undefined)
    expect(room.viewFor(0)?.turnDeadline).toBe(deadline)
    expect(clock.pendingCount()).toBe(1)
  })
})

describe('game record', () => {
  it('records every move and deal, and replays to the state the table reached', () => {
    const { manager } = managerWith()
    const { room } = startedTable(manager)
    room.leave('socket-0')
    for (let i = 0; i < 20000 && !room.gameFinished; i++) {
      if (room.botStep().length === 0) room.dealNextHandAutomatically(manager.nextSeed())
    }
    expect(room.gameFinished).toBe(true)

    const record = room.gameRecord
    const dealSeeds = (record?.steps ?? []).flatMap((s) => (s.kind === 'nextHand' ? [s.seed] : []))
    expect(dealSeeds.length).toBeGreaterThan(1)
    expect(new Set(dealSeeds).size).toBe(dealSeeds.length)
    const replayed = record === null ? null : replay(record)
    expect(replayed?.okay && replayed.value.scores).toEqual(room.viewFor(1)?.scores)
    expect(replayed?.okay && replayed.value.phase).toBe('finished')
  })
})

describe('leave, disconnect, takeover and reclaim', () => {
  it('turns a seat into a stand-in bot on leave mid-game, and the token reclaims it', () => {
    const { manager } = managerWith()
    const { room, token } = startedTable(manager)
    const handBefore = room.viewFor(0)?.you.hand

    const left = room.leave('socket-0')
    expect(left?.events).toEqual([{ type: 'botTookOver', seat: 0 }])
    expect(room.seatInfos()[0]).toMatchObject({
      kind: 'bot',
      level: 'normal',
      standingInFor: 'Ana',
    })

    const back = room.rejoin(token, 'socket-new')
    expect(back).toEqual({ okay: true, value: { seat: 0, supersededSocketId: null } })
    expect(room.seatInfos()[0]).toMatchObject({ kind: 'human', name: 'Ana', status: 'active' })
    expect(room.viewFor(0)?.you.hand).toEqual(handBefore)
    expect(room.hostSeat).toBe(0)
  })

  it('refuses a token nobody holds', () => {
    const { manager } = managerWith()
    const { room } = startedTable(manager)
    expect(room.rejoin('11111111-2222-4333-8444-555555555555', 's')).toEqual({
      okay: false,
      error: 'invalid_session',
    })
  })

  it('hands a stand-in seat back to a mid-game join under the same name, with its token', () => {
    const { manager } = managerWith()
    const { room, token } = startedTable(manager)
    room.leave('socket-0')

    const back = room.join(' ana ', 'socket-other-browser')
    expect(back).toEqual({ okay: true, value: { seat: 0, sessionToken: token, reclaimed: true } })
    expect(room.seatInfos()[0]).toMatchObject({ kind: 'human', name: 'Ana', status: 'active' })
  })

  it('hands a disconnected seat back to a mid-game join under the same name', () => {
    const { manager } = managerWith()
    const { room, token } = startedTable(manager)
    room.disconnect('socket-0')

    expect(room.join('Ana', 'socket-other-browser')).toEqual({
      okay: true,
      value: { seat: 0, sessionToken: token, reclaimed: true },
    })
  })

  it('still refuses a mid-game join that matches no absent player', () => {
    const { manager } = managerWith()
    const { room } = startedTable(manager)
    expect(room.join('Ana', 'socket-intruder')).toEqual({
      okay: false,
      error: 'game_already_started',
    })
    room.leave('socket-0')
    expect(room.join('Eve', 'socket-intruder')).toEqual({
      okay: false,
      error: 'game_already_started',
    })
  })

  it('keeps a disconnected human seated, and a bot plays their turn after the grace', () => {
    const { manager, clock } = managerWith()
    const { room } = startedTable(manager)
    manager.schedule(room, () => undefined)
    for (let i = 0; i < 500 && room.viewFor(0)?.hand.currentSeat !== 0; i++) clock.fireAll()
    expect(room.viewFor(0)?.hand.currentSeat).toBe(0)

    const gone = room.disconnect('socket-0')
    expect(gone?.events).toEqual([{ type: 'seatDisconnected', seat: 0 }])
    expect(room.seatInfos()[0]).toMatchObject({ kind: 'human', status: 'disconnected' })

    const events: GameEvent[] = []
    manager.schedule(room, (batch) => events.push(...batch))
    expect(clock.delays()).toEqual([ABSENT_TURN_GRACE_MS])
    const counter = room.moveCounter
    clock.fireAll()
    expect(room.moveCounter).toBeGreaterThan(counter)
    expect(room.seatInfos()[0]).toMatchObject({ kind: 'human', status: 'disconnected' })
  })

  it('turns the seat into a bot once the reclaim window runs out', () => {
    const { manager, clock } = managerWith()
    const { room, token } = startedTable(manager)
    room.disconnect('socket-0')
    let received: GameEvent[] = []
    manager.scheduleGrace(room, 0, (events) => (received = events))
    expect(clock.delays()).toEqual([60_000])
    clock.fireAll()
    expect(received).toEqual([{ type: 'botTookOver', seat: 0 }])
    expect(room.seatInfos()[0]).toMatchObject({ kind: 'bot', standingInFor: 'Ana' })
    expect(room.rejoin(token, 'socket-new').okay).toBe(true)
  })

  it('cancels a pending expiry when the player reconnects', () => {
    const { manager, clock } = managerWith()
    const { room, token } = startedTable(manager)
    room.disconnect('socket-0')
    let fired = false
    manager.scheduleGrace(room, 0, () => (fired = true))
    room.rejoin(token, 'socket-new')
    manager.cancelGrace(room, 0)
    clock.fireAll()
    expect(fired).toBe(false)
    expect(room.seatInfos()[0]).toMatchObject({ kind: 'human', status: 'active' })
  })

  it('passes the host on when the host leaves, mid-game too', () => {
    const { manager } = managerWith()
    const room = createdRoom(manager)
    room.join('Ana', 'socket-0')
    room.join('Ben', 'socket-1')
    for (const seat of [2, 3]) room.setSeat(0, seat, { kind: 'bot', level: 'easy' })
    room.start(0, 5)
    room.leave('socket-0')
    expect(room.hostSeat).toBe(1)
    expect(room.abandoned).toBe(false)
  })
})

describe('one socket, one seat', () => {
  const twoHumans = () => {
    const { manager } = managerWith()
    const room = createdRoom(manager)
    const ana = room.join('Ana', 'socket-0')
    const ben = room.join('Ben', 'socket-1')
    if (!ana.okay || !ben.okay) throw new Error('join failed')
    for (const seat of [2, 3]) room.setSeat(0, seat, { kind: 'bot', level: 'normal' })
    const started = room.start(0, manager.nextSeed())
    if (!started.okay) throw new Error(started.error)
    return { room, anaToken: ana.value.sessionToken, benToken: ben.value.sessionToken }
  }

  it('refuses a mid-game join by name from a socket that already holds a seat', () => {
    const { room } = twoHumans()
    room.disconnect('socket-0')
    // socket-1 sits at seat 1 and asks for the absent Ana by name.
    expect(room.join('Ana', 'socket-1')).toEqual({ okay: false, error: 'invalid_session' })
    expect(room.seatOfSocket('socket-1')).toBe(1)
    expect(room.socketAt(0)).toBeNull()
  })

  it('refuses a rejoin with another seat token from a seated socket', () => {
    const { room, anaToken } = twoHumans()
    room.disconnect('socket-0')
    expect(room.rejoin(anaToken, 'socket-1')).toEqual({ okay: false, error: 'invalid_session' })
    expect(room.seatOfSocket('socket-1')).toBe(1)
  })

  it('still lets a socket rejoin the seat it already holds', () => {
    const { room, benToken } = twoHumans()
    expect(room.rejoin(benToken, 'socket-1').okay).toBe(true)
  })
})
