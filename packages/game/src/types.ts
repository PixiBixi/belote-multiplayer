/** Spades, hearts, diamonds, clubs. */
export type Suit = 'S' | 'H' | 'D' | 'C'
export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'] as const

/** Natural order, used for sequences (tierce, cinquante, cent). */
export type Rank = '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A'
export const RANKS: readonly Rank[] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const

/** Rank followed by suit, e.g. `'JH'` or `'10S'`. Unique in a 32-card deck. */
export type CardId = string & { readonly __brand: 'CardId' }

export type Card = { id: CardId; suit: Suit; rank: Rank }

/** A suit, tout atout (every suit ranks as trump) or sans atout (no trump at all). */
export type Trump = Suit | 'AT' | 'SA'

export type Team = 0 | 1
export const teamOf = (seat: number): Team => (seat % 2) as Team
export const SEATS = 4

export type Variant = 'classic' | 'coinche'

/**
 * Rules a table chooses at creation. They change what the rules ARE, so the reducer
 * reads them, and they are part of the state so a game replays from (seed, rules, moves).
 */
export type TableRules = {
  variant: Variant
  /** Tout atout and sans atout may be bid. */
  allTrumps: boolean
  /**
   * When all four pass, the hand is played anyway in sans atout with no taker and each
   * team keeps what it makes. Off: the cards are redealt.
   */
  vache: boolean
  /**
   * A seat that cannot follow may discard instead of trumping when its partner holds the
   * trick. Off: it must trump whenever it can.
   */
  pisse: boolean
  /** Must play a higher trump (or a higher card of the led suit at tout atout) when able. */
  mustOvertrump: boolean
  /** Tierce, cinquante, cent and carrés are scored. Belote-rebelote always is. */
  declarations: boolean
  /** First team to reach this many points wins the game. */
  target: number
}

export const DEFAULT_TABLE_RULES: TableRules = {
  variant: 'classic',
  allTrumps: true,
  vache: true,
  pisse: false,
  mustOvertrump: true,
  declarations: true,
  target: 1000,
}

export const COINCHE_VALUES: readonly number[] = [80, 90, 100, 110, 120, 130, 140, 150, 160]
export const CAPOT_VALUE = 250
export const GENERALE_VALUE = 500

export type DeclarationKind = 'tierce' | 'cinquante' | 'cent' | 'carre'

export type Declaration = {
  kind: DeclarationKind
  points: number
  cards: CardId[]
  /** Highest card: the top of a sequence, the rank of a carré. */
  top: Rank
  /** Set for sequences, absent for carrés. */
  suit?: Suit
}

export type Contract = {
  /** Null on a vache hand, which nobody took. */
  taker: number | null
  trump: Trump
  /** Coinche only: the bid value, 250 for capot, 500 for générale. Null in classic. */
  value: number | null
  multiplier: 1 | 2 | 4
}

export type PlayedCard = { seat: number; card: Card }
export type Trick = { cards: PlayedCard[]; winner: number }

/** Everything said during the bidding, in order, for the client to replay. */
export type BidEvent =
  | { seat: number; type: 'pass' }
  | { seat: number; type: 'take'; trump: Trump }
  | { seat: number; type: 'bid'; value: number; trump: Trump }
  | { seat: number; type: 'coinche' }
  | { seat: number; type: 'surcoinche' }

export type HandResult = {
  kind: 'played' | 'redeal'
  contract: Contract | null
  /** Card points plus dix de der, 250 for a capot. Indexed by team. */
  trickPoints: [number, number]
  declarationPoints: [number, number]
  belotePoints: [number, number]
  /** Team that won every trick, if any. */
  capot: Team | null
  /** Null on a vache or a redeal. */
  made: boolean | null
  litige: boolean
  /** What the hand added to each team's score, reserve included. */
  scored: [number, number]
}

export type HandPhase = 'bidding' | 'playing' | 'done'

export type HandState = {
  phase: HandPhase
  dealer: number
  currentSeat: number
  /** Indexed by seat. */
  hands: Card[][]
  /** Classic only: cards left to deal once somebody takes. */
  stock: Card[]
  /** Classic only: the card turned up for the first round. */
  turned: Card | null
  /** Classic only: 1 or 2. */
  biddingRound: 1 | 2
  bids: BidEvent[]
  /** Passes since the last bid, coinche or start of a round. */
  passes: number
  /** Coinche: highest bid so far. */
  highBid: { seat: number; value: number; trump: Trump } | null
  coinchedBy: number | null
  surcoinched: boolean
  contract: Contract | null
  trick: PlayedCard[]
  tricks: Trick[]
  /** Declared during the first trick, by seat. */
  declared: Declaration[][]
  /** Decided at the end of the first trick: the team whose declarations score. */
  declarationWinner: Team | null
  /** Seat holding king and queen of trump, scored automatically. */
  beloteHolder: number | null
  result: HandResult | null
}

export type GamePhase = 'playing' | 'finished'

export type GameState = {
  rules: TableRules
  rngState: number
  phase: GamePhase
  /** Cumulative, indexed by team. */
  scores: [number, number]
  /** Points held over by a litige, for the next team that wins a hand. */
  reserve: number
  handNumber: number
  hand: HandState
  history: HandResult[]
  winner: Team | null
}

export type Move =
  | { type: 'pass' }
  /** Classic: take on the turned card's suit in round 1, any other suit in round 2. */
  | { type: 'take'; trump: Trump }
  /** Coinche. */
  | { type: 'bid'; value: number; trump: Trump }
  | { type: 'coinche' }
  | { type: 'surcoinche' }
  /** First trick only, before playing: announce every combination held. */
  | { type: 'declare' }
  | { type: 'play'; cardId: CardId }

export type RuleViolation = 'game_finished' | 'not_your_turn' | 'illegal_move' | 'hand_over'

export type Result<T, E> = { okay: true; value: T } | { okay: false; error: E }
export const ok = <T>(value: T): Result<T, never> => ({ okay: true, value })
export const err = <E>(error: E): Result<never, E> => ({ okay: false, error })
