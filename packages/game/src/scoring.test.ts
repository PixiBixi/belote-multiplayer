import { describe, expect, it } from 'vitest'
import { buildDeck } from './cards.js'
import { createGame } from './game.js'
import { scoreHand } from './scoring.js'
import type { Contract, Declaration, HandState } from './types.js'

/*
 * The deck in build order, four cards a trick, with spades as trump, gives these
 * card points: [24, 38, 10, 20, 10, 20, 10, 20], 152 in all, plus 10 de der.
 */
function hand(contract: Contract, winners: number[], extra: Partial<HandState> = {}): HandState {
  const deck = buildDeck()
  const tricks = winners.map((winner, i) => ({
    winner,
    cards: deck.slice(i * 4, i * 4 + 4).map((card, j) => ({ seat: j, card })),
  }))
  return { ...createGame({ seed: 1 }).hand, phase: 'done', contract, tricks, ...extra }
}

const classic = (taker: number | null, trump: Contract['trump'] = 'S'): Contract => ({
  taker,
  trump,
  value: null,
  multiplier: 1,
})
const coinche = (taker: number, value: number, multiplier: 1 | 2 | 4 = 1): Contract => ({
  taker,
  trump: 'S',
  value,
  multiplier,
})
const decl = (points: number): Declaration => ({ kind: 'cinquante', points, cards: [], top: 'A' })

describe('classic scoring', () => {
  it('a made contract scores what each team took', () => {
    const { result } = scoreHand(hand(classic(0), [0, 0, 0, 0, 1, 1, 1, 1]), 0)
    expect(result.trickPoints).toEqual([92, 70])
    expect(result.made).toBe(true)
    expect(result.scored).toEqual([92, 70])
  })

  it('a failed contract gives 162 to the defence', () => {
    const { result } = scoreHand(hand(classic(0), [0, 1, 0, 1, 1, 1, 1, 1]), 0)
    expect(result.made).toBe(false)
    expect(result.scored).toEqual([0, 162])
  })

  it('the belote holder keeps its 20 points even when dedans', () => {
    const { result } = scoreHand(hand(classic(0), [0, 1, 0, 1, 1, 1, 1, 1], { beloteHolder: 2 }), 0)
    expect(result.scored).toEqual([20, 162])
  })

  it('a capot scores 250', () => {
    const { result } = scoreHand(hand(classic(1), [1, 1, 1, 1, 1, 1, 1, 1]), 0)
    expect(result.capot).toBe(1)
    expect(result.scored).toEqual([0, 250])
  })

  it('a litige parks the takers points for the next winner', () => {
    const tie = hand(classic(0), [1, 0, 1, 0, 1, 0, 1, 0], {
      declared: [[], [decl(54)], [], []],
      declarationWinner: 1,
    })
    const first = scoreHand(tie, 0)
    expect(first.result.litige).toBe(true)
    expect(first.result.scored).toEqual([0, 108])
    expect(first.reserve).toBe(108)

    const next = scoreHand(hand(classic(0), [0, 0, 0, 0, 1, 1, 1, 1]), first.reserve)
    expect(next.result.made).toBe(true)
    expect(next.result.scored).toEqual([92 + 108, 70])
    expect(next.reserve).toBe(0)
  })

  it('only the winning team scores its declarations', () => {
    const h = hand(classic(0), [0, 0, 0, 0, 1, 1, 1, 1], {
      declared: [[decl(50)], [decl(20)], [], []],
      declarationWinner: 0,
    })
    expect(scoreHand(h, 0).result.scored).toEqual([142, 70])
  })

  it('a vache hand has no taker and each team keeps what it made', () => {
    const { result } = scoreHand(hand(classic(null, 'SA'), [0, 0, 0, 0, 1, 1, 1, 1]), 0)
    expect(result.made).toBeNull()
    expect(result.scored[0] + result.scored[1]).toBe(162)
  })
})

describe('coinche scoring', () => {
  it('a made contract scores contract plus points', () => {
    const { result } = scoreHand(hand(coinche(0, 90), [0, 0, 0, 0, 1, 1, 1, 1]), 0)
    expect(result.scored).toEqual([182, 70])
  })

  it('a failed contract gives 160 plus the contract to the defence', () => {
    const { result } = scoreHand(hand(coinche(0, 100), [0, 0, 0, 0, 1, 1, 1, 1]), 0)
    expect(result.made).toBe(false)
    expect(result.scored).toEqual([0, 262])
  })

  it('a coinched contract made doubles the contract and takes everything', () => {
    const { result } = scoreHand(hand(coinche(0, 90, 2), [0, 0, 0, 0, 1, 1, 1, 1]), 0)
    expect(result.scored).toEqual([162 + 180, 0])
  })

  it('a surcoinched contract failed quadruples it for the defence', () => {
    const { result } = scoreHand(hand(coinche(0, 100, 4), [0, 0, 0, 0, 1, 1, 1, 1]), 0)
    expect(result.scored).toEqual([0, 162 + 400])
  })

  it('a capot bid needs every trick', () => {
    expect(scoreHand(hand(coinche(0, 250), [0, 0, 0, 0, 0, 0, 0, 0]), 0).result.made).toBe(true)
    expect(scoreHand(hand(coinche(0, 250), [0, 0, 0, 0, 0, 0, 0, 1]), 0).result.made).toBe(false)
  })

  it('a générale needs every trick by the taker alone', () => {
    expect(scoreHand(hand(coinche(0, 500), [0, 0, 0, 0, 0, 0, 0, 0]), 0).result.made).toBe(true)
    expect(scoreHand(hand(coinche(0, 500), [0, 2, 0, 0, 0, 0, 0, 0]), 0).result.made).toBe(false)
  })
})
