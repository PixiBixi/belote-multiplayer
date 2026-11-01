import { cardPoints, type Card, type GameState, type Move, type Trump } from '@belote/engine'
import type { GameEvent } from '@belote/protocol'

/**
 * Derives the narrative feed by comparing the state before and after a move.
 * Deriving rather than hand-emitting means an event can never contradict the state
 * it describes.
 */
export function diffEvents(
  before: GameState,
  after: GameState,
  seat: number,
  move: Move,
): GameEvent[] {
  const events: GameEvent[] = []
  const hand = before.hand

  switch (move.type) {
    case 'pass':
      events.push({ type: 'bid', bid: { seat, type: 'pass' } })
      break
    case 'take':
      events.push({ type: 'bid', bid: { seat, type: 'take', trump: move.trump } })
      break
    case 'bid':
      events.push({ type: 'bid', bid: { seat, type: 'bid', value: move.value, trump: move.trump } })
      break
    case 'coinche':
      events.push({ type: 'bid', bid: { seat, type: 'coinche' } })
      break
    case 'surcoinche':
      events.push({ type: 'bid', bid: { seat, type: 'surcoinche' } })
      break
    case 'declare':
      events.push({
        type: 'declared',
        seat,
        kinds: (after.hand.declared[seat] ?? []).map((d) => d.kind),
      })
      break
    case 'play': {
      const card = (hand.hands[seat] ?? []).find((c) => c.id === move.cardId)
      if (card === undefined) break
      events.push({ type: 'cardPlayed', seat, card })
      const call = beloteCall(before, seat, card)
      if (call !== null) events.push({ type: 'belote', seat, call })
      if (after.hand.tricks.length > hand.tricks.length) {
        const trick = after.hand.tricks[after.hand.tricks.length - 1]
        const trump: Trump = after.hand.contract?.trump ?? 'SA'
        if (trick !== undefined) {
          const points = trick.cards.reduce((sum, p) => sum + cardPoints(p.card, trump), 0)
          events.push({ type: 'trickWon', seat: trick.winner, points })
        }
      }
      break
    }
  }

  if (hand.phase !== 'done' && after.hand.phase === 'done') {
    const result = after.hand.result
    if (result === null || result.kind === 'redeal') {
      events.push({ type: 'redeal', dealer: after.hand.dealer })
    } else {
      events.push({ type: 'handEnded', result, scores: after.scores })
    }
    if (after.phase === 'finished' && after.winner !== null) {
      events.push({ type: 'gameEnded', winner: after.winner, scores: after.scores })
    }
  }
  return events
}

/** Belote on the first of king and queen of trump the holder plays, rebelote on the second. */
function beloteCall(before: GameState, seat: number, card: Card): 'belote' | 'rebelote' | null {
  const h = before.hand
  const trump = h.contract?.trump
  if (h.beloteHolder !== seat || trump === undefined) return null
  if (card.suit !== trump || (card.rank !== 'K' && card.rank !== 'Q')) return null
  const already = [...h.tricks.flatMap((t) => t.cards), ...h.trick].filter(
    (p) => p.seat === seat && p.card.suit === trump && (p.card.rank === 'K' || p.card.rank === 'Q'),
  ).length
  return already === 0 ? 'belote' : 'rebelote'
}
