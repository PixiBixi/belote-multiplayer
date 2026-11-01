import type { Card, Rank, Suit } from '@belote/engine'
import { describe, expect, it } from 'vitest'
import { sortHand } from './sort-hand.js'

const card = (id: string): Card => {
  const suit = id.slice(-1) as Suit
  const rank = id.slice(0, -1) as Rank
  return { id, suit, rank } as Card
}
const suits = (cards: Card[]): string => [...new Set(cards.map((c) => c.suit))].join('')

describe('sortHand', () => {
  // The reported hand: spades trump, no clubs. Fixed order put hearts next to diamonds.
  const hand = ['7D', 'KS', '9H', 'QS', '10H', 'KD', '9D'].map(card)

  it('alternates colours first, trump left when that costs nothing', () => {
    expect(suits(sortHand(hand, 'S'))).toBe('HSD')
    expect(suits(sortHand(['7D', 'KS', '9H', 'AC'].map(card), 'S'))).toBe('SHCD')
  })

  it('splits two reds with the only black suit when no suit is trump', () => {
    expect(suits(sortHand(hand, null))).toBe('HSD')
  })

  it('puts trump last on request, still alternating', () => {
    const order = suits(sortHand(['7D', 'KS', '9H', 'AC'].map(card), 'S', 'trumpLast'))
    expect(order.at(-1)).toBe('S')
    expect(order).toBe('HCDS')
  })

  it('keeps the server order when unsorted', () => {
    expect(sortHand(hand, 'S', 'none').map((c) => c.id)).toEqual(hand.map((c) => c.id))
  })
})
