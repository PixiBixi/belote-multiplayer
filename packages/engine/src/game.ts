import { buildDeck, legalCards, winningIndex } from './cards.js'
import { declarationWinner, findDeclarations } from './declarations.js'
import { nextInt, shuffle } from './rng.js'
import { scoreHand } from './scoring.js'
import {
  CAPOT_VALUE,
  COINCHE_VALUES,
  DEFAULT_TABLE_RULES,
  GENERALE_VALUE,
  SEATS,
  SUITS,
  err,
  ok,
  teamOf,
  type Card,
  type Contract,
  type GameState,
  type HandResult,
  type HandState,
  type Move,
  type Result,
  type RuleViolation,
  type TableRules,
  type Trump,
} from './types.js'

export const nextSeat = (seat: number): number => (seat + 1) % SEATS

/** Deals a fresh hand. Classic deals five each and turns one up; coinche deals all eight. */
export function dealHand(
  rules: TableRules,
  dealer: number,
  rngState: number,
): { hand: HandState; rngState: number } {
  const shuffled = shuffle(buildDeck(), rngState)
  const deck = shuffled.items
  const hands: Card[][] = [[], [], [], []]
  const packets = rules.variant === 'classic' ? [3, 2] : [3, 3, 2]
  let cursor = 0
  for (const size of packets) {
    for (let i = 1; i <= SEATS; i++) {
      const seat = (dealer + i) % SEATS
      hands[seat]?.push(...deck.slice(cursor, cursor + size))
      cursor += size
    }
  }
  const turned = rules.variant === 'classic' ? (deck[cursor] ?? null) : null
  if (turned) cursor += 1
  return {
    rngState: shuffled.state,
    hand: {
      phase: 'bidding',
      dealer,
      currentSeat: nextSeat(dealer),
      hands,
      stock: deck.slice(cursor),
      turned,
      biddingRound: 1,
      bids: [],
      passes: 0,
      highBid: null,
      coinchedBy: null,
      surcoinched: false,
      contract: null,
      trick: [],
      tricks: [],
      declared: [[], [], [], []],
      declarationWinner: null,
      beloteHolder: null,
      result: null,
    },
  }
}

export function createGame(options: { seed: number; rules?: Partial<TableRules> }): GameState {
  const rules = { ...DEFAULT_TABLE_RULES, ...options.rules }
  const pick = nextInt(options.seed, SEATS)
  const dealt = dealHand(rules, pick.value, pick.state)
  return {
    rules,
    rngState: dealt.rngState,
    phase: 'playing',
    scores: [0, 0],
    reserve: 0,
    handNumber: 1,
    hand: dealt.hand,
    history: [],
    winner: null,
  }
}

/** Deals the next hand once the current one is over; the dealer moves one seat on. */
export function nextHand(state: GameState): GameState {
  if (state.phase === 'finished' || state.hand.phase !== 'done') return state
  const dealt = dealHand(state.rules, nextSeat(state.hand.dealer), state.rngState)
  return { ...state, rngState: dealt.rngState, hand: dealt.hand, handNumber: state.handNumber + 1 }
}

function trumpChoices(rules: TableRules): Trump[] {
  return rules.allTrumps ? [...SUITS, 'AT', 'SA'] : [...SUITS]
}

export function legalMoves(state: GameState, seat: number): Move[] {
  const hand = state.hand
  if (state.phase === 'finished' || hand.phase === 'done' || seat !== hand.currentSeat) return []
  const rules = state.rules

  if (hand.phase === 'bidding') {
    const moves: Move[] = [{ type: 'pass' }]
    if (rules.variant === 'classic') {
      const turnedSuit = hand.turned?.suit
      for (const trump of trumpChoices(rules)) {
        const isSuit = trump !== 'AT' && trump !== 'SA'
        if (isSuit && hand.biddingRound === 1 && trump !== turnedSuit) continue
        if (isSuit && hand.biddingRound === 2 && trump === turnedSuit) continue
        moves.push({ type: 'take', trump })
      }
      return moves
    }
    const high = hand.highBid
    if (hand.coinchedBy !== null) {
      if (high && teamOf(seat) === teamOf(high.seat) && !hand.surcoinched)
        moves.push({ type: 'surcoinche' })
      return moves
    }
    const values = [...COINCHE_VALUES, CAPOT_VALUE, GENERALE_VALUE].filter(
      (v) => high === null || v > high.value,
    )
    for (const value of values) {
      for (const trump of trumpChoices(rules)) moves.push({ type: 'bid', value, trump })
    }
    if (high && teamOf(high.seat) !== teamOf(seat)) moves.push({ type: 'coinche' })
    return moves
  }

  const contract = hand.contract
  const cards = hand.hands[seat] ?? []
  if (contract === null) return []
  const moves: Move[] = []
  const firstTrick = hand.tricks.length === 0
  if (
    rules.declarations &&
    firstTrick &&
    (hand.declared[seat]?.length ?? 0) === 0 &&
    findDeclarations(cards).length > 0
  ) {
    moves.push({ type: 'declare' })
  }
  for (const card of legalCards(cards, hand.trick, contract.trump, rules, seat)) {
    moves.push({ type: 'play', cardId: card.id })
  }
  return moves
}

const sameMove = (a: Move, b: Move): boolean => JSON.stringify(a) === JSON.stringify(b)

/** Gives out the stock once the trump is known: the receiver gets the turned card and two more. */
function completeDeal(hand: HandState, receiver: number): Card[][] {
  const hands = hand.hands.map((h) => [...h])
  const stock = [...hand.stock]
  for (let i = 1; i <= SEATS; i++) {
    const seat = (hand.dealer + i) % SEATS
    const target = hands[seat]
    if (!target) continue
    if (seat === receiver && hand.turned) target.push(hand.turned)
    target.push(...stock.splice(0, seat === receiver ? 2 : 3))
  }
  return hands
}

function beloteHolder(hands: Card[][], trump: Trump): number | null {
  if (trump === 'AT' || trump === 'SA') return null
  const idx = hands.findIndex(
    (h) =>
      h.some((c) => c.suit === trump && c.rank === 'K') &&
      h.some((c) => c.suit === trump && c.rank === 'Q'),
  )
  return idx === -1 ? null : idx
}

function startPlay(hand: HandState, contract: Contract, hands: Card[][]): HandState {
  return {
    ...hand,
    phase: 'playing',
    hands,
    stock: [],
    contract,
    currentSeat: nextSeat(hand.dealer),
    beloteHolder: beloteHolder(hands, contract.trump),
  }
}

const REDEAL: Omit<HandResult, 'contract'> = {
  kind: 'redeal',
  trickPoints: [0, 0],
  declarationPoints: [0, 0],
  belotePoints: [0, 0],
  capot: null,
  made: null,
  litige: false,
  scored: [0, 0],
}

/** Everybody passed: a vache table plays sans atout with no taker, others redeal. */
function allPassed(state: GameState, hand: HandState): GameState {
  if (state.rules.vache) {
    const contract: Contract = { taker: null, trump: 'SA', value: null, multiplier: 1 }
    const hands = state.rules.variant === 'classic' ? completeDeal(hand, hand.dealer) : hand.hands
    return { ...state, hand: startPlay(hand, contract, hands) }
  }
  const result: HandResult = { ...REDEAL, contract: null }
  return { ...state, hand: { ...hand, phase: 'done', result }, history: [...state.history, result] }
}

function applyBid(state: GameState, seat: number, move: Move): GameState {
  let hand = state.hand
  const next = nextSeat(seat)

  if (state.rules.variant === 'classic') {
    if (move.type === 'take') {
      hand = { ...hand, bids: [...hand.bids, { seat, type: 'take', trump: move.trump }] }
      const contract: Contract = { taker: seat, trump: move.trump, value: null, multiplier: 1 }
      return { ...state, hand: startPlay(hand, contract, completeDeal(hand, seat)) }
    }
    hand = {
      ...hand,
      bids: [...hand.bids, { seat, type: 'pass' }],
      passes: hand.passes + 1,
      currentSeat: next,
    }
    if (hand.passes < SEATS) return { ...state, hand }
    if (hand.biddingRound === 1) {
      return {
        ...state,
        hand: { ...hand, biddingRound: 2, passes: 0, currentSeat: nextSeat(hand.dealer) },
      }
    }
    return allPassed(state, hand)
  }

  switch (move.type) {
    case 'bid':
      hand = {
        ...hand,
        bids: [...hand.bids, { seat, type: 'bid', value: move.value, trump: move.trump }],
        highBid: { seat, value: move.value, trump: move.trump },
        passes: 0,
        currentSeat: next,
      }
      return { ...state, hand }
    case 'coinche':
      hand = {
        ...hand,
        bids: [...hand.bids, { seat, type: 'coinche' }],
        coinchedBy: seat,
        passes: 0,
        currentSeat: next,
      }
      return { ...state, hand }
    case 'surcoinche':
      hand = { ...hand, bids: [...hand.bids, { seat, type: 'surcoinche' }], surcoinched: true }
      return endCoincheBidding(state, hand)
    default:
      hand = {
        ...hand,
        bids: [...hand.bids, { seat, type: 'pass' }],
        passes: hand.passes + 1,
        currentSeat: next,
      }
      if (hand.highBid === null)
        return hand.passes >= SEATS ? allPassed(state, hand) : { ...state, hand }
      return hand.passes >= SEATS - 1 ? endCoincheBidding(state, hand) : { ...state, hand }
  }
}

function endCoincheBidding(state: GameState, hand: HandState): GameState {
  const high = hand.highBid
  if (!high) return allPassed(state, hand)
  const multiplier = hand.surcoinched ? 4 : hand.coinchedBy !== null ? 2 : 1
  const contract: Contract = { taker: high.seat, trump: high.trump, value: high.value, multiplier }
  return { ...state, hand: startPlay(hand, contract, hand.hands) }
}

function applyPlay(
  state: GameState,
  seat: number,
  move: Extract<Move, { type: 'play' | 'declare' }>,
): GameState {
  const hand = state.hand
  const contract = hand.contract
  if (!contract) return state

  if (move.type === 'declare') {
    const declared = hand.declared.map((d, i) =>
      i === seat ? findDeclarations(hand.hands[seat] ?? []) : d,
    )
    return { ...state, hand: { ...hand, declared } }
  }

  const own = hand.hands[seat] ?? []
  const card = own.find((c) => c.id === move.cardId)
  if (!card) return state
  const hands = hand.hands.map((h, i) => (i === seat ? h.filter((c) => c.id !== card.id) : h))
  const trick = [...hand.trick, { seat, card }]

  if (trick.length < SEATS) {
    return { ...state, hand: { ...hand, hands, trick, currentSeat: nextSeat(seat) } }
  }

  const winner = trick[winningIndex(trick, contract.trump)]?.seat ?? seat
  const tricks = [...hand.tricks, { cards: trick, winner }]
  let next: HandState = { ...hand, hands, trick: [], tricks, currentSeat: winner }
  if (tricks.length === 1 && state.rules.declarations) {
    next = { ...next, declarationWinner: declarationWinner(next.declared, contract.trump) }
  }
  if (tricks.length < 8) return { ...state, hand: next }

  const scored = scoreHand(next, state.reserve)
  const scores: [number, number] = [
    state.scores[0] + scored.result.scored[0],
    state.scores[1] + scored.result.scored[1],
  ]
  const done: GameState = {
    ...state,
    scores,
    reserve: scored.reserve,
    hand: { ...next, phase: 'done', result: scored.result },
    history: [...state.history, scored.result],
  }
  const top = Math.max(scores[0], scores[1])
  if (top >= state.rules.target && scores[0] !== scores[1]) {
    return { ...done, phase: 'finished', winner: scores[0] > scores[1] ? 0 : 1 }
  }
  return done
}

export function applyMove(
  state: GameState,
  seat: number,
  move: Move,
): Result<GameState, RuleViolation> {
  if (state.phase === 'finished') return err('game_finished')
  if (state.hand.phase === 'done') return err('hand_over')
  if (seat !== state.hand.currentSeat) return err('not_your_turn')
  if (!legalMoves(state, seat).some((m) => sameMove(m, move))) return err('illegal_move')
  if (move.type === 'play' || move.type === 'declare') return ok(applyPlay(state, seat, move))
  return ok(applyBid(state, seat, move))
}
