import { buildDeck, strength, winningIndex } from './cards.js'
import { nextDeckInt, shuffle, type DeckState } from './rng.js'
import { SEATS, teamOf, type Card, type GameState, type Suit, type Trump } from './types.js'

/** What one seat can know about the cards: never more than its own view shows. */
export type Knowledge = {
  seat: number
  played: Set<string>
  /** Suits each seat has shown it no longer holds, by seat. */
  voids: Set<Suit>[]
  /** Cards known to sit in a given hand: the turned card the taker picked up. */
  pinned: Map<string, number>
  /** Cards neither in our hand nor played: what the other three hold between them. */
  unseen: Card[]
}

/**
 * Reads the table from `seat`'s side: cards played, voids shown by not following, and
 * a missing trump shown by not trumping when the rules obliged it.
 */
export function knowledgeFor(state: GameState, seat: number): Knowledge {
  const hand = state.hand
  const trump: Trump = hand.contract?.trump ?? 'SA'
  const suitTrump = trump !== 'AT' && trump !== 'SA'
  const played = new Set<string>()
  const voids: Set<Suit>[] = Array.from({ length: SEATS }, () => new Set<Suit>())

  for (const cards of [...hand.tricks.map((t) => t.cards), hand.trick]) {
    const led = cards[0]?.card.suit
    cards.forEach((p, i) => {
      played.add(p.card.id)
      if (led === undefined || i === 0 || p.card.suit === led) return
      voids[p.seat]?.add(led)
      if (!suitTrump || p.card.suit === trump) return
      // Discarding is only proof of no trump when trumping was compulsory.
      const before = cards.slice(0, i)
      const partnerHolds =
        teamOf(before[winningIndex(before, trump)]?.seat ?? -1) === teamOf(p.seat)
      if (!(partnerHolds && state.rules.pisse)) voids[p.seat]?.add(trump)
    })
  }

  const own = new Set((hand.hands[seat] ?? []).map((c) => c.id))
  const pinned = new Map<string, number>()
  const taker = hand.contract?.taker ?? null
  if (hand.turned && taker !== null && taker !== seat && !played.has(hand.turned.id)) {
    pinned.set(hand.turned.id, taker)
  }
  const unseen = buildDeck().filter((c) => !own.has(c.id) && !played.has(c.id))
  return { seat, played, voids, pinned, unseen }
}

/** True when nothing still out can beat `card` in its own suit. */
export function isMaster(card: Card, trump: Trump, k: Knowledge): boolean {
  return !k.unseen.some((c) => c.suit === card.suit && strength(c, trump) > strength(card, trump))
}

/**
 * Deals the unseen cards to the other seats at random, in the counts they hold and
 * respecting every void and pinned card. Null when no deal fitting them turned up.
 */
export function sampleHands(
  state: GameState,
  k: Knowledge,
  rngState: DeckState,
  attempts = 20,
): { hands: Card[][]; rngState: DeckState } | null {
  const need = state.hand.hands.map((h, s) => (s === k.seat ? 0 : h.length))
  if (need.reduce((a, b) => a + b, 0) !== k.unseen.length) return null
  let rng = rngState
  for (let attempt = 0; attempt < attempts; attempt++) {
    const shuffled = shuffle(k.unseen, rng)
    rng = shuffled.state
    const eligible = (c: Card) =>
      k.pinned.has(c.id)
        ? [k.pinned.get(c.id) as number]
        : [0, 1, 2, 3].filter((s) => s !== k.seat && !k.voids[s]?.has(c.suit))
    // Most constrained cards first, so a greedy deal rarely paints itself into a corner.
    const order = [...shuffled.items].sort((a, b) => eligible(a).length - eligible(b).length)
    const left = [...need]
    const hands: Card[][] = Array.from({ length: SEATS }, (_, s) =>
      s === k.seat ? [...(state.hand.hands[s] ?? [])] : [],
    )
    let ok = true
    for (const card of order) {
      const open = eligible(card).filter((s) => (left[s] ?? 0) > 0)
      // Weighted by the room left, so no seat is favoured by its index.
      const pick = nextDeckInt(
        rng,
        open.reduce((sum, s) => sum + (left[s] ?? 0), 0),
      )
      rng = pick.state
      let room = pick.value
      const target = open.find((s) => (room -= left[s] ?? 0) < 0)
      if (target === undefined) {
        ok = false
        break
      }
      hands[target]?.push(card)
      left[target] = (left[target] ?? 0) - 1
    }
    if (ok) return { hands, rngState: rng }
  }
  return null
}
