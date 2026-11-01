import {
  DEFAULT_TABLE_RULES,
  parseCardId,
  type CardId,
  type Move,
  type TableRules,
  type Trump,
} from '@belote/engine'
import { z } from 'zod'
import {
  MAX_CANDIDATE_LENGTH,
  MAX_CHAT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SDP_LENGTH,
  MAX_SDP_MID_LENGTH,
  MAX_TURN_SECONDS,
  MIN_TURN_SECONDS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  SEAT_COUNT,
  TARGET_CHOICES,
  type MatchPace,
} from './views.js'
import type { SeatOccupant } from './events.js'

const roomCode = z
  .string()
  .trim()
  .toUpperCase()
  .length(ROOM_CODE_LENGTH)
  .refine((code) => [...code].every((c) => ROOM_CODE_ALPHABET.includes(c)), {
    message: 'room code contains characters outside the allowed alphabet',
  })

const playerName = z.string().trim().min(1).max(MAX_NAME_LENGTH)

/** The boundary where an untrusted string becomes a CardId: it must name a real card. */
const cardId = z
  .string()
  .max(3)
  .refine((v) => parseCardId(v) !== null, { message: 'not a card' })
  .transform((v) => v as CardId)

const seatNumber = z
  .number()
  .int()
  .min(0)
  .max(SEAT_COUNT - 1)

const trump: z.ZodType<Trump> = z.enum(['S', 'H', 'D', 'C', 'AT', 'SA'])

export const moveSchema: z.ZodType<Move> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pass') }),
  z.object({ type: z.literal('take'), trump }),
  z.object({ type: z.literal('bid'), value: z.number().int().min(80).max(500), trump }),
  z.object({ type: z.literal('coinche') }),
  z.object({ type: z.literal('surcoinche') }),
  z.object({ type: z.literal('declare') }),
  z.object({ type: z.literal('play'), cardId }),
])

/** Each flag defaults on its own, so a client that omits a newer rule still gets a table. */
export const tableRulesSchema: z.ZodType<TableRules> = z.object({
  variant: z.enum(['classic', 'coinche']).default(DEFAULT_TABLE_RULES.variant),
  allTrumps: z.boolean().default(DEFAULT_TABLE_RULES.allTrumps),
  vache: z.boolean().default(DEFAULT_TABLE_RULES.vache),
  pisse: z.boolean().default(DEFAULT_TABLE_RULES.pisse),
  mustOvertrump: z.boolean().default(DEFAULT_TABLE_RULES.mustOvertrump),
  declarations: z.boolean().default(DEFAULT_TABLE_RULES.declarations),
  target: z
    .number()
    .int()
    .refine((t) => TARGET_CHOICES.includes(t), { message: 'unsupported target' })
    .default(DEFAULT_TABLE_RULES.target),
})

export const matchPaceSchema: z.ZodType<MatchPace> = z.union([
  z.null(),
  z.object({ turnSeconds: z.number().int().min(MIN_TURN_SECONDS).max(MAX_TURN_SECONDS) }),
])

const botLevel = z.enum(['easy', 'normal', 'hard'])

export const seatOccupantSchema: z.ZodType<SeatOccupant> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('bot'), level: botLevel }),
  z.object({ kind: z.literal('empty') }),
])

export const roomCreateSchema = z.object({
  playerName,
  pace: matchPaceSchema,
  rules: tableRulesSchema.default(DEFAULT_TABLE_RULES),
})
export const roomConfigureSchema = z.object({
  pace: matchPaceSchema.optional(),
  rules: tableRulesSchema.optional(),
})
export const roomSetSeatSchema = z.object({ seat: seatNumber, occupant: seatOccupantSchema })
export const roomMoveSeatSchema = z.object({ seat: seatNumber })
export const roomJoinSchema = z.object({ roomCode, playerName })
export const roomRejoinSchema = z.object({ roomCode, sessionToken: z.uuid() })
export const roomLeaveSchema = z.object({})
export const gameStartSchema = z.object({})
export const gameNextHandSchema = z.object({})
export const gameRestartSchema = z.object({})
export const gameMoveSchema = z.object({ move: moveSchema })
export const chatSendSchema = z.object({ text: z.string().trim().min(1).max(MAX_CHAT_LENGTH) })

const voiceSignalSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('offer'), sdp: z.string().min(1).max(MAX_SDP_LENGTH) }),
  z.object({ kind: z.literal('answer'), sdp: z.string().min(1).max(MAX_SDP_LENGTH) }),
  z.object({
    kind: z.literal('candidate'),
    candidate: z.string().max(MAX_CANDIDATE_LENGTH),
    sdpMid: z.string().max(MAX_SDP_MID_LENGTH).nullable(),
    sdpMLineIndex: z.number().int().min(0).max(16).nullable(),
  }),
])

export const voiceSignalSendSchema = z.object({ toSeat: seatNumber, signal: voiceSignalSchema })
export const voiceMuteSchema = z.object({ muted: z.boolean() })
