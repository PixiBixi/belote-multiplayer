import { findDeclarations, legalMoves, teamOf, type GameState, type Trump } from '@belote/engine'
import type { BeloteCall, HandView, PlayerView, SeatInfo } from './views.js'

/**
 * The single place hidden information is filtered. Everything a seat may not see is
 * dropped here: other hands, the stock, and declarations the rules have not yet shown.
 */
export function buildHandView(state: GameState): HandView {
  const h = state.hand
  const trump: Trump | null = h.contract?.trump ?? null
  const tricksWon: [number, number] = [0, 0]
  for (const t of h.tricks) tricksWon[teamOf(t.winner)] += 1

  const firstTrickOver = h.tricks.length > 0
  const announced = h.declared
    .map((decls, seat) => ({ seat, kinds: decls.map((d) => d.kind) }))
    .filter((a) => a.kinds.length > 0)
  const shownDeclarations =
    firstTrickOver && h.declarationWinner !== null
      ? h.declared
          .map((declarations, seat) => ({ seat, declarations }))
          .filter((d) => d.declarations.length > 0 && teamOf(d.seat) === h.declarationWinner)
      : []

  return {
    number: state.handNumber,
    phase: h.phase,
    dealer: h.dealer,
    currentSeat: h.currentSeat,
    turned: h.phase === 'bidding' ? h.turned : null,
    biddingRound: h.biddingRound,
    bids: h.bids,
    highBid: h.highBid,
    coinchedBy: h.coinchedBy,
    surcoinched: h.surcoinched,
    contract: h.contract,
    handCounts: h.hands.map((cards) => cards.length),
    trick: h.trick,
    lastTrick: h.tricks[h.tricks.length - 1] ?? null,
    tricksWon,
    announced,
    shownDeclarations,
    declarationWinner: firstTrickOver ? h.declarationWinner : null,
    beloteCalls: trump ? beloteCalls(state, trump) : [],
    result: h.result,
  }
}

/** The holder says "belote" on the first of king and queen of trump, "rebelote" on the second. */
function beloteCalls(state: GameState, trump: Trump): BeloteCall[] {
  const holder = state.hand.beloteHolder
  if (holder === null) return []
  const played = [...state.hand.tricks.flatMap((t) => t.cards), ...state.hand.trick].filter(
    (p) =>
      p.seat === holder && p.card.suit === trump && (p.card.rank === 'K' || p.card.rank === 'Q'),
  )
  return played.map((_, i) => ({ seat: holder, call: i === 0 ? 'belote' : 'rebelote' }))
}

export function buildPlayerView(
  state: GameState,
  seat: number,
  seats: SeatInfo[],
  timing: { turnDeadline: number | null; nextHandDeadline: number | null },
): PlayerView {
  const hand = state.hand.hands[seat] ?? []
  const moves = legalMoves(state, seat)
  return {
    you: {
      seat,
      hand,
      legalMoves: moves,
      declarable: moves.some((m) => m.type === 'declare') ? findDeclarations(hand) : [],
    },
    seats,
    rules: state.rules,
    hand: buildHandView(state),
    scores: state.scores,
    reserve: state.reserve,
    history: state.history,
    phase: state.phase,
    winner: state.winner,
    turnDeadline: timing.turnDeadline,
    nextHandDeadline: timing.nextHandDeadline,
  }
}
