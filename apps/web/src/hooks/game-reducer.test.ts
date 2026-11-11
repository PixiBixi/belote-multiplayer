import { toViewUpdate, type PlayerView } from '@belote/protocol'
import { describe, expect, it } from 'vitest'
import { CATALOGUES, type Messages } from '../i18n/index.js'
import { SEATS, doneGame, lobbyView, viewOf } from '../test-fixtures.js'
import {
  FEED_LIMIT,
  gameReducer as reduce,
  initialState,
  type Action,
  type ClientState,
} from './game-reducer.js'

/* The catalogue is a parameter: the reducer is pure and knows no React. French by default,
   the reference language. */
const gameReducer = (
  state: ClientState,
  action: Action,
  messages: Messages = CATALOGUES.fr,
): ClientState => reduce(state, action, messages)

const lobby = lobbyView()
const view: PlayerView = viewOf(doneGame(), 0)

const joined = () => gameReducer(initialState, { type: 'joined', roomCode: 'ABC234', seat: 0 })
const onTable = () => gameReducer(joined(), { type: 'view', view })

describe('gameReducer', () => {
  it('starts on the home screen with nothing joined', () => {
    expect(initialState.screen).toBe('home')
    expect(initialState.view).toBeNull()
    expect(initialState.roomCode).toBeNull()
  })

  it('moves to the lobby when a room is joined', () => {
    const next = joined()
    expect(next.screen).toBe('lobby')
    expect(next.roomCode).toBe('ABC234')
    expect(next.seat).toBe(0)
  })

  it('moves to the table on the first game view', () => {
    const next = onTable()
    expect(next.screen).toBe('table')
    expect(next.view).toBe(view)
  })

  it('rebuilds the history from updates that only carry what is new', () => {
    const result = view.history[0]
    if (result === undefined) throw new Error('the fixture game has a finished hand')
    const two = { ...view, history: [result, result] }
    // The first update carries everything, the next one only the second result.
    const first = gameReducer(joined(), {
      type: 'view',
      view: toViewUpdate({ ...two, history: [result] }, 0),
    })
    const second = gameReducer(first, { type: 'view', view: toViewUpdate(two, 1) })
    expect(second.view?.history).toEqual([result, result])
    expect(second.view?.seats).toEqual(two.seats)
  })

  it('follows a seat change without leaving the lobby', () => {
    const next = gameReducer(joined(), { type: 'seat', seat: 2 })
    expect(next.seat).toBe(2)
    expect(next.screen).toBe('lobby')
  })

  it('keeps the table screen when a game finishes', () => {
    const finished = gameReducer(onTable(), {
      type: 'view',
      view: { ...view, phase: 'finished', winner: 0 },
    })
    expect(finished.screen).toBe('table')
    expect(finished.view?.phase).toBe('finished')
  })

  it('stores a lobby update without pulling the player off the table', () => {
    const next = gameReducer(onTable(), { type: 'lobby', lobby })
    expect(next.screen).toBe('table')
    expect(next.lobby).toEqual(lobby)
  })

  it('appends chat and events to one feed, in order', () => {
    let state = joined()
    state = gameReducer(state, { type: 'event', event: { type: 'gameRestarted' } })
    state = gameReducer(state, { type: 'chat', message: { seat: 1, name: 'Ben', text: 'hi' } })
    expect(state.feed.map((entry) => entry.kind)).toEqual(['event', 'chat'])
  })

  it('gives every feed entry a distinct id', () => {
    let state = joined()
    for (let i = 0; i < 5; i += 1) {
      state = gameReducer(state, { type: 'chat', message: { seat: 0, name: 'Ana', text: 'x' } })
    }
    expect(new Set(state.feed.map((entry) => entry.id)).size).toBe(5)
  })

  it('caps the feed and keeps the newest entries when it trims', () => {
    let state = joined()
    for (let i = 0; i < FEED_LIMIT + 10; i += 1) {
      state = gameReducer(state, {
        type: 'chat',
        message: { seat: 0, name: 'Ana', text: String(i) },
      })
    }
    expect(state.feed).toHaveLength(FEED_LIMIT)
    const last = state.feed.at(-1)
    expect(last?.kind === 'chat' && last.text).toBe(String(FEED_LIMIT + 9))
  })

  it('records an error and clears it on the next view', () => {
    const failed = gameReducer(joined(), { type: 'error', message: 'nope' })
    expect(failed.error).toBe('nope')
    expect(gameReducer(failed, { type: 'view', view }).error).toBeNull()
  })

  it('marks the connection lost without discarding the last view', () => {
    const lost = gameReducer(onTable(), { type: 'connection', connection: 'lost' })
    expect(lost.connection).toBe('lost')
    expect(lost.view).toBe(view)
  })

  it('returns home and forgets the room when the player leaves, keeping the connection', () => {
    const open = gameReducer(onTable(), { type: 'connection', connection: 'open' })
    const left = gameReducer(open, { type: 'left' })
    expect(left.screen).toBe('home')
    expect(left.roomCode).toBeNull()
    expect(left.view).toBeNull()
    expect(left.connection).toBe('open')
  })

  it('raises a toast for a notable event and none for a routine one', () => {
    const quiet = gameReducer(onTable(), {
      type: 'event',
      event: { type: 'trickWon', seat: 1, points: 10 },
    })
    expect(quiet.toasts).toHaveLength(0)

    const loud = gameReducer(onTable(), { type: 'event', event: { type: 'seatLeft', seat: 1 } })
    expect(loud.toasts).toHaveLength(1)
    expect(loud.toasts[0]?.tone).toBe('bad')
  })

  it('names the seat in a toast from the roster, in the language it was handed', () => {
    const fr = gameReducer(onTable(), { type: 'event', event: { type: 'botTookOver', seat: 1 } })
    expect(fr.toasts[0]?.title).toBe('Un bot prend la place de Ben.')
    const en = gameReducer(
      onTable(),
      { type: 'event', event: { type: 'botTookOver', seat: 1 } },
      CATALOGUES.en,
    )
    expect(en.toasts[0]?.title).toBe('A bot takes Ben’s seat.')
    expect(SEATS[1]).toBeDefined()
  })

  it('dismisses a toast by id', () => {
    const raised = gameReducer(onTable(), { type: 'event', event: { type: 'seatLeft', seat: 1 } })
    const id = raised.toasts[0]?.id ?? -1
    expect(gameReducer(raised, { type: 'dismissToast', id }).toasts).toHaveLength(0)
  })

  it('caps the toasts so they cannot bury the table', () => {
    let state = onTable()
    for (let i = 0; i < 10; i += 1) {
      state = gameReducer(state, { type: 'event', event: { type: 'seatLeft', seat: 1 } })
    }
    expect(state.toasts.length).toBeLessThanOrEqual(4)
  })

  it('never mutates the state it is given', () => {
    const before = onTable()
    const snapshot = JSON.stringify(before)
    gameReducer(before, { type: 'event', event: { type: 'seatLeft', seat: 1 } })
    gameReducer(before, { type: 'chat', message: { seat: 0, name: 'Ana', text: 'x' } })
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})
