import type {
  BidEvent,
  BotLevel,
  Card,
  Contract,
  Declaration,
  DeclarationKind,
  GamePhase,
  HandPhase,
  HandResult,
  Move,
  PlayedCard,
  TableRules,
  Team,
  Trick,
  Trump,
} from '@belote/engine'

export const ROOM_CODE_LENGTH = 6
export const SEAT_COUNT = 4
export const MAX_NAME_LENGTH = 20
export const MAX_CHAT_LENGTH = 200
/* Bounded because these strings are relayed to another player untouched. */
export const MAX_SDP_LENGTH = 16_384
export const MAX_CANDIDATE_LENGTH = 512
export const MAX_SDP_MID_LENGTH = 16

export const TARGET_CHOICES: readonly number[] = [501, 1000, 1500, 2000]

/* Below five seconds nobody can read a hand; above two minutes it is not a limit. */
export const MIN_TURN_SECONDS = 5
export const MAX_TURN_SECONDS = 120
export const DEFAULT_TURN_SECONDS = 30

/** Pause on the score of a finished hand before the next one deals itself. */
export const BETWEEN_HANDS_SECONDS = 6
/** How long a completed trick stays on the felt before it is gathered. */
export const TRICK_PAUSE_MS = 1200
/** How long a bot "thinks", so the table can follow what it does. */
export const BOT_DELAY_MS = 800

/** Alphabet without ambiguous characters: no O/0, no I/1. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** A house setting, not a rule: the engine never sees a clock. Null means no clock. */
export type MatchPace = { turnSeconds: number } | null

export type SeatStatus = 'active' | 'disconnected' | 'left'

/**
 * Who sits where. A human who leaves mid-game is replaced by a bot until they come
 * back, hence `bot` carrying the name of the seat it stands in for.
 */
export type SeatInfo =
  | { seat: number; kind: 'human'; name: string; status: SeatStatus }
  | { seat: number; kind: 'bot'; name: string; level: BotLevel; standingInFor: string | null }
  | { seat: number; kind: 'empty' }

/** A belote or rebelote said aloud when the king or queen of trump hits the felt. */
export type BeloteCall = { seat: number; call: 'belote' | 'rebelote' }

/**
 * The public part of the hand. Other seats' cards never cross the wire: only counts,
 * and the declarations the rules make public.
 */
export type HandView = {
  number: number
  phase: HandPhase
  dealer: number
  currentSeat: number
  /** Classic: the card turned up, until somebody takes it. */
  turned: Card | null
  biddingRound: 1 | 2
  bids: BidEvent[]
  highBid: { seat: number; value: number; trump: Trump } | null
  coinchedBy: number | null
  surcoinched: boolean
  contract: Contract | null
  handCounts: number[]
  trick: PlayedCard[]
  lastTrick: Trick | null
  tricksWon: [number, number]
  /** Card points won so far this hand, dix de der included; tricks are public. By team. */
  pointsWon: [number, number]
  /**
   * During the first trick, what each seat announced (kinds only, as said at the
   * table). Once the first trick is over, the winning team's full declarations.
   */
  announced: { seat: number; kinds: DeclarationKind[] }[]
  shownDeclarations: { seat: number; declarations: Declaration[] }[]
  declarationWinner: Team | null
  beloteCalls: BeloteCall[]
  result: HandResult | null
}

export type PlayerView = {
  you: {
    seat: number
    hand: Card[]
    legalMoves: Move[]
    /** What a `declare` move would announce, so the button can say it. */
    declarable: Declaration[]
  }
  seats: SeatInfo[]
  rules: TableRules
  hand: HandView
  scores: [number, number]
  reserve: number
  history: HandResult[]
  phase: GamePhase
  winner: Team | null
  /** Epoch ms when the seat on turn runs out, null without a clock or on a bot's turn. */
  turnDeadline: number | null
  /** Epoch ms when the next hand deals itself. */
  nextHandDeadline: number | null
}

export type LobbyView = {
  roomCode: string
  hostSeat: number
  seats: SeatInfo[]
  /** Every seat is a human or a bot. */
  canStart: boolean
  pace: MatchPace
  rules: TableRules
  /** False once the game has started: the rules of a contest in progress do not change. */
  configurable: boolean
}
