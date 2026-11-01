import { describe, expect, it } from 'vitest'
import { botMove } from './bot.js'
import { applyMove, createGame, nextHand } from './game.js'
import { knowledgeFor, sampleHands } from './knowledge.js'
import { DEFAULT_TABLE_RULES, type GameState, type TableRules } from './types.js'

/** Every state a normal-bot game goes through while cards are being played. */
function playingStates(seed: number, rules: Partial<TableRules>): GameState[] {
  let state = createGame({ seed, rules: { ...DEFAULT_TABLE_RULES, ...rules, target: 300 } })
  const states: GameState[] = []
  for (let turn = 0; turn < 5000 && state.phase !== 'finished'; turn++) {
    if (state.hand.phase === 'done') {
      state = nextHand(state)
      continue
    }
    if (state.hand.phase === 'playing') states.push(state)
    const seat = state.hand.currentSeat
    const applied = applyMove(state, seat, botMove(state, seat, 'normal', seed) ?? { type: 'pass' })
    if (!applied.okay) throw new Error(applied.error)
    state = applied.value
  }
  return states
}

const variants: [string, Partial<TableRules>][] = [
  ['classic, pisse', { variant: 'classic', pisse: true }],
  ['classic, no pisse', { variant: 'classic', pisse: false, mustOvertrump: true }],
  ['coinche, all trumps', { variant: 'coinche', allTrumps: true }],
]

describe('knowledgeFor', () => {
  it.each(variants)('only ever infers what is true of the real hands (%s)', (_name, rules) => {
    for (let seed = 0; seed < 4; seed++) {
      for (const state of playingStates(seed, rules)) {
        const k = knowledgeFor(state, state.hand.currentSeat)
        k.voids.forEach((suits, seat) => {
          for (const suit of suits) {
            expect(state.hand.hands[seat]?.some((c) => c.suit === suit)).toBe(false)
          }
        })
        for (const [id, seat] of k.pinned) {
          expect(state.hand.hands[seat]?.some((c) => c.id === id)).toBe(true)
        }
      }
    }
  })
})

describe('sampleHands', () => {
  it.each(variants)('deals every unseen card once, in the right counts (%s)', (_name, rules) => {
    for (const state of playingStates(1, rules)) {
      const seat = state.hand.currentSeat
      const k = knowledgeFor(state, seat)
      const sample = sampleHands(state, k, 99)
      expect(sample).not.toBeNull()
      const hands = sample?.hands ?? []
      expect(hands[seat]).toEqual(state.hand.hands[seat])
      expect(hands.map((h) => h.length)).toEqual(state.hand.hands.map((h) => h.length))
      const dealt = hands.flatMap((h, s) => (s === seat ? [] : h.map((c) => c.id)))
      expect([...dealt].sort()).toEqual(k.unseen.map((c) => c.id).sort())
      hands.forEach((h, s) => {
        for (const card of h) if (s !== seat) expect(k.voids[s]?.has(card.suit)).toBe(false)
      })
      for (const [id, s] of k.pinned) expect(hands[s]?.some((c) => c.id === id)).toBe(true)
    }
  })

  it('is deterministic for a given random state, and varies with it', () => {
    const state = playingStates(2, {})[0] as GameState
    const k = knowledgeFor(state, state.hand.currentSeat)
    expect(sampleHands(state, k, 5)).toEqual(sampleHands(state, k, 5))
    expect(sampleHands(state, k, 5)?.hands).not.toEqual(sampleHands(state, k, 6)?.hands)
  })
})

describe('hard bot', () => {
  it('never reads a hidden hand: swapping two others hands changes nothing', () => {
    for (let seed = 0; seed < 6; seed++) {
      const state = playingStates(seed, {}).find((s) => s.hand.trick.length === 0)
      if (state === undefined) continue
      const seat = state.hand.currentSeat
      const [a, b] = [1, 2].map((d) => (seat + d) % 4) as [number, number]
      const hands = [...state.hand.hands]
      ;[hands[a], hands[b]] = [hands[b] ?? [], hands[a] ?? []]
      const swapped: GameState = { ...state, hand: { ...state.hand, hands } }
      expect(botMove(swapped, seat, 'hard', seed, 6)).toEqual(botMove(state, seat, 'hard', seed, 6))
    }
  })
})
