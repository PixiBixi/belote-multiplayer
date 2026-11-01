import {
  RANKS,
  SUITS,
  teamOf,
  type Card,
  type CardId,
  type PlayedCard,
  type Rank,
  type Suit,
  type TableRules,
  type Trump,
} from './types.js'

export const cardId = (rank: Rank, suit: Suit): CardId => `${rank}${suit}` as CardId

export function parseCardId(id: string): Card | null {
  const suit = id.slice(-1) as Suit
  const rank = id.slice(0, -1) as Rank
  if (!SUITS.includes(suit) || !RANKS.includes(rank)) return null
  return { id: id as CardId, suit, rank }
}

export function buildDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ id: cardId(rank, suit), suit, rank })))
}

/* Strength orders, weakest first. */
const TRUMP_ORDER: readonly Rank[] = ['7', '8', 'Q', 'K', '10', 'A', '9', 'J']
const PLAIN_ORDER: readonly Rank[] = ['7', '8', '9', 'J', 'Q', 'K', '10', 'A']

const TRUMP_POINTS: Record<Rank, number> = {
  J: 20,
  '9': 14,
  A: 11,
  '10': 10,
  K: 4,
  Q: 3,
  '8': 0,
  '7': 0,
}
const PLAIN_POINTS: Record<Rank, number> = {
  A: 11,
  '10': 10,
  K: 4,
  Q: 3,
  J: 2,
  '9': 0,
  '8': 0,
  '7': 0,
}
/* Tout atout and sans atout rescale so a hand is still worth 152 + 10 de der. */
const AT_POINTS: Record<Rank, number> = {
  J: 14,
  '9': 9,
  A: 6,
  '10': 5,
  K: 3,
  Q: 1,
  '8': 0,
  '7': 0,
}
const SA_POINTS: Record<Rank, number> = {
  A: 19,
  '10': 10,
  K: 4,
  Q: 3,
  J: 2,
  '9': 0,
  '8': 0,
  '7': 0,
}

export const DIX_DE_DER = 10
export const HAND_TOTAL = 162
export const CAPOT_POINTS = 250

/** Ranks as trump: every suit at tout atout, the trump suit otherwise. */
export function isTrumpCard(card: Card, trump: Trump): boolean {
  return trump === 'AT' || card.suit === trump
}

export function cardPoints(card: Card, trump: Trump): number {
  if (trump === 'AT') return AT_POINTS[card.rank]
  if (trump === 'SA') return SA_POINTS[card.rank]
  return card.suit === trump ? TRUMP_POINTS[card.rank] : PLAIN_POINTS[card.rank]
}

/** Strength within its own suit, higher wins. */
export function strength(card: Card, trump: Trump): number {
  return isTrumpCard(card, trump) ? TRUMP_ORDER.indexOf(card.rank) : PLAIN_ORDER.indexOf(card.rank)
}

/** True when `a` beats `b`, `b` being the card currently winning a trick led in `led`. */
export function beats(a: Card, b: Card, led: Suit, trump: Trump): boolean {
  const suitTrump = trump !== 'AT' && trump !== 'SA'
  if (suitTrump) {
    const aT = a.suit === trump
    const bT = b.suit === trump
    if (aT !== bT) return aT
    if (aT) return strength(a, trump) > strength(b, trump)
  }
  if (a.suit !== led) return false
  if (b.suit !== led) return true
  return strength(a, trump) > strength(b, trump)
}

/** Index in `trick` of the card currently winning it. */
export function winningIndex(trick: readonly PlayedCard[], trump: Trump): number {
  const led = trick[0]?.card.suit
  if (led === undefined) return -1
  let best = 0
  for (let i = 1; i < trick.length; i++) {
    const a = trick[i]
    const b = trick[best]
    if (a && b && beats(a.card, b.card, led, trump)) best = i
  }
  return best
}

/**
 * The cards `seat` may lay on `trick`. The whole of French belote's obligations live
 * here: follow suit, climb at trump, trump when void, overtrump an opponent's trump, and
 * the pisse exemption when the partner already holds the trick.
 */
export function legalCards(
  hand: readonly Card[],
  trick: readonly PlayedCard[],
  trump: Trump,
  rules: Pick<TableRules, 'pisse' | 'mustOvertrump'>,
  seat: number,
): Card[] {
  const first = trick[0]
  if (first === undefined) return [...hand]
  const led = first.card.suit
  const best = trick[winningIndex(trick, trump)]
  if (best === undefined) return [...hand]

  const follow = hand.filter((c) => c.suit === led)
  const climb = (cards: Card[], over: Card): Card[] => {
    if (!rules.mustOvertrump) return cards
    const higher = cards.filter((c) => strength(c, trump) > strength(over, trump))
    return higher.length > 0 ? higher : cards
  }

  if (trump === 'SA') return follow.length > 0 ? follow : [...hand]

  if (trump === 'AT') {
    if (follow.length === 0) return [...hand]
    // The winning card is necessarily of the led suit: nothing else ranks at tout atout.
    return climb(follow, best.card)
  }

  if (led === trump) {
    return follow.length > 0 ? climb(follow, best.card) : [...hand]
  }
  if (follow.length > 0) return follow

  const trumps = hand.filter((c) => c.suit === trump)
  if (trumps.length === 0) return [...hand]

  const partnerHolds = teamOf(best.seat) === teamOf(seat)
  if (partnerHolds && rules.pisse) return [...hand]
  // Overtrumping one's own partner is never required.
  if (partnerHolds) return trumps
  if (best.card.suit === trump) {
    const over = trumps.filter((c) => strength(c, trump) > strength(best.card, trump))
    if (rules.mustOvertrump && over.length > 0) return over
  }
  return trumps
}
