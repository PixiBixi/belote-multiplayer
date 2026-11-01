import { applyMove, createGame, legalMoves, type GameState, type Move } from '@belote/engine'
import { describe, expect, it } from 'vitest'
import { buildPlayerView } from './build-view.js'
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
      vache: true,
      target: 1000,
    })
    expect(tableRulesSchema.safeParse({ target: 42 }).success).toBe(false)
    expect(roomCreateSchema.parse({ playerName: ' Ana ', pace: null }).rules.variant).toBe(
      'classic',
    )
  })
})
