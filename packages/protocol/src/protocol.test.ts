import {
  applyMove,
  createGame,
  legalMoves,
  nextHand,
  type GameState,
  type Move,
} from '@belote/engine'
import { describe, expect, it } from 'vitest'
import { buildPlayerView } from './build-view.js'
import { applyViewUpdate, toViewUpdate } from './view-update.js'
import { gameMoveSchema, roomCreateSchema, tableRulesSchema } from './schemas.js'
import type { SeatInfo } from './views.js'

const seats: SeatInfo[] = [0, 1, 2, 3].map((seat) => ({
  seat,
  kind: 'human',
  name: `p${seat}`,
  status: 'active',
}))
const timing = { turnDeadline: null, nextHandDeadline: null }

function step(s: GameState, move: Move): GameState {
  const r = applyMove(s, s.hand.currentSeat, move)
  if (!r.okay) throw new Error(r.error)
  return r.value
}

describe('buildPlayerView', () => {
  it('never carries another seat cards', () => {
    const state = createGame({ seed: 4 })
    const view = buildPlayerView(state, 1, seats, timing)
    const json = JSON.stringify(view)
    for (const seat of [0, 2, 3]) {
      for (const card of state.hand.hands[seat] ?? []) expect(json).not.toContain(`"${card.id}"`)
    }
    for (const card of state.hand.stock) expect(json).not.toContain(`"${card.id}"`)
    expect(view.hand.handCounts).toEqual([5, 5, 5, 5])
  })

  it('offers moves only to the seat on turn', () => {
    const state = createGame({ seed: 4 })
    const onTurn = state.hand.currentSeat
    expect(buildPlayerView(state, onTurn, seats, timing).you.legalMoves.length).toBeGreaterThan(0)
    expect(buildPlayerView(state, (onTurn + 1) % 4, seats, timing).you.legalMoves).toEqual([])
  })

  it('hides the turned card once taken, and reports belote calls in order', () => {
    // Find a seed where somebody holds king and queen of the turned suit after taking.
    for (let seed = 0; seed < 500; seed++) {
      let s = createGame({ seed, rules: { declarations: false } })
      s = step(s, { type: 'take', trump: s.hand.turned?.suit ?? 'S' })
      if (s.hand.beloteHolder === null) continue
      expect(buildPlayerView(s, 0, seats, timing).hand.turned).toBeNull()
      while (s.hand.phase === 'playing') {
        const moves = legalMoves(s, s.hand.currentSeat)
        s = step(s, moves[0] as Move)
      }
      const calls = buildPlayerView(s, 0, seats, timing).hand.beloteCalls
      expect(calls.map((c) => c.call)).toEqual(['belote', 'rebelote'])
      return
    }
    throw new Error('no seed with a belote')
  })

  it('counts hand points as tricks fall, 162 with the dix de der', () => {
    let s = createGame({ seed: 7, rules: { declarations: false } })
    s = step(s, { type: 'take', trump: s.hand.turned?.suit ?? 'S' })
    expect(buildPlayerView(s, 0, seats, timing).hand.pointsWon).toEqual([0, 0])
    let last = 0
    while (s.hand.phase === 'playing') {
      s = step(s, legalMoves(s, s.hand.currentSeat)[0] as Move)
      const [a, b] = buildPlayerView(s, 0, seats, timing).hand.pointsWon
      expect(a + b).toBeGreaterThanOrEqual(last)
      last = a + b
    }
    expect(last).toBe(162)
  })
})

describe('schemas', () => {
  it('accepts every move shape and rejects a fake card', () => {
    expect(gameMoveSchema.safeParse({ move: { type: 'play', cardId: '10H' } }).success).toBe(true)
    expect(gameMoveSchema.safeParse({ move: { type: 'play', cardId: '11H' } }).success).toBe(false)
    expect(
      gameMoveSchema.safeParse({ move: { type: 'bid', value: 90, trump: 'AT' } }).success,
    ).toBe(true)
    expect(gameMoveSchema.safeParse({ move: { type: 'take', trump: 'X' } }).success).toBe(false)
  })

  it('fills rules a client omits and rejects an odd target', () => {
    expect(tableRulesSchema.parse({ variant: 'coinche' })).toMatchObject({
      variant: 'coinche',
      vache: false,
      target: 1000,
    })
    expect(tableRulesSchema.safeParse({ target: 42 }).success).toBe(false)
    expect(roomCreateSchema.parse({ playerName: ' Ana ', pace: null }).rules.variant).toBe(
      'classic',
    )
  })
})

describe('view updates', () => {
  /** A game two hands in, so its history holds two results. */
  const twoHandsPlayed = (): GameState => {
    let s = createGame({ seed: 7, rules: { declarations: false } })
    for (let hands = 0; hands < 2; hands++) {
      s = step(s, { type: 'take', trump: s.hand.turned?.suit ?? 'S' })
      while (s.hand.phase === 'playing') s = step(s, legalMoves(s, s.hand.currentSeat)[0] as Move)
      if (hands === 0) s = nextHand(s, 100 + hands)
    }
    return s
  }

  it('sends the whole history to a socket that holds none', () => {
    const view = buildPlayerView(twoHandsPlayed(), 0, seats, timing)
    expect(view.history).toHaveLength(2)
    const update = toViewUpdate(view, 0)
    expect(update.history).toEqual(view.history)
    expect(update.historyFrom ?? 0).toBe(0)
    expect(applyViewUpdate(update, null)).toEqual(view)
  })

  it('sends only the entries the socket has not seen', () => {
    const view = buildPlayerView(twoHandsPlayed(), 0, seats, timing)
    const known = { ...view, history: view.history.slice(0, 1) }
    const update = toViewUpdate(view, 1)
    expect(update.history).toEqual(view.history.slice(1))
    expect(update.historyFrom).toBe(1)
    expect(applyViewUpdate(update, known)).toEqual(view)
    expect(toViewUpdate(view, 2).history).toEqual([])
    expect(applyViewUpdate(toViewUpdate(view, 2), view)).toEqual(view)
  })

  it('starts over when the history is shorter than what was sent, as after a restart', () => {
    const fresh = buildPlayerView(createGame({ seed: 3 }), 0, seats, timing)
    const update = toViewUpdate(fresh, 2)
    expect(update.historyFrom ?? 0).toBe(0)
    expect(
      applyViewUpdate(update, buildPlayerView(twoHandsPlayed(), 0, seats, timing)).history,
    ).toEqual([])
  })
})
