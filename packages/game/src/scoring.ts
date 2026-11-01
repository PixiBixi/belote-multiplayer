import { CAPOT_POINTS, DIX_DE_DER, HAND_TOTAL, cardPoints } from './cards.js'
import {
  CAPOT_VALUE,
  GENERALE_VALUE,
  teamOf,
  type HandResult,
  type HandState,
  type Team,
} from './types.js'

const other = (t: Team): Team => (t === 0 ? 1 : 0)

/**
 * Scores a finished hand. Returns the result and the reserve left over, since a litige
 * parks the taker's points until some team wins a hand outright.
 */
export function scoreHand(
  hand: HandState,
  reserve: number,
): { result: HandResult; reserve: number } {
  const contract = hand.contract
  if (contract === null) throw new Error('scoreHand called on a hand without a contract')
  const trump = contract.trump

  const trickPoints: [number, number] = [0, 0]
  const tricksWon: [number, number] = [0, 0]
  hand.tricks.forEach((trick, i) => {
    const t = teamOf(trick.winner)
    tricksWon[t] += 1
    trickPoints[t] += trick.cards.reduce((sum, p) => sum + cardPoints(p.card, trump), 0)
    if (i === hand.tricks.length - 1) trickPoints[t] += DIX_DE_DER
  })
  let capot: Team | null = null
  if (tricksWon[0] === 8) capot = 0
  if (tricksWon[1] === 8) capot = 1
  if (capot !== null) {
    trickPoints[capot] = CAPOT_POINTS
    trickPoints[other(capot)] = 0
  }

  const declarationPoints: [number, number] = [0, 0]
  if (hand.declarationWinner !== null) {
    const w = hand.declarationWinner
    hand.declared.forEach((decls, seat) => {
      if (teamOf(seat) === w) declarationPoints[w] += decls.reduce((s, d) => s + d.points, 0)
    })
  }
  const belotePoints: [number, number] = [0, 0]
  if (hand.beloteHolder !== null) belotePoints[teamOf(hand.beloteHolder)] = 20

  const raw: [number, number] = [
    trickPoints[0] + declarationPoints[0] + belotePoints[0],
    trickPoints[1] + declarationPoints[1] + belotePoints[1],
  ]
  const allDecl = declarationPoints[0] + declarationPoints[1]
  const base = {
    kind: 'played' as const,
    contract,
    trickPoints,
    declarationPoints,
    belotePoints,
    capot,
  }

  const award = (scored: [number, number], winner: Team | null, litige = false) => {
    if (winner !== null && reserve > 0) {
      scored[winner] += reserve
      reserve = 0
    }
    return { result: { ...base, made: null, litige, scored }, reserve }
  }

  if (contract.taker === null) {
    // Vache: nobody took, each team keeps what it made.
    const winner = raw[0] === raw[1] ? null : raw[0] > raw[1] ? 0 : 1
    return award([raw[0], raw[1]], winner)
  }

  const T = teamOf(contract.taker)
  const D = other(T)

  if (contract.value === null) {
    // Classic: the takers must make strictly more than the defence.
    if (raw[T] > raw[D]) {
      const out = award([raw[0], raw[1]], T)
      return { ...out, result: { ...out.result, made: true } }
    }
    if (raw[T] < raw[D]) {
      const scored: [number, number] = [0, 0]
      scored[D] = (capot === D ? CAPOT_POINTS : HAND_TOTAL) + allDecl + belotePoints[D]
      scored[T] = belotePoints[T]
      const out = award(scored, D)
      return { ...out, result: { ...out.result, made: false } }
    }
    // Litige: the defence scores, the takers' points wait for the next winner.
    const scored: [number, number] = [0, 0]
    scored[D] = raw[D]
    scored[T] = belotePoints[T]
    reserve += raw[T] - belotePoints[T]
    return { result: { ...base, made: null, litige: true, scored }, reserve }
  }

  // Coinche.
  const m = contract.multiplier
  const V = contract.value
  let made: boolean
  if (V === GENERALE_VALUE) {
    made = hand.tricks.every((t) => t.winner === contract.taker)
  } else if (V === CAPOT_VALUE) {
    made = capot === T
  } else {
    made = raw[T] >= V && raw[T] > raw[D]
  }
  const scored: [number, number] = [0, 0]
  if (made) {
    if (m === 1) {
      scored[T] = V + raw[T]
      scored[D] = raw[D]
    } else {
      scored[T] = HAND_TOTAL + m * V + declarationPoints[T] + belotePoints[T]
      scored[D] = belotePoints[D]
    }
  } else {
    scored[D] = HAND_TOTAL + m * V + allDecl + belotePoints[D]
    scored[T] = belotePoints[T]
  }
  const out = award(scored, made ? T : D)
  return { ...out, result: { ...out.result, made } }
}
