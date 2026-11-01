import { applyMove, createGame, legalMoves, type GameState, type TableRules } from '@belote/engine'
import { buildPlayerView, type LobbyView, type PlayerView, type SeatInfo } from '@belote/protocol'

/** Four humans, so every seat has a name to show. */
export const SEATS: SeatInfo[] = ['Ana', 'Ben', 'Cy', 'Di'].map((name, seat) => ({
  seat,
  kind: 'human',
  name,
  status: 'active',
}))

const TIMING = { turnDeadline: null, nextHandDeadline: null }

/** A fresh deal: the hand is in the bidding phase. Real engine state, so it cannot drift. */
export const freshGame = (rules: Partial<TableRules> = {}, seed = 7): GameState =>
  createGame({ seed, rules })

/** The view of `seat`, or of whoever is on turn when no seat is given. */
export const viewOf = (state: GameState, seat?: number): PlayerView =>
  buildPlayerView(state, seat ?? state.hand.currentSeat, SEATS, TIMING)

/** Plays the first legal non-pass bid, then the first legal card, until `stop` says so. */
export function advance(state: GameState, stop: (s: GameState) => boolean): GameState {
  let current = state
  for (let i = 0; i < 200 && !stop(current); i += 1) {
    const seat = current.hand.currentSeat
    const moves = legalMoves(current, seat)
    const move = moves.find((m) => m.type !== 'pass' && m.type !== 'declare') ?? moves[0]
    if (move === undefined) break
    const next = applyMove(current, seat, move)
    if (!next.okay) throw new Error(`fixture move refused: ${next.error}`)
    current = next.value
  }
  return current
}

/** A game whose first hand is over, with a result to show. */
export const doneGame = (rules: Partial<TableRules> = {}): GameState =>
  advance(freshGame(rules), (s) => s.hand.phase === 'done' || s.phase === 'finished')

/** A game in the card-playing phase. */
export const playingGame = (rules: Partial<TableRules> = {}): GameState =>
  advance(freshGame(rules), (s) => s.hand.phase === 'playing')

export const lobbyView = (over: Partial<LobbyView> = {}): LobbyView => ({
  roomCode: 'ABC234',
  hostSeat: 0,
  seats: [
    SEATS[0] as SeatInfo,
    SEATS[1] as SeatInfo,
    { seat: 2, kind: 'empty' },
    { seat: 3, kind: 'empty' },
  ],
  canStart: false,
  pace: null,
  rules: freshGame().rules,
  configurable: true,
  ...over,
})

/**
 * A card-playing state, second card of a trick, where the seat on turn holds both legal
 * and illegal cards. Searched by seed rather than hand-built, so it stays real engine state.
 */
export function constrainedGame(): GameState {
  for (let seed = 1; seed < 200; seed += 1) {
    const state = advance(
      freshGame({}, seed),
      (s) => s.hand.phase === 'playing' && s.hand.trick.length === 1,
    )
    if (state.hand.phase !== 'playing' || state.hand.trick.length !== 1) continue
    const seat = state.hand.currentSeat
    const plays = legalMoves(state, seat).filter((m) => m.type === 'play')
    if (plays.length > 0 && plays.length < (state.hand.hands[seat]?.length ?? 0)) return state
  }
  throw new Error('no constrained position found')
}
