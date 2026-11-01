import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { botMove, type BotLevel } from './bot.js'
import { applyMove, createGame, legalMoves, nextHand } from './game.js'
import { DEFAULT_TABLE_RULES, type GameState, type Move, type TableRules } from './types.js'

function cardCount(state: GameState): number {
  const h = state.hand
  return (
    h.hands.reduce((s, x) => s + x.length, 0) +
    h.stock.length +
    (h.turned && h.phase === 'bidding' ? 1 : 0) +
    h.trick.length +
    h.tricks.length * 4
  )
}

function step(state: GameState, move: Move): GameState {
  const r = applyMove(state, state.hand.currentSeat, move)
  if (!r.okay) throw new Error(`legal move rejected: ${r.error} ${JSON.stringify(move)}`)
  return r.value
}

/** Plays a whole game, choosing each move with `choose`. */
function playGame(
  state: GameState,
  choose: (s: GameState, moves: Move[], turn: number) => Move,
  onState?: (s: GameState) => void,
) {
  for (let turn = 0; turn < 20000; turn++) {
    if (state.phase === 'finished') return state
    if (state.hand.phase === 'done') {
      state = nextHand(state)
      continue
    }
    const moves = legalMoves(state, state.hand.currentSeat)
    expect(moves.length).toBeGreaterThan(0)
    state = step(state, choose(state, moves, turn))
    onState?.(state)
  }
  throw new Error('game did not finish')
}

const rulesArb = fc.record<TableRules>({
  variant: fc.constantFrom('classic', 'coinche'),
  allTrumps: fc.boolean(),
  vache: fc.boolean(),
  pisse: fc.boolean(),
  mustOvertrump: fc.boolean(),
  declarations: fc.boolean(),
  target: fc.constantFrom(300, 501),
})

describe('full games with random legal moves', () => {
  it('conserves the 32 cards and scores 162 or 250 a hand', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        rulesArb,
        fc.array(fc.nat(), { minLength: 1, maxLength: 20 }),
        (seed, rules, picks) => {
          // Random play would bid générale every other hand; weight towards passing, but
          // force a contract late in the bidding so a no-vache table cannot redeal forever.
          const choose = (s: GameState, moves: Move[], turn: number) => {
            const pick = picks[turn % picks.length] ?? 0
            if (s.hand.phase === 'bidding') {
              if (s.hand.bids.length >= 3 && moves.length > 1) return moves[1] as Move
              if (pick % 4 !== 0) return moves[0] as Move
            }
            return moves[pick % moves.length] as Move
          }
          const final = playGame(createGame({ seed, rules }), choose, (s) => {
            if (s.hand.phase !== 'done') expect(cardCount(s)).toBe(32)
          })
          expect(final.winner).not.toBeNull()
          for (const r of final.history) {
            if (r.kind === 'redeal') continue
            const total = r.trickPoints[0] + r.trickPoints[1]
            expect(r.capot === null ? total === 162 : total === 250).toBe(true)
          }
        },
      ),
      { numRuns: 60 },
    )
  })
})

describe('bidding', () => {
  it('classic: four passes lead to a second round, eight to a vache in sans atout', () => {
    let s = createGame({ seed: 7, rules: { vache: true } })
    for (let i = 0; i < 4; i++) s = step(s, { type: 'pass' })
    expect(s.hand.biddingRound).toBe(2)
    for (let i = 0; i < 4; i++) s = step(s, { type: 'pass' })
    expect(s.hand.phase).toBe('playing')
    expect(s.hand.contract).toEqual({ taker: null, trump: 'SA', value: null, multiplier: 1 })
    expect(s.hand.hands.every((h) => h.length === 8)).toBe(true)
  })

  it('classic without vache redeals when everybody passes', () => {
    let s = createGame({ seed: 7, rules: { vache: false } })
    for (let i = 0; i < 8; i++) s = step(s, { type: 'pass' })
    expect(s.hand.phase).toBe('done')
    expect(s.hand.result?.kind).toBe('redeal')
    const dealer = s.hand.dealer
    expect(nextHand(s).hand.dealer).toBe((dealer + 1) % 4)
  })

  it('classic: round one only offers the turned suit, round two the others', () => {
    let s = createGame({ seed: 3, rules: { allTrumps: false } })
    const turned = s.hand.turned?.suit
    const takes1 = legalMoves(s, s.hand.currentSeat).filter((m) => m.type === 'take')
    expect(takes1).toEqual([{ type: 'take', trump: turned }])
    for (let i = 0; i < 4; i++) s = step(s, { type: 'pass' })
    const takes2 = legalMoves(s, s.hand.currentSeat).filter((m) => m.type === 'take')
    expect(takes2).toHaveLength(3)
    expect(takes2.some((m) => m.type === 'take' && m.trump === turned)).toBe(false)
  })

  it('classic: the taker receives the turned card', () => {
    let s = createGame({ seed: 11 })
    const taker = s.hand.currentSeat
    const turned = s.hand.turned
    s = step(s, { type: 'take', trump: turned?.suit ?? 'S' })
    expect(s.hand.hands[taker]?.some((c) => c.id === turned?.id)).toBe(true)
    expect(s.hand.contract?.taker).toBe(taker)
  })

  it('coinche: a bid followed by three passes is the contract', () => {
    let s = createGame({ seed: 5, rules: { variant: 'coinche' } })
    const bidder = s.hand.currentSeat
    s = step(s, { type: 'bid', value: 90, trump: 'H' })
    for (let i = 0; i < 3; i++) s = step(s, { type: 'pass' })
    expect(s.hand.contract).toEqual({ taker: bidder, trump: 'H', value: 90, multiplier: 1 })
  })

  it('coinche: only an opponent may coinche, only the takers surcoinche', () => {
    let s = createGame({ seed: 5, rules: { variant: 'coinche' } })
    s = step(s, { type: 'bid', value: 100, trump: 'S' })
    expect(legalMoves(s, s.hand.currentSeat)).toContainEqual({ type: 'coinche' })
    s = step(s, { type: 'pass' })
    expect(legalMoves(s, s.hand.currentSeat)).not.toContainEqual({ type: 'coinche' })
    s = step(s, { type: 'pass' })
    s = step(s, { type: 'coinche' })
    // Next seat is the bidder: it may surcoinche.
    expect(legalMoves(s, s.hand.currentSeat)).toContainEqual({ type: 'surcoinche' })
    s = step(s, { type: 'surcoinche' })
    expect(s.hand.contract?.multiplier).toBe(4)
  })

  it('coinche: overbids must be higher', () => {
    let s = createGame({ seed: 5, rules: { variant: 'coinche' } })
    s = step(s, { type: 'bid', value: 120, trump: 'S' })
    const bids = legalMoves(s, s.hand.currentSeat).filter((m) => m.type === 'bid')
    expect(bids.every((m) => m.type === 'bid' && m.value > 120)).toBe(true)
    expect(applyMove(s, s.hand.currentSeat, { type: 'bid', value: 110, trump: 'H' }).okay).toBe(
      false,
    )
  })
})

describe('turn order', () => {
  it('rejects a move from the wrong seat', () => {
    const s = createGame({ seed: 1 })
    const wrong = (s.hand.currentSeat + 1) % 4
    expect(applyMove(s, wrong, { type: 'pass' })).toEqual({ okay: false, error: 'not_your_turn' })
  })

  it('the trick winner leads the next trick', () => {
    let s = createGame({ seed: 2 })
    s = step(s, { type: 'take', trump: s.hand.turned?.suit ?? 'S' })
    for (let i = 0; i < 4; i++) {
      const play = legalMoves(s, s.hand.currentSeat).find((m) => m.type === 'play') as Move
      s = step(s, play)
    }
    expect(s.hand.currentSeat).toBe(s.hand.tricks[0]?.winner)
  })
})

describe('bots', () => {
  it.each<BotLevel>(['easy', 'normal', 'hard'])(
    '%s bots finish games in both variants',
    (level) => {
      for (const variant of ['classic', 'coinche'] as const) {
        for (let seed = 0; seed < 5; seed++) {
          const final = playGame(
            createGame({ seed, rules: { ...DEFAULT_TABLE_RULES, variant } }),
            (s, moves) => {
              // Few samples: this checks hard bots finish, not how well they play.
              const m = botMove(s, s.hand.currentSeat, level, seed, 2)
              expect(m).not.toBeNull()
              expect(moves).toContainEqual(m)
              return m as Move
            },
          )
          expect(final.winner).not.toBeNull()
        }
      }
    },
    // Whole games of simulating bots: seconds of work, not a hang.
    30_000,
  )

  it('hard bots beat easy bots more often than not', () => {
    let hardWins = 0
    const games = 40
    for (let seed = 0; seed < games; seed++) {
      const final = playGame(createGame({ seed, rules: { target: 501 } }), (s) => {
        const seat = s.hand.currentSeat
        return botMove(s, seat, seat % 2 === 0 ? 'hard' : 'easy', seed, 4) as Move
      })
      if (final.winner === 0) hardWins++
    }
    expect(hardWins).toBeGreaterThan(games * 0.6)
  }, 30_000)
})
