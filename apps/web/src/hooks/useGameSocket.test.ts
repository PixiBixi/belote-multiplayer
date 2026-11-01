import { DEFAULT_TABLE_RULES } from '@belote/engine'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * The one guard in this hook worth a test of its own: a second Create while the first is
 * unanswered must not open a second table.
 *
 * A double tap is easy to do - the acknowledgement is a round trip away, 300 ms on a
 * phone - and it used to cost the server a room it then held for the life of the process,
 * because the socket abandoned the first table without releasing its seat. The server no
 * longer leaks that room, so this is about not asking for it at all.
 *
 * The socket is a stub because the claim is about how many times the client emits, and
 * nothing else here needs a server. The ack is held rather than answered so the in-flight
 * window can be inspected, which is the whole point: an implementation that cleared the
 * flag synchronously would pass a test that answered immediately.
 */

type Ack = (result: { ok: boolean; error?: string; [key: string]: unknown }) => void

const emitted: { event: string; payload: unknown; ack: Ack }[] = []

const socket = {
  emit: (event: string, payload: unknown, ack: Ack) => {
    emitted.push({ event, payload, ack })
  },
  on: () => socket,
  off: () => socket,
  disconnect: () => socket,
  connected: true,
  id: 'stub',
}

vi.mock('socket.io-client', () => ({ io: () => socket }))

// Imported after the mock so the hook picks up the stub.
const { useGameSocket } = await import('./useGameSocket.js')

const creates = () => emitted.filter((entry) => entry.event === 'room:create')

beforeEach(() => {
  emitted.length = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('createRoom', () => {
  it('emits once when the button is tapped twice before the server answers', () => {
    const { result } = renderHook(() => useGameSocket())

    act(() => {
      result.current.actions.createRoom('Ana')
      result.current.actions.createRoom('Ana')
    })

    expect(creates()).toHaveLength(1)
  })

  it('allows another attempt once the server has refused the first', () => {
    const { result } = renderHook(() => useGameSocket())

    act(() => {
      result.current.actions.createRoom('Ana')
    })
    // A refusal has to clear the flag as surely as a success does, or one rate-limited
    // create locks the button for the rest of the session with no way back.
    act(() => {
      creates()[0]?.ack({ ok: false, error: 'rate_limited' })
    })
    act(() => {
      result.current.actions.createRoom('Ana')
    })

    expect(creates()).toHaveLength(2)
  })
})

describe('joinRoom', () => {
  const joins = () => emitted.filter((entry) => entry.event === 'room:join')

  it('emits once when the button is tapped twice before the server answers', () => {
    const { result } = renderHook(() => useGameSocket())

    act(() => {
      result.current.actions.joinRoom('ABC234', 'Ben')
      result.current.actions.joinRoom('ABC234', 'Ben')
    })

    expect(joins()).toHaveLength(1)
  })

  it('allows another attempt once the server has refused the first', () => {
    const { result } = renderHook(() => useGameSocket())

    act(() => {
      result.current.actions.joinRoom('ABC234', 'Ben')
    })
    act(() => {
      joins()[0]?.ack({ ok: false, error: 'room_full' })
    })
    act(() => {
      result.current.actions.joinRoom('ABC234', 'Ben')
    })

    expect(joins()).toHaveLength(2)
  })
})

describe('the actions and what goes on the wire', () => {
  const only = (event: string) => emitted.filter((entry) => entry.event === event)

  it('creates a table on the default rules with no clock', () => {
    const { result } = renderHook(() => useGameSocket())
    act(() => {
      result.current.actions.createRoom('Ana')
    })
    expect(only('room:create')[0]?.payload).toEqual({
      playerName: 'Ana',
      pace: null,
      rules: DEFAULT_TABLE_RULES,
    })
  })

  it('seats three bots for a solo game and leaves the start to the lobby', () => {
    const { result } = renderHook(() => useGameSocket())
    act(() => {
      result.current.actions.createRoom('Ana', true, 'hard')
    })
    // Nothing else is sent until the server has accepted the table.
    expect(emitted.map((entry) => entry.event)).toEqual(['room:create'])

    act(() => {
      only('room:create')[0]?.ack({ ok: true, roomCode: 'ABC234', sessionToken: 'tok', seat: 0 })
    })
    expect(emitted.slice(1).map((entry) => entry.event)).toEqual([
      'room:setSeat',
      'room:setSeat',
      'room:setSeat',
    ])
    expect(only('room:setSeat').map((entry) => entry.payload)).toEqual([
      { seat: 1, occupant: { kind: 'bot', level: 'hard' } },
      { seat: 2, occupant: { kind: 'bot', level: 'hard' } },
      { seat: 3, occupant: { kind: 'bot', level: 'hard' } },
    ])
    expect(result.current.state.screen).toBe('lobby')
  })

  it('adds nothing after the create for a table with friends', () => {
    const { result } = renderHook(() => useGameSocket())
    act(() => {
      result.current.actions.createRoom('Ana', false)
    })
    act(() => {
      only('room:create')[0]?.ack({ ok: true, roomCode: 'ABC234', sessionToken: 'tok', seat: 0 })
    })
    expect(emitted.map((entry) => entry.event)).toEqual(['room:create'])
  })

  it('puts a bot or an empty seat where the host asked', () => {
    const { result } = renderHook(() => useGameSocket())
    act(() => {
      result.current.actions.setSeat(2, { kind: 'bot', level: 'easy' })
      result.current.actions.setSeat(2, { kind: 'empty' })
    })
    expect(only('room:setSeat').map((entry) => entry.payload)).toEqual([
      { seat: 2, occupant: { kind: 'bot', level: 'easy' } },
      { seat: 2, occupant: { kind: 'empty' } },
    ])
  })

  it('follows the seat the server moved us to, and only on success', () => {
    const { result } = renderHook(() => useGameSocket())
    act(() => {
      result.current.actions.moveSeat(2)
    })
    expect(only('room:moveSeat')[0]?.payload).toEqual({ seat: 2 })

    act(() => {
      only('room:moveSeat')[0]?.ack({ ok: false, error: 'seat_taken' })
    })
    expect(result.current.state.seat).toBeNull()
    expect(result.current.state.error).toBe('Cette place est prise.')

    act(() => {
      result.current.actions.moveSeat(3)
    })
    act(() => {
      only('room:moveSeat')[1]?.ack({ ok: true, seat: 3 })
    })
    expect(result.current.state.seat).toBe(3)
  })

  it('asks for the next hand and a restart with empty payloads', () => {
    const { result } = renderHook(() => useGameSocket())
    act(() => {
      result.current.actions.nextHand()
      result.current.actions.restartGame()
      result.current.actions.startGame()
    })
    expect(only('game:nextHand')[0]?.payload).toEqual({})
    expect(only('game:restart')[0]?.payload).toEqual({})
    expect(only('game:start')[0]?.payload).toEqual({})
  })

  it('sends a move wrapped as the protocol says, and surfaces a refusal in French', () => {
    const { result } = renderHook(() => useGameSocket())
    act(() => {
      result.current.actions.playMove({ type: 'play', cardId: 'JH' as never })
    })
    expect(only('game:move')[0]?.payload).toEqual({ move: { type: 'play', cardId: 'JH' } })
    act(() => {
      only('game:move')[0]?.ack({ ok: false, error: 'illegal_move' })
    })
    expect(result.current.state.error).toBe('Coup impossible.')
  })

  it('passes configuration changes through untouched', () => {
    const { result } = renderHook(() => useGameSocket())
    act(() => {
      result.current.actions.configureRoom({
        pace: null,
        rules: { ...DEFAULT_TABLE_RULES, vache: false },
      })
    })
    expect(only('room:configure')[0]?.payload).toEqual({
      pace: null,
      rules: { ...DEFAULT_TABLE_RULES, vache: false },
    })
  })
})
