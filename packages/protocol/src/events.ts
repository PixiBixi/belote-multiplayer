import type {
  BidEvent,
  BotLevel,
  Card,
  DeclarationKind,
  HandResult,
  Move,
  TableRules,
  Team,
} from '@belote/engine'
import type { LobbyView, MatchPace } from './views.js'
import type { ViewUpdate } from './view-update.js'

export type ErrorCode =
  | 'room_not_found'
  | 'room_full'
  | 'invalid_payload'
  | 'not_host'
  | 'seats_not_filled'
  | 'seat_taken'
  | 'game_already_started'
  | 'game_not_started'
  | 'illegal_move'
  | 'not_your_turn'
  | 'rate_limited'
  | 'invalid_session'
  | 'server_full'
  | 'hand_in_progress'
  | 'game_over'
  | 'voice_not_joined'
  | 'voice_peer_unavailable'

/** Narrative feed for animations, sounds and the log. Never used as state. */
export type GameEvent =
  | { type: 'handStarted'; number: number; dealer: number }
  | { type: 'bid'; bid: BidEvent }
  | { type: 'declared'; seat: number; kinds: DeclarationKind[] }
  | { type: 'cardPlayed'; seat: number; card: Card }
  | { type: 'belote'; seat: number; call: 'belote' | 'rebelote' }
  | { type: 'trickWon'; seat: number; points: number }
  | { type: 'redeal'; dealer: number }
  | { type: 'handEnded'; result: HandResult; scores: [number, number] }
  | { type: 'gameEnded'; winner: Team; scores: [number, number] }
  | { type: 'turnTimedOut'; seat: number }
  | { type: 'botTookOver'; seat: number }
  | { type: 'seatDisconnected'; seat: number }
  | { type: 'seatReconnected'; seat: number }
  | { type: 'seatLeft'; seat: number }
  | { type: 'gameRestarted' }

/** Not `Record<string, never>`, which intersected with `{ ok: true }` is unsatisfiable. */
export type Empty = Record<never, never>

export type Ack<T = Empty> = (result: ({ ok: true } & T) | { ok: false; error: ErrorCode }) => void

/** Every field optional: absent means leave it alone. `pace: null` removes the clock. */
export type TableConfiguration = {
  pace?: MatchPace | undefined
  rules?: TableRules | undefined
}

/** What the host puts in a seat no human holds. */
export type SeatOccupant = { kind: 'bot'; level: BotLevel } | { kind: 'empty' }

export type VoicePeer = { seat: number; muted: boolean }
export type IceServer = { urls: string[]; username?: string; credential?: string }
export type VoiceSignal =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'candidate'; candidate: string; sdpMid: string | null; sdpMLineIndex: number | null }

export type ClientToServer = {
  'room:create': (
    payload: { playerName: string; pace: MatchPace; rules: TableRules },
    ack: Ack<{ roomCode: string; sessionToken: string; seat: number }>,
  ) => void
  'room:join': (
    payload: { roomCode: string; playerName: string },
    ack: Ack<{ sessionToken: string; seat: number }>,
  ) => void
  'room:rejoin': (
    payload: { roomCode: string; sessionToken: string },
    ack: Ack<{ seat: number }>,
  ) => void
  'room:leave': (payload: Empty, ack: Ack) => void
  /** Host only, lobby only. */
  'room:configure': (payload: TableConfiguration, ack: Ack) => void
  /** Host only, lobby only: puts a bot in, changes its level, or empties a non-human seat. */
  'room:setSeat': (payload: { seat: number; occupant: SeatOccupant }, ack: Ack) => void
  /** Lobby only: a human moves to an empty seat, which is how partners are chosen. */
  'room:moveSeat': (payload: { seat: number }, ack: Ack<{ seat: number }>) => void
  'game:start': (payload: Empty, ack: Ack) => void
  /** Skips the pause after a hand. Anyone may, so a table is never stuck on one player. */
  'game:nextHand': (payload: Empty, ack: Ack) => void
  /** Host only: new game, same table and rules, scores reset. */
  'game:restart': (payload: Empty, ack: Ack) => void
  'game:move': (payload: { move: Move }, ack: Ack) => void
  'chat:send': (payload: { text: string }, ack: Ack) => void
  'voice:join': (payload: Empty, ack: Ack<{ iceServers: IceServer[]; peers: VoicePeer[] }>) => void
  'voice:leave': (payload: Empty, ack: Ack) => void
  'voice:signal': (payload: { toSeat: number; signal: VoiceSignal }, ack: Ack) => void
  'voice:mute': (payload: { muted: boolean }, ack: Ack) => void
}

export type ServerToClient = {
  'room:state': (view: LobbyView) => void
  'game:view': (view: ViewUpdate) => void
  'game:event': (event: GameEvent) => void
  'chat:message': (message: { seat: number; name: string; text: string }) => void
  'voice:peers': (peers: VoicePeer[]) => void
  'voice:signal': (payload: { fromSeat: number; signal: VoiceSignal }) => void
  error: (payload: { code: ErrorCode; message: string }) => void
}
