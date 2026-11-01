import { parseCardId } from './cards.js'
import type { Card, PlayedCard } from './types.js'

/** `c('JH')` -> the jack of hearts. Throws on a typo so a test never runs on a bad card. */
export function c(id: string): Card {
  const card = parseCardId(id)
  if (!card) throw new Error(`bad card id ${id}`)
  return card
}

export const cards = (ids: string): Card[] => ids.split(' ').filter(Boolean).map(c)

/** `trick(0, 'AH 7S')`: seat 0 led the ace of hearts, seat 1 played the seven of spades. */
export function trick(leader: number, ids: string): PlayedCard[] {
  return cards(ids).map((card, i) => ({ seat: (leader + i) % 4, card }))
}
