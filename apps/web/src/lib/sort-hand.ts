import { strength, type Card, type Suit, type Trump } from '@belote/engine'

export const SORT_MODES = ['alternate', 'trumpLast', 'fixed', 'none'] as const
export type SortMode = (typeof SORT_MODES)[number]

const SUIT_ORDER: readonly Suit[] = ['S', 'H', 'C', 'D']
const isRed = (s: Suit): boolean => s === 'H' || s === 'D'

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]]
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  )
}

const clashes = (order: readonly Suit[]): number =>
  order.reduce((n, s, i) => (i > 0 && isRed(s) === isRed(order[i - 1] as Suit) ? n + 1 : n), 0)

/**
 * Suit order for the suits actually held, fewest same-colour neighbours first: computed
 * on the hand, so a missing clubs does not leave hearts next to diamonds. Unpinned, trump
 * goes left when that costs no alternation, else right, else wherever it splits two reds.
 */
function alternatingOrder(held: readonly Suit[], trump: Suit | null, pinLast: boolean): Suit[] {
  const suits = SUIT_ORDER.filter((s) => held.includes(s))
  const at = (o: Suit[]): number => (trump === null ? 0 : o.indexOf(trump))
  const cost = (o: Suit[]): number => {
    const pos = at(o)
    if (pinLast) return pos === -1 || pos === o.length - 1 ? clashes(o) : Infinity
    return clashes(o) * 10 + (pos <= 0 ? 0 : pos === o.length - 1 ? 1 : 2)
  }
  // permutations() follows SUIT_ORDER, so the first minimum is also the most familiar.
  let best = suits
  for (const p of permutations(suits)) if (cost(p) < cost(best)) best = p
  return best
}

/**
 * Display order only: nothing here decides what may be played. Within a suit, strongest
 * first, with strength from the engine so a nine of trump sits where a player expects it.
 */
export function sortHand(
  hand: readonly Card[],
  trump: Trump | null,
  mode: SortMode = 'alternate',
): Card[] {
  if (mode === 'none') return [...hand]
  const suitTrump = trump !== null && trump !== 'AT' && trump !== 'SA' ? trump : null
  const held = [...new Set(hand.map((c) => c.suit))]
  const order =
    mode === 'fixed' ? SUIT_ORDER : alternatingOrder(held, suitTrump, mode === 'trumpLast')
  const ranking: Trump = trump ?? 'SA'
  return [...hand].sort(
    (a, b) =>
      order.indexOf(a.suit) - order.indexOf(b.suit) || strength(b, ranking) - strength(a, ranking),
  )
}
