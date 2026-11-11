import type { HandResult } from '@belote/engine'
import type { PlayerView } from './views.js'

/**
 * What `game:view` carries: a PlayerView whose `history` only holds the results from
 * `historyFrom` on, the socket already having the earlier ones. Absent means from 0.
 */
export type ViewUpdate = Omit<PlayerView, 'history'> & {
  history: HandResult[]
  historyFrom?: number
}

/** `known` is how many results this socket was sent already; a shorter history restarts at 0. */
export function toViewUpdate(view: PlayerView, known: number): ViewUpdate {
  if (known === 0 || known > view.history.length) return view
  return { ...view, history: view.history.slice(known), historyFrom: known }
}

/** Rebuilds the full view from an update and the view the client held before it. */
export function applyViewUpdate(update: ViewUpdate, previous: PlayerView | null): PlayerView {
  const { historyFrom, ...rest } = update
  if (historyFrom === undefined) return update
  return {
    ...rest,
    history: [...(previous?.history.slice(0, historyFrom) ?? []), ...update.history],
  }
}
