import { strength, type Card, type Suit, type Trump } from '@belote/engine'

/* Alternating colours so neighbouring suits never blur together. */
const SUIT_ORDER: readonly Suit[] = ['S', 'H', 'C', 'D']

/**
 * Display order only: trump first, then suits alternating black and red, each suit
 * strongest first. Strength comes from the engine so a nine of trump sits where a
 * player expects it; nothing here decides what may be played.
 */
export function sortHand(hand: readonly Card[], trump: Trump | null): Card[] {
  const order = [...SUIT_ORDER]
  if (trump && trump !== 'AT' && trump !== 'SA') {
    order.splice(order.indexOf(trump), 1)
    order.unshift(trump)
  }
  const ranking: Trump = trump ?? 'SA'
  return [...hand].sort(
    (a, b) =>
      order.indexOf(a.suit) - order.indexOf(b.suit) || strength(b, ranking) - strength(a, ranking),
  )
}
