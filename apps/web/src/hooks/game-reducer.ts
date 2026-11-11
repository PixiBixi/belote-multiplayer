import {
  applyViewUpdate,
  type GameEvent,
  type LobbyView,
  type PlayerView,
  type ViewUpdate,
} from '@belote/protocol'
import type { Messages } from '../i18n/messages.js'

/** A long game produces hundreds of events. The feed is a view, not a log. */
export const FEED_LIMIT = 120
const TOAST_LIMIT = 4

export type FeedEntry =
  | { id: number; kind: 'chat'; seat: number; name: string; text: string }
  | { id: number; kind: 'event'; event: GameEvent }

export type Toast = { id: number; tone: 'info' | 'warn' | 'bad'; title: string; detail: string }

/**
 * `Omit` does not distribute over a union: `Omit<FeedEntry, 'id'>` collapses to
 * the keys the members share, silently dropping `event`, `seat` and `text`. This
 * applies the omission to each member instead.
 */
type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type ClientState = {
  connection: 'connecting' | 'open' | 'lost'
  screen: 'home' | 'lobby' | 'table'
  roomCode: string | null
  seat: number | null
  lobby: LobbyView | null
  view: PlayerView | null
  feed: FeedEntry[]
  toasts: Toast[]
  error: string | null
  nextId: number
}

export type Action =
  | { type: 'connection'; connection: ClientState['connection'] }
  | { type: 'joined'; roomCode: string; seat: number }
  | { type: 'seat'; seat: number }
  | { type: 'lobby'; lobby: LobbyView }
  | { type: 'view'; view: ViewUpdate }
  | { type: 'event'; event: GameEvent }
  | { type: 'chat'; message: { seat: number; name: string; text: string } }
  | { type: 'error'; message: string }
  | { type: 'dismissToast'; id: number }
  | { type: 'left' }

export const initialState: ClientState = {
  connection: 'connecting',
  screen: 'home',
  roomCode: null,
  seat: null,
  lobby: null,
  view: null,
  feed: [],
  toasts: [],
  error: null,
  nextId: 1,
}

/** Only events worth interrupting a player for; the rest goes to the feed. */
function toastFor(
  event: GameEvent,
  t: Messages,
  name: (seat: number) => string,
): Omit<Toast, 'id'> | null {
  const text = t.event(event, name)
  if (text === null) return null
  switch (event.type) {
    case 'seatDisconnected':
    case 'seatLeft':
      return { tone: 'bad', title: text, detail: '' }
    case 'botTookOver':
    case 'turnTimedOut':
      return { tone: 'warn', title: text, detail: '' }
    case 'gameRestarted':
      return { tone: 'info', title: text, detail: '' }
    default:
      return null
  }
}

/** The newest entry already on screen. Both effect hooks need it to tell a fresh
 *  event from the backlog a reconnect replays. */
export const highestFeedId = (feed: FeedEntry[]): number =>
  feed.reduce((highest, entry) => (entry.id > highest ? entry.id : highest), 0)

const withFeed = (state: ClientState, entry: OmitEach<FeedEntry, 'id'>): ClientState => {
  const feed: FeedEntry[] = [...state.feed, { ...entry, id: state.nextId }]
  return {
    ...state,
    feed: feed.length > FEED_LIMIT ? feed.slice(feed.length - FEED_LIMIT) : feed,
    nextId: state.nextId + 1,
  }
}

export function gameReducer(state: ClientState, action: Action, messages: Messages): ClientState {
  switch (action.type) {
    case 'connection':
      return { ...state, connection: action.connection }

    case 'joined':
      return {
        ...state,
        screen: 'lobby',
        roomCode: action.roomCode,
        seat: action.seat,
        error: null,
      }

    case 'seat':
      return { ...state, seat: action.seat }

    case 'lobby':
      // Never demotes the screen: a lobby update arriving mid-game must not yank
      // the player off the table.
      return { ...state, lobby: action.lobby }

    case 'view':
      // The history only arrives past what this client holds: join it to the previous view.
      return {
        ...state,
        screen: 'table',
        view: applyViewUpdate(action.view, state.view),
        error: null,
      }

    case 'chat':
      return withFeed(state, { kind: 'chat', ...action.message })

    case 'event': {
      const withEvent = withFeed(state, { kind: 'event', event: action.event })
      const seats = state.view?.seats ?? state.lobby?.seats ?? []
      const name = (seat: number) => {
        const info = seats.find((s) => s.seat === seat)
        return info && info.kind !== 'empty' ? info.name : `#${seat + 1}`
      }
      const toast = toastFor(action.event, messages, name)
      if (toast === null) return withEvent
      const toasts = [...withEvent.toasts, { ...toast, id: withEvent.nextId }]
      return {
        ...withEvent,
        toasts: toasts.length > TOAST_LIMIT ? toasts.slice(toasts.length - TOAST_LIMIT) : toasts,
        nextId: withEvent.nextId + 1,
      }
    }

    case 'error':
      return { ...state, error: action.message }

    case 'dismissToast':
      return { ...state, toasts: state.toasts.filter((toast) => toast.id !== action.id) }

    case 'left':
      return { ...initialState, connection: state.connection, nextId: state.nextId }
  }
}
