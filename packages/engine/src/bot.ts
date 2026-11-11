import { beats, cardPoints, isTrumpCard, strength, winningIndex } from './cards.js'
import { applyMove, legalMoves } from './game.js'
import { isMaster, knowledgeFor, sampleHands, type Knowledge } from './knowledge.js'
import { deckState, foldDeckState, nextInt } from './rng.js'
import {
  SUITS,
  teamOf,
  type Card,
  type GameState,
  type Move,
  type Suit,
  type Trump,
} from './types.js'

export type BotLevel = 'easy' | 'normal' | 'hard'

/** Deals a hard bot samples per card; a decision costs one rollout per card per deal. */
export const MONTE_CARLO_SAMPLES = 24

/**
 * Picks a move for `seat`, reading only what that seat may know: its own hand, the
 * turned card, the bidding and every card already played. `salt` varies easy bots'
 * choices without touching the game's own random state. `samples` sets how many deals
 * a hard bot simulates per card; 0 falls back to its heuristic play.
 */
export function botMove(
  state: GameState,
  seat: number,
  level: BotLevel,
  salt = 0,
  samples = MONTE_CARLO_SAMPLES,
): Move | null {
  const moves = legalMoves(state, seat)
  if (moves.length === 0) return null
  if (level === 'easy') {
    const declare = moves.find((m) => m.type === 'declare')
    if (declare) return declare
    const plays = state.hand.phase === 'bidding' ? biddingFallback(moves, state, seat) : moves
    return (
      plays[nextInt(foldDeckState(state.rngState) ^ (salt * 2654435761), plays.length).value] ??
      moves[0] ??
      null
    )
  }
  if (state.hand.phase === 'bidding') return chooseBid(state, seat, moves, level)
  const declare = moves.find((m) => m.type === 'declare')
  if (declare) return declare
  if (level === 'hard')
    return (
      monteCarloPlay(state, seat, moves, salt, samples) ?? choosePlay(state, seat, moves, level)
    )
  return choosePlay(state, seat, moves, level)
}

/* ---------- bidding ---------- */

/** Rough number of points a hand is worth with `trump`, the partner's share excluded. */
export function handStrength(hand: readonly Card[], trump: Trump): number {
  let score = 0
  const trumps = hand.filter((c) => isTrumpCard(c, trump) && trump !== 'AT')
  for (const card of hand) {
    if (trump === 'AT') {
      score += { J: 22, '9': 14, A: 7, '10': 4, K: 2, Q: 1, '8': 0, '7': 0 }[card.rank]
    } else if (trump === 'SA') {
      score += { A: 24, '10': 8, K: 4, Q: 2, J: 1, '9': 0, '8': 0, '7': 0 }[card.rank]
      if (card.rank === '10' && hand.some((c) => c.suit === card.suit && c.rank === 'A')) score += 8
    } else if (card.suit === trump) {
      score += { J: 26, '9': 18, A: 11, '10': 9, K: 6, Q: 5, '8': 4, '7': 4 }[card.rank]
    } else {
      score += { A: 14, '10': 4, K: 2, Q: 0, J: 0, '9': 0, '8': 0, '7': 0 }[card.rank]
      if (card.rank === '10' && hand.some((c) => c.suit === card.suit && c.rank === 'A')) score += 6
    }
  }
  if (trump !== 'AT' && trump !== 'SA') {
    score += Math.max(0, trumps.length - 2) * 8
    // A void outside trump is a ruff waiting to happen.
    const voids = SUITS.filter((s) => s !== trump && !hand.some((c) => c.suit === s)).length
    if (trumps.length >= 3) score += voids * 6
  }
  return score
}

function bestTrump(
  hand: readonly Card[],
  options: readonly Trump[],
): { trump: Trump; score: number } {
  let best = { trump: options[0] ?? 'S', score: -1 }
  for (const trump of options) {
    const score = handStrength(hand, trump) - (trump === 'AT' || trump === 'SA' ? 6 : 0)
    if (score > best.score) best = { trump, score }
  }
  return best
}

function biddingFallback(moves: Move[], state: GameState, seat: number): Move[] {
  // Even an easy bot only takes on a hand that has something in it.
  const hand = state.hand.hands[seat] ?? []
  const pass = moves.filter((m) => m.type === 'pass')
  const good = moves.filter(
    (m) => (m.type === 'take' || m.type === 'bid') && handStrength(hand, m.trump) >= 70,
  )
  return good.length > 0 && state.hand.bids.length % 3 === 0 ? [good[0] as Move] : pass
}

function chooseBid(state: GameState, seat: number, moves: Move[], level: BotLevel): Move {
  const hand = state.hand
  const own = hand.hands[seat] ?? []
  const pass: Move = { type: 'pass' }

  if (state.rules.variant === 'classic') {
    const takes = moves.filter((m): m is Extract<Move, { type: 'take' }> => m.type === 'take')
    const turned = hand.turned
    let best: { move: Move; score: number } = { move: pass, score: 0 }
    for (const m of takes) {
      // In round 1 the turned card would be ours; in round 2 it is too.
      const cards = turned ? [...own, turned] : own
      const score = handStrength(cards, m.trump) - (m.trump === 'AT' || m.trump === 'SA' ? 8 : 0)
      if (score > best.score) best = { move: m, score }
    }
    // Six cards seen out of eight: the threshold leaves room for two unknown cards.
    const threshold = level === 'hard' ? 53 : 56
    // The dealer's partner leaves marginal hands to the seat with the turned card advantage.
    return best.score >= threshold ? best.move : pass
  }

  if (moves.some((m) => m.type === 'surcoinche')) {
    const high = hand.highBid
    if (high && high.seat === seat && handStrength(own, high.trump) >= high.value + 30)
      return { type: 'surcoinche' }
    return pass
  }

  const high = hand.highBid
  const partnerBid = [...hand.bids]
    .reverse()
    .find((b) => b.type === 'bid' && teamOf(b.seat) === teamOf(seat) && b.seat !== seat)
  const options = (state.rules.allTrumps ? [...SUITS, 'AT', 'SA'] : [...SUITS]) as Trump[]
  const mine = bestTrump(own, options)
  // Hand strength counts 8 cards; scale to an expected contract with the partner's ~ third.
  let estimate = Math.round((mine.score * 0.85 + 25) / 10) * 10
  const trump = mine.trump

  if (partnerBid && partnerBid.type === 'bid' && high && teamOf(high.seat) === teamOf(seat)) {
    // Support the partner's trump: add what we bring in it.
    const support = handStrength(own, partnerBid.trump)
    const aces = own.filter((c) => c.rank === 'A' && c.suit !== partnerBid.trump).length
    const raise =
      (own.some((c) => c.suit === partnerBid.trump && (c.rank === 'J' || c.rank === '9'))
        ? 20
        : 0) +
      aces * 10
    if (support > 40 && raise > 0) {
      const value = Math.min(160, partnerBid.value + raise)
      if (value > high.value) return { type: 'bid', value, trump: partnerBid.trump }
    }
    return pass
  }

  if (high && teamOf(high.seat) !== teamOf(seat) && moves.some((m) => m.type === 'coinche')) {
    // Coinche when we hold their trump's top cards and the bid is greedy.
    const theirs = own.filter((c) => isTrumpCard(c, high.trump))
    const topTrumps = theirs.filter(
      (c) => c.rank === 'J' || c.rank === '9' || c.rank === 'A',
    ).length
    const aces = own.filter((c) => c.rank === 'A').length
    if (level !== 'normal' || high.value >= 100) {
      if ((topTrumps >= 2 && theirs.length >= 3) || (high.value >= 120 && aces >= 3))
        return { type: 'coinche' }
    }
  }

  if (
    level === 'hard' &&
    trump !== 'AT' &&
    trump !== 'SA' &&
    estimate >= 150 &&
    own.filter((c) => c.suit === trump).length >= 6
  ) {
    estimate = 250
  }
  if (estimate < 80) return pass
  const value = estimate >= 250 ? 250 : Math.min(160, estimate)
  if (high && value <= high.value) return pass
  const move: Move = { type: 'bid', value, trump }
  return moves.some((m) => m.type === 'bid' && m.value === value && m.trump === trump) ? move : pass
}

/* ---------- card play ---------- */

function choosePlay(state: GameState, seat: number, moves: Move[], level: BotLevel): Move {
  const hand = state.hand
  const contract = hand.contract
  const own = hand.hands[seat] ?? []
  const plays = moves.filter((m): m is Extract<Move, { type: 'play' }> => m.type === 'play')
  const cards = plays
    .map((m) => own.find((c) => c.id === m.cardId))
    .filter((c): c is Card => c !== undefined)
  const fallback = plays[0] ?? moves[0] ?? { type: 'pass' }
  if (!contract || cards.length === 0) return fallback
  const trump = contract.trump
  const k = knowledgeFor(state, seat)
  const pts = (c: Card) => cardPoints(c, trump)
  const asMove = (c: Card): Move => ({ type: 'play', cardId: c.id })
  const lowest = (cs: Card[]) =>
    [...cs].sort((a, b) => pts(a) - pts(b) || strength(a, trump) - strength(b, trump))[0] as Card
  const highest = (cs: Card[]) =>
    [...cs].sort((a, b) => pts(b) - pts(a) || strength(b, trump) - strength(a, trump))[0] as Card
  const suitTrump = trump !== 'AT' && trump !== 'SA'
  const weTook = contract.taker !== null && teamOf(contract.taker) === teamOf(seat)

  /* Leading. */
  if (hand.trick.length === 0) {
    const trumpsOut = suitTrump
      ? 8 -
        own.filter((c) => c.suit === trump).length -
        [...k.played].filter((id) => id.endsWith(trump)).length
      : 0
    if (suitTrump && weTook && trumpsOut > 0) {
      const masterTrump = cards.find((c) => c.suit === trump && isMaster(c, trump, k))
      if (masterTrump) return asMove(masterTrump)
    }
    const masters = cards.filter((c) => !(suitTrump && c.suit === trump) && isMaster(c, trump, k))
    if (masters.length > 0) return asMove(highest(masters))
    // Lead a low card from a suit where we hold no ten to lose.
    const safe = cards.filter((c) => !(suitTrump && c.suit === trump) && pts(c) === 0)
    if (safe.length > 0) {
      if (level === 'hard') {
        // Prefer a suit the opponents are not void in, so it cannot be ruffed cheaply.
        const opp = [nextSeatOf(seat), nextSeatOf(seat + 2)]
        const unruffed = safe.filter((c) => !opp.some((o) => k.voids[o]?.has(c.suit)))
        if (unruffed.length > 0) return asMove(lowest(unruffed))
      }
      return asMove(lowest(safe))
    }
    return asMove(lowest(cards))
  }

  /* Following. */
  const led = hand.trick[0]?.card.suit as Suit
  const bestIdx = winningIndex(hand.trick, trump)
  const best = hand.trick[bestIdx]
  if (!best) return fallback
  const partnerWinning = teamOf(best.seat) === teamOf(seat)
  const last = hand.trick.length === 3
  const winners = cards.filter((c) => beats(c, best.card, led, trump))

  const partnerSafe =
    partnerWinning &&
    (last ||
      (isMaster(best.card, trump, k) &&
        !(
          suitTrump &&
          best.card.suit !== trump &&
          hand.trick.length === 1 &&
          !k.voids[nextSeatOf(seat)]?.has(trump) &&
          level === 'hard'
        )))
  if (partnerSafe) {
    // Load the trick with points, but never waste a master card or a trump.
    const loadable = cards.filter(
      (c) => !(suitTrump && c.suit === trump) && !(isMaster(c, trump, k) && c.suit !== led),
    )
    return asMove(highest(loadable.length > 0 ? loadable : cards))
  }

  if (winners.length > 0) {
    if (last) {
      // Last to play: win with the card that banks the most points cheaply.
      const nonTrump = winners.filter((c) => !(suitTrump && c.suit === trump))
      return asMove(nonTrump.length > 0 ? highest(nonTrump) : lowest(winners))
    }
    const masterWinner = winners.find((c) => isMaster(c, trump, k))
    if (
      masterWinner &&
      (pts(masterWinner) >= 10 || hand.trick.some((p) => pts(p.card) >= 10) || suitTrump)
    ) {
      return asMove(masterWinner)
    }
    if (suitTrump && winners.every((c) => c.suit === trump) && led !== trump) {
      return asMove(lowest(winners))
    }
  }
  return asMove(lowest(cards))
}

const nextSeatOf = (seat: number) => (seat + 1) % 4

/* ---------- hard: Monte Carlo over the hidden hands ---------- */

/**
 * Tries each legal card against deals of the hidden hands that fit what this seat has
 * seen, plays every deal out with normal bots, and keeps the card that scores best on
 * average. Null when there is nothing to choose or no fitting deal turned up.
 */
function monteCarloPlay(
  state: GameState,
  seat: number,
  moves: Move[],
  salt: number,
  samples: number,
): Move | null {
  if (samples <= 0 || state.hand.phase !== 'playing' || moves.length < 2) return null
  if (moves.some((m) => m.type !== 'play')) return null
  const k: Knowledge = knowledgeFor(state, seat)
  const team = teamOf(seat)
  const totals = moves.map(() => 0)
  let rng = deckState((foldDeckState(state.rngState) ^ Math.imul(salt + 1, 2654435761)) | 0)
  let deals = 0
  for (let i = 0; i < samples; i++) {
    const sample = sampleHands(state, k, rng)
    if (sample === null) break
    rng = sample.rngState
    const world: GameState = { ...state, hand: { ...state.hand, hands: sample.hands } }
    moves.forEach((move, m) => {
      totals[m] = (totals[m] ?? 0) + rollout(world, seat, move, team)
    })
    deals++
  }
  if (deals === 0) return null
  let best = 0
  totals.forEach((t, m) => {
    if (t > (totals[best] ?? -Infinity)) best = m
  })
  return moves[best] ?? null
}

/** Plays `move`, then normal bots to the end of the hand: the score margin for `team`. */
function rollout(world: GameState, seat: number, move: Move, team: number): number {
  const first = applyMove(world, seat, move)
  if (!first.okay) return -Infinity
  let state = first.value
  for (let guard = 0; guard < 64 && state.hand.phase === 'playing'; guard++) {
    const next = botMove(state, state.hand.currentSeat, 'normal')
    if (next === null) break
    const applied = applyMove(state, state.hand.currentSeat, next)
    if (!applied.okay) break
    state = applied.value
  }
  const scored = state.hand.result?.scored
  if (scored === undefined) return 0
  return (scored[team] ?? 0) - (scored[1 - team] ?? 0)
}
