import { randomUUID } from 'node:crypto'
import {
  DEFAULT_TABLE_RULES,
  applyMove,
  botMove,
  createGame,
  err,
  nextHand,
  ok,
  type BotLevel,
  type GameRecord,
  type GameState,
  type Move,
  type Result,
  type TableRules,
} from '@belote/engine'
import {
  SEAT_COUNT,
  buildPlayerView,
  type ErrorCode,
  type GameEvent,
  type LobbyView,
  type MatchPace,
  type PlayerView,
  type SeatInfo,
  type SeatOccupant,
  type SeatStatus,
  type TableConfiguration,
} from '@belote/protocol'
import { diffEvents } from './game-events.js'

type Human = {
  kind: 'human'
  name: string
  /** The player's identity across reconnections. Never the socket id. */
  sessionToken: string
  socketId: string | null
  status: SeatStatus
}

type Bot = {
  kind: 'bot'
  name: string
  level: BotLevel
  /** Set when the bot holds a human's seat: their name, and the token that reclaims it. */
  standIn: { name: string; sessionToken: string } | null
}

type Slot = Human | Bot | { kind: 'empty' }

/** What the clock owner has to do next; see RoomManager.schedule. */
export type Automation =
  | { kind: 'none' }
  | { kind: 'bot'; seat: number }
  | { kind: 'absent'; seat: number }
  | { kind: 'human'; seat: number }
  | { kind: 'hand' }

const BOT_NAMES = [
  'Marcel',
  'Josette',
  'Gaston',
  'Odette',
  'Lucien',
  'Colette',
  'Raymond',
  'Simone',
]

/**
 * One room: a lobby, then a game. Deliberately synchronous and timer-free - it
 * knows nothing of socket.io or setTimeout, which is what makes the whole
 * lifecycle testable without a clock or a network. Timers live in RoomManager,
 * which calls back into the automatic entry points (botStep, forceTurnMove,
 * dealNextHandAutomatically, expireGrace) when one elapses.
 *
 * Member seat number == engine seat index, always: slots are the four seats.
 */
export class Room {
  readonly code: string
  private readonly slots: Slot[] = Array.from({ length: SEAT_COUNT }, () => ({ kind: 'empty' }))
  private host = 0
  private game: GameState | null = null
  /** Every step since the deal, so a reported bug can be replayed exactly. */
  private record: GameRecord | null = null
  private pace: MatchPace
  private rules: TableRules
  /* Held, never computed: RoomManager hands the deadlines in, so no clock is read here. */
  private turnDeadline: number | null = null
  private nextHandDeadline: number | null = null
  /** Bumped by every change of the game, so a timer can tell the turn it was armed for. */
  private counter = 0
  private completedTrick = false

  constructor(code: string, pace: MatchPace = null, rules: TableRules = DEFAULT_TABLE_RULES) {
    this.code = code
    this.pace = pace
    this.rules = rules
  }

  /* ---------- reads ---------- */

  get phase(): 'lobby' | 'playing' | 'finished' {
    if (this.game === null) return 'lobby'
    return this.game.phase === 'finished' ? 'finished' : 'playing'
  }

  get hostSeat(): number {
    return this.host
  }

  get turnSeconds(): number | null {
    return this.pace?.turnSeconds ?? null
  }

  get moveCounter(): number {
    return this.counter
  }

  /** True when the move that was just applied completed a trick, which the table should see. */
  get trickJustCompleted(): boolean {
    return this.completedTrick
  }

  setTurnDeadline(at: number | null): void {
    this.turnDeadline = at
  }

  setNextHandDeadline(at: number | null): void {
    this.nextHandDeadline = at
  }

  get seatCount(): number {
    return SEAT_COUNT
  }

  nameAt(seat: number): string | null {
    const slot = this.slots[seat]
    return slot !== undefined && slot.kind !== 'empty' ? slot.name : null
  }

  /** The socket attached to a human seat, null for a bot, an empty seat or an absent human. */
  socketAt(seat: number): string | null {
    const slot = this.slots[seat]
    return slot?.kind === 'human' ? slot.socketId : null
  }

  seatOfSocket(socketId: string): number | null {
    const index = this.slots.findIndex((s) => s.kind === 'human' && s.socketId === socketId)
    return index === -1 ? null : index
  }

  /** No socket is attached right now, which is also true of a table of players mid-reload. */
  isEmpty(): boolean {
    return this.slots.every((s) => s.kind !== 'human' || s.socketId === null)
  }

  /** No human could ever come back: nobody sits here, or only bots (stand-ins included). */
  /** The current game as a replayable record, or null before the first deal. */
  get gameRecord(): GameRecord | null {
    return this.record
  }

  /** True once the current game has a winner. */
  get gameFinished(): boolean {
    return this.game?.phase === 'finished'
  }

  get abandoned(): boolean {
    return this.humanSeats().length === 0
  }

  statusAt(seat: number): SeatStatus | null {
    const slot = this.slots[seat]
    return slot?.kind === 'human' ? slot.status : null
  }

  private humanSeats(): number[] {
    return this.slots.flatMap((s, i) => (s.kind === 'human' ? [i] : []))
  }

  seatInfos(): SeatInfo[] {
    return this.slots.map((s, seat): SeatInfo => {
      if (s.kind === 'human') return { seat, kind: 'human', name: s.name, status: s.status }
      if (s.kind === 'bot') {
        return {
          seat,
          kind: 'bot',
          name: s.name,
          level: s.level,
          standingInFor: s.standIn?.name ?? null,
        }
      }
      return { seat, kind: 'empty' }
    })
  }

  get canStart(): boolean {
    return this.slots.every((s) => s.kind !== 'empty')
  }

  get configurable(): boolean {
    return this.game === null
  }

  lobbyView(): LobbyView {
    return {
      roomCode: this.code,
      hostSeat: this.host,
      seats: this.seatInfos(),
      canStart: this.canStart,
      pace: this.pace,
      rules: this.rules,
      configurable: this.configurable,
    }
  }

  viewFor(seat: number): PlayerView | null {
    if (this.game === null) return null
    return buildPlayerView(this.game, seat, this.seatInfos(), {
      turnDeadline: this.turnDeadline,
      nextHandDeadline: this.nextHandDeadline,
    })
  }

  /** Who has to act next, so RoomManager can arm exactly one timer for it. */
  automation(): Automation {
    const game = this.game
    if (game === null || game.phase === 'finished') return { kind: 'none' }
    if (game.hand.phase === 'done') return { kind: 'hand' }
    const seat = game.hand.currentSeat
    const slot = this.slots[seat]
    if (slot?.kind === 'bot') return { kind: 'bot', seat }
    if (slot?.kind === 'human') {
      if (slot.status === 'disconnected') return { kind: 'absent', seat }
      return this.pace === null ? { kind: 'none' } : { kind: 'human', seat }
    }
    return { kind: 'none' }
  }

  /* ---------- lobby ---------- */

  join(
    name: string,
    socketId: string,
  ): Result<{ seat: number; sessionToken: string; reclaimed?: true }, ErrorCode> {
    if (this.phase !== 'lobby') return this.reclaimByName(name, socketId)
    // Idempotent per socket: a double tap otherwise seats a ghost that never disconnects.
    const already = this.seatOfSocket(socketId)
    const existing = already === null ? undefined : this.slots[already]
    if (already !== null && existing?.kind === 'human') {
      return ok({ seat: already, sessionToken: existing.sessionToken })
    }

    const seat = this.slots.findIndex((s) => s.kind === 'empty')
    if (seat === -1) return err('room_full')
    const member: Human = {
      kind: 'human',
      name,
      sessionToken: randomUUID(),
      socketId,
      status: 'active',
    }
    this.slots[seat] = member
    if (this.humanSeats().length === 1) this.host = seat
    return ok({ seat, sessionToken: member.sessionToken })
  }

  configure(bySeat: number, changes: TableConfiguration): Result<GameEvent[], ErrorCode> {
    if (!this.configurable) return err('game_already_started')
    if (bySeat !== this.host) return err('not_host')
    if (changes.pace !== undefined) this.pace = changes.pace
    if (changes.rules !== undefined) this.rules = changes.rules
    return ok([])
  }

  setSeat(bySeat: number, seat: number, occupant: SeatOccupant): Result<GameEvent[], ErrorCode> {
    if (!this.configurable) return err('game_already_started')
    if (bySeat !== this.host) return err('not_host')
    const slot = this.slots[seat]
    if (slot === undefined) return err('invalid_payload')
    if (slot.kind === 'human') return err('seat_taken')
    if (occupant.kind === 'empty') {
      this.slots[seat] = { kind: 'empty' }
    } else {
      const name = slot.kind === 'bot' ? slot.name : this.freeBotName()
      this.slots[seat] = { kind: 'bot', name, level: occupant.level, standIn: null }
    }
    return ok([])
  }

  moveSeat(fromSeat: number, toSeat: number): Result<{ seat: number }, ErrorCode> {
    if (!this.configurable) return err('game_already_started')
    const mover = this.slots[fromSeat]
    const target = this.slots[toSeat]
    if (mover?.kind !== 'human' || target === undefined) return err('invalid_payload')
    if (fromSeat === toSeat) return ok({ seat: toSeat })
    if (target.kind !== 'empty') return err('seat_taken')
    this.slots[toSeat] = mover
    this.slots[fromSeat] = { kind: 'empty' }
    if (this.host === fromSeat) this.host = toSeat
    return ok({ seat: toSeat })
  }

  private freeBotName(): string {
    const used = new Set(this.slots.flatMap((s) => (s.kind === 'empty' ? [] : [s.name])))
    return BOT_NAMES.find((n) => !used.has(n)) ?? `${BOT_NAMES[0] ?? 'Bot'} ${this.slots.length}`
  }

  /* ---------- game ---------- */

  start(bySeat: number, seed: number): Result<GameEvent[], ErrorCode> {
    if (this.game !== null) return err('game_already_started')
    if (bySeat !== this.host) return err('not_host')
    if (!this.canStart) return err('seats_not_filled')
    return ok(this.deal(seed, []))
  }

  /** The hand is over and the table asked for the next one before the clock did. */
  nextHand(bySeat: number): Result<GameEvent[], ErrorCode> {
    if (this.game === null) return err('game_not_started')
    if (this.slots[bySeat]?.kind !== 'human') return err('invalid_payload')
    if (this.game.phase === 'finished') return err('game_over')
    if (this.game.hand.phase !== 'done') return err('hand_in_progress')
    return ok(this.dealNextHand())
  }

  /** The clock dealing the next hand: silent when there is nothing to deal any more. */
  dealNextHandAutomatically(): GameEvent[] {
    if (this.game === null || this.game.phase === 'finished') return []
    if (this.game.hand.phase !== 'done') return []
    return this.dealNextHand()
  }

  restart(bySeat: number, seed: number): Result<GameEvent[], ErrorCode> {
    if (this.game === null) return err('game_not_started')
    if (bySeat !== this.host) return err('not_host')
    if (this.game.phase !== 'finished') return err('hand_in_progress')
    return ok(this.deal(seed, [{ type: 'gameRestarted' }]))
  }

  private deal(seed: number, lead: GameEvent[]): GameEvent[] {
    this.game = createGame({ seed, rules: this.rules })
    this.record = { seed, rules: this.rules, steps: [] }
    this.counter += 1
    this.completedTrick = false
    return [
      ...lead,
      { type: 'handStarted', number: this.game.handNumber, dealer: this.game.hand.dealer },
    ]
  }

  private dealNextHand(): GameEvent[] {
    if (this.game === null) return []
    this.game = nextHand(this.game)
    this.record?.steps.push({ kind: 'nextHand' })
    this.counter += 1
    this.completedTrick = false
    return [{ type: 'handStarted', number: this.game.handNumber, dealer: this.game.hand.dealer }]
  }

  move(seat: number, move: Move): Result<GameEvent[], ErrorCode> {
    if (this.game === null) return err('game_not_started')
    if (this.slots[seat]?.kind !== 'human') return err('not_your_turn')
    return this.apply(seat, move, [])
  }

  private apply(seat: number, move: Move, lead: GameEvent[]): Result<GameEvent[], ErrorCode> {
    const before = this.game
    if (before === null) return err('game_not_started')
    const result = applyMove(before, seat, move)
    if (!result.okay) {
      switch (result.error) {
        case 'game_finished':
          return err('game_over')
        case 'not_your_turn':
          return err('not_your_turn')
        default:
          return err('illegal_move')
      }
    }
    this.game = result.value
    this.record?.steps.push({ kind: 'move', seat, move })
    this.counter += 1
    this.completedTrick =
      result.value.hand.phase !== 'done' &&
      result.value.hand.tricks.length > before.hand.tricks.length
    return ok([...lead, ...diffEvents(before, result.value, seat, move)])
  }

  /** Plays for the seat on turn when a bot holds it, or its human is absent. */
  botStep(): GameEvent[] {
    const game = this.game
    if (game === null || game.phase === 'finished' || game.hand.phase === 'done') return []
    const seat = game.hand.currentSeat
    const slot = this.slots[seat]
    if (slot === undefined || slot.kind === 'empty') return []
    if (slot.kind === 'human' && slot.status !== 'disconnected') return []
    const level: BotLevel = slot.kind === 'bot' ? slot.level : 'normal'
    const move = botMove(game, seat, level, this.counter)
    if (move === null) return []
    const applied = this.apply(seat, move, [])
    return applied.okay ? applied.value : []
  }

  /** The turn clock ran out on a human: a normal bot plays their move. */
  forceTurnMove(): GameEvent[] {
    const game = this.game
    if (game === null || game.phase === 'finished' || game.hand.phase === 'done') return []
    const seat = game.hand.currentSeat
    if (this.slots[seat]?.kind !== 'human') return []
    const move = botMove(game, seat, 'normal', this.counter)
    if (move === null) return []
    const applied = this.apply(seat, move, [{ type: 'turnTimedOut', seat }])
    return applied.okay ? applied.value : []
  }

  /* ---------- presence ---------- */

  disconnect(socketId: string): { seat: number; events: GameEvent[] } | null {
    const seat = this.seatOfSocket(socketId)
    const slot = seat === null ? undefined : this.slots[seat]
    if (seat === null || slot?.kind !== 'human') return null
    slot.socketId = null
    slot.status = 'disconnected'
    this.transferHostIfNeeded()
    return { seat, events: [{ type: 'seatDisconnected', seat }] }
  }

  /** Giving up a seat on purpose: freed in the lobby, held by a bot mid-game. */
  leave(socketId: string): { seat: number; events: GameEvent[] } | null {
    const seat = this.seatOfSocket(socketId)
    if (seat === null) return null
    return { seat, events: this.vacate(seat) }
  }

  /**
   * `supersededSocketId` is the socket this rejoin took the seat from, when it was
   * still attached: a second tab. The caller must evict it, or it keeps acting as the seat.
   */
  rejoin(
    sessionToken: string,
    socketId: string,
  ): Result<{ seat: number; supersededSocketId: string | null }, ErrorCode> {
    const seat = this.slots.findIndex(
      (s) =>
        (s.kind === 'human' && s.sessionToken === sessionToken) ||
        (s.kind === 'bot' && s.standIn?.sessionToken === sessionToken),
    )
    const slot = this.slots[seat]
    if (slot === undefined || slot.kind === 'empty') return err('invalid_session')

    if (slot.kind === 'bot') {
      if (slot.standIn === null) return err('invalid_session')
      this.slots[seat] = {
        kind: 'human',
        name: slot.standIn.name,
        sessionToken,
        socketId,
        status: 'active',
      }
      if (this.humanSeats().length === 1) this.host = seat
      return ok({ seat, supersededSocketId: null })
    }
    const previous = slot.socketId
    slot.socketId = socketId
    slot.status = 'active'
    return ok({
      seat,
      supersededSocketId: previous !== null && previous !== socketId ? previous : null,
    })
  }

  /**
   * A mid-game join from a browser without the session token: the name alone gives back
   * an absent player's seat. Trusts the table code and the name, which suits friends only.
   */
  private reclaimByName(
    name: string,
    socketId: string,
  ): Result<{ seat: number; sessionToken: string; reclaimed: true }, ErrorCode> {
    const wanted = name.trim().toLocaleLowerCase()
    const same = (n: string) => n.trim().toLocaleLowerCase() === wanted
    let token: string | null = null
    for (const s of this.slots) {
      if (s.kind === 'human' && s.status === 'disconnected' && same(s.name)) token = s.sessionToken
      else if (s.kind === 'bot' && s.standIn !== null && same(s.standIn.name))
        token = s.standIn.sessionToken
      if (token !== null) break
    }
    if (token === null) return err('game_already_started')
    const rejoined = this.rejoin(token, socketId)
    if (!rejoined.okay) return rejoined
    return ok({ seat: rejoined.value.seat, sessionToken: token, reclaimed: true })
  }

  /** Called by RoomManager when the reclaim window elapses on a disconnected human. */
  expireGrace(seat: number): GameEvent[] {
    const slot = this.slots[seat]
    if (slot?.kind !== 'human' || slot.status !== 'disconnected') return []
    return this.vacate(seat)
  }

  private vacate(seat: number): GameEvent[] {
    const slot = this.slots[seat]
    if (slot?.kind !== 'human') return []
    let events: GameEvent[]
    if (this.game === null) {
      this.slots[seat] = { kind: 'empty' }
      events = [{ type: 'seatLeft', seat }]
    } else {
      this.slots[seat] = {
        kind: 'bot',
        name: slot.name,
        level: 'normal',
        standIn: { name: slot.name, sessionToken: slot.sessionToken },
      }
      this.counter += 1
      events = [{ type: 'botTookOver', seat }]
    }
    this.transferHostIfNeeded()
    return events
  }

  /** The host role follows the lowest-indexed human still present, connected ones first. */
  private transferHostIfNeeded(): void {
    const current = this.slots[this.host]
    if (current?.kind === 'human' && current.status === 'active') return
    const humans = this.humanSeats()
    const next =
      humans.find((i) => (this.slots[i] as Human).status === 'active') ?? humans[0] ?? this.host
    this.host = next
  }
}
