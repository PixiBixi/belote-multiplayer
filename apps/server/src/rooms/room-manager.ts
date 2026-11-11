import {
  DEFAULT_TABLE_RULES,
  err,
  ok,
  type DeckSeed,
  type Result,
  type TableRules,
} from '@belote/engine'
import {
  BETWEEN_HANDS_SECONDS,
  BOT_DELAY_MS,
  TRICK_PAUSE_MS,
  type ErrorCode,
  type GameEvent,
  type MatchPace,
} from '@belote/protocol'
import { randomDealSeed } from './deal-seed.js'
import { generateRoomCode } from './room-code.js'
import { Room } from './room.js'

export type Timers = {
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

type RoomManagerOptions = {
  maxRooms: number
  /** Rooms one owner (a client IP) may hold at once. Unlimited when omitted. */
  maxRoomsPerOwner?: number
  gracePeriodMs: number
  timers?: Timers
  seedSource?: () => DeckSeed
  /** Injectable for the same reason the timers are: tests must not wait. */
  now?: () => number
}

/** How long a disconnected human may sit on their turn before a normal bot plays it. */
export const ABSENT_TURN_GRACE_MS = 15_000

const defaultTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/**
 * The room directory, and the only place in the server that owns timers. They
 * sit behind an injectable interface so tests never wait on real time.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>()
  private readonly graceTimers = new Map<string, unknown>()
  /** The one timer a room owns, with what it was armed for so a presence change can tell. */
  private readonly autoTimers = new Map<
    string,
    { handle: unknown; counter: number; kind: string; seat: number | null }
  >()
  /** When a room last became empty, so purge can tell "gone" from "gone for good". */
  private readonly emptySince = new Map<string, number>()
  /** Told the code of each purged room, so the socket layer can drop what it keeps per room. */
  private readonly purgeListeners: ((code: string, room: Room) => void)[] = []
  private readonly maxRooms: number
  private readonly maxRoomsPerOwner: number
  /** Who created each room, and how many each owner holds, until the room is dropped. */
  private readonly ownerOf = new Map<string, string>()
  private readonly ownedCount = new Map<string, number>()
  private readonly gracePeriodMs: number
  private readonly timers: Timers
  private readonly seedSource: () => DeckSeed
  private readonly now: () => number

  constructor(options: RoomManagerOptions) {
    this.maxRooms = options.maxRooms
    this.maxRoomsPerOwner = options.maxRoomsPerOwner ?? Number.POSITIVE_INFINITY
    this.gracePeriodMs = options.gracePeriodMs
    this.timers = options.timers ?? defaultTimers
    this.seedSource = options.seedSource ?? randomDealSeed
    this.now = options.now ?? (() => Date.now())
  }

  get size(): number {
    return this.rooms.size
  }

  create(
    pace: MatchPace = null,
    rules: TableRules = DEFAULT_TABLE_RULES,
    owner: string | null = null,
  ): Result<Room, ErrorCode> {
    if (this.rooms.size >= this.maxRooms) return err('server_full')
    const owned = owner === null ? 0 : (this.ownedCount.get(owner) ?? 0)
    if (owned >= this.maxRoomsPerOwner) return err('rate_limited')

    // Retry on the astronomically unlikely collision rather than overwrite.
    let code = generateRoomCode()
    for (let attempt = 0; this.rooms.has(code) && attempt < 10; attempt++) {
      code = generateRoomCode()
    }
    if (this.rooms.has(code)) return err('server_full')

    const room = new Room(code, pace, rules)
    this.rooms.set(code, room)
    if (owner !== null) {
      this.ownerOf.set(code, owner)
      this.ownedCount.set(owner, owned + 1)
    }
    return ok(room)
  }

  /** The seed source, so a start or restart can draw one without owning randomness. */
  nextSeed(): DeckSeed {
    return this.seedSource()
  }

  get(code: string): Room | null {
    return this.rooms.get(code.toUpperCase()) ?? null
  }

  onPurge(listener: (code: string, room: Room) => void): void {
    this.purgeListeners.push(listener)
  }

  scheduleGrace(room: Room, seat: number, onExpire: (events: GameEvent[]) => void): void {
    this.cancelGrace(room, seat)
    const key = graceKey(room.code, seat)
    const handle = this.timers.setTimeout(() => {
      this.graceTimers.delete(key)
      onExpire(room.expireGrace(seat))
    }, this.gracePeriodMs)
    this.graceTimers.set(key, handle)
  }

  cancelGrace(room: Room, seat: number): void {
    const key = graceKey(room.code, seat)
    const handle = this.graceTimers.get(key)
    if (handle === undefined) return
    this.timers.clearTimeout(handle)
    this.graceTimers.delete(key)
  }

  /**
   * Arms the one timer the room is owed, and writes its deadlines into the room so
   * every view agrees on them. Idempotent for the same situation: a presence change or
   * a repeated call keeps the running timer, so a rejoin loop cannot stall the table.
   *
   * What it times depends on who has to act: a bot (after its thinking delay, plus the
   * trick pause), a human on a table with a clock (their turn), an absent human (a short
   * grace, then a normal bot plays), or the pause before the next hand deals itself.
   * `notify` receives the events of whatever fired, after the room was re-timed, so the
   * deadlines in the views it sends already belong to the next situation.
   */
  schedule(room: Room, notify: (events: GameEvent[]) => void): void {
    const plan = room.automation()
    const seat = 'seat' in plan ? plan.seat : null
    const armed = this.autoTimers.get(room.code)
    if (
      armed !== undefined &&
      armed.counter === room.moveCounter &&
      armed.kind === plan.kind &&
      armed.seat === seat
    ) {
      return
    }
    this.cancelAuto(room)

    const refire =
      (run: () => GameEvent[]): (() => void) =>
      () => {
        this.autoTimers.delete(room.code)
        room.setTurnDeadline(null)
        room.setNextHandDeadline(null)
        const events = run()
        this.schedule(room, notify)
        notify(events)
      }

    let ms: number
    let run: () => GameEvent[]
    switch (plan.kind) {
      case 'none':
        return
      case 'bot':
        ms = BOT_DELAY_MS + (room.trickJustCompleted ? TRICK_PAUSE_MS : 0)
        run = () => room.botStep()
        break
      case 'absent':
        ms = Math.min(ABSENT_TURN_GRACE_MS, this.gracePeriodMs)
        run = () => room.botStep()
        break
      case 'human': {
        ms = (room.turnSeconds ?? 0) * 1000
        room.setTurnDeadline(this.now() + ms)
        run = () => room.forceTurnMove()
        break
      }
      case 'hand':
        ms = BETWEEN_HANDS_SECONDS * 1000
        room.setNextHandDeadline(this.now() + ms)
        run = () => room.dealNextHandAutomatically(this.nextSeed())
        break
    }
    const handle = this.timers.setTimeout(refire(run), ms)
    this.autoTimers.set(room.code, { handle, counter: room.moveCounter, kind: plan.kind, seat })
  }

  cancelAuto(room: Room): void {
    const armed = this.autoTimers.get(room.code)
    if (armed !== undefined) {
      this.timers.clearTimeout(armed.handle)
      this.autoTimers.delete(room.code)
    }
    room.setTurnDeadline(null)
    room.setNextHandDeadline(null)
  }

  /** Removes a room nobody can come back to (no human seat left). True when it was dropped. */
  dropIfAbandoned(room: Room): boolean {
    if (!room.abandoned || this.rooms.get(room.code) !== room) return false
    this.drop(room)
    return true
  }

  /** Gives a dropped room back to its owner's allowance; the count is removed at zero. */
  private releaseOwner(code: string): void {
    const owner = this.ownerOf.get(code)
    if (owner === undefined) return
    this.ownerOf.delete(code)
    const left = (this.ownedCount.get(owner) ?? 1) - 1
    if (left > 0) this.ownedCount.set(owner, left)
    else this.ownedCount.delete(owner)
  }

  private drop(room: Room): void {
    for (let seat = 0; seat < room.seatCount; seat++) this.cancelGrace(room, seat)
    this.cancelAuto(room)
    this.rooms.delete(room.code)
    this.emptySince.delete(room.code)
    this.releaseOwner(room.code)
    for (const listener of this.purgeListeners) listener(room.code, room)
  }

  /**
   * Drops rooms nobody is connected to. Returns how many went away.
   *
   * "Empty" alone is not enough: it becomes true the instant every socket id is
   * null, which includes players still inside their grace period. Purge runs on
   * the same cadence as that grace period, so it used to win whenever its tick
   * landed first - cancelling the very grace timers it was pre-empting, and
   * losing the game for anyone who reloaded at the wrong moment. A room now has
   * to have STAYED empty for a full grace period.
   */
  purge(): number {
    let removed = 0
    for (const [code, room] of this.rooms) {
      if (!room.isEmpty()) {
        this.emptySince.delete(code)
        continue
      }

      /* An abandoned room goes at once: rejoin refuses a seat that has left, so
         holding it for a grace period protects nobody. Only a room whose players
         might still be mid-reload gets the wait. */
      if (!room.abandoned) {
        const since = this.emptySince.get(code) ?? this.now()
        this.emptySince.set(code, since)
        if (this.now() - since < this.gracePeriodMs) continue
      }
      this.drop(room)
      removed++
    }
    return removed
  }
}

const graceKey = (code: string, seat: number): string => `${code}#${seat}`
