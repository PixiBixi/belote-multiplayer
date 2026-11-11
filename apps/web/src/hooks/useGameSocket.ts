import type {
  ClientToServer,
  ErrorCode,
  SeatOccupant,
  ServerToClient,
  TableConfiguration,
} from '@belote/protocol'
import { DEFAULT_TABLE_RULES, type BotLevel, type Move } from '@belote/engine'
import { useCallback, useEffect, useReducer, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import { readRoomCodeFromUrl, writeRoomCodeToUrl } from '../lib/room-url.js'
import { clearSession, readSession, writeSession } from '../lib/session.js'
import { useMessages } from '../i18n/index.js'
import { gameReducer, initialState, type Action, type ClientState } from './game-reducer.js'

type TypedSocket = Socket<ServerToClient, ClientToServer>

/* socket.io drops a plain ack when the socket disconnects and never calls it; one sent
   with timeout() is called with an error instead, which frees the create and join guards. */
const ACK_TIMEOUT_MS = 10_000

export function useGameSocket() {
  const messages = useMessages()

  /* The catalogue reaches the reducer as an argument rather than through a context
     the reducer cannot see. Rebuilding this closure when the language changes is
     the point: the next toast is written in the language chosen a moment ago. */
  const reduce = useCallback(
    (state: ClientState, action: Action): ClientState => gameReducer(state, action, messages),
    [messages],
  )
  const [state, dispatch] = useReducer(reduce, initialState)
  /* One socket for the app's lifetime, in a ref - never a module-level variable,
     which would leak between mounts and across two tabs of the same bundle. */
  const socketRef = useRef<TypedSocket | null>(null)

  useEffect(() => {
    const socket: TypedSocket = io({ transports: ['websocket', 'polling'] })
    socketRef.current = socket

    const onConnect = () => {
      dispatch({ type: 'connection', connection: 'open' })
      // A code in the URL plus a stored token means this is a return, not a first
      // visit: reclaim the seat before anything else.
      const code = readRoomCodeFromUrl()
      const token = code === null ? null : readSession(code)
      if (code === null || token === null) return
      socket.emit('room:rejoin', { roomCode: code, sessionToken: token }, (result) => {
        if (result.ok) {
          dispatch({ type: 'joined', roomCode: code, seat: result.seat })
          return
        }
        clearSession(code)
        // A restart lost the room: back to the home screen rather than a frozen table.
        dispatch({ type: 'left' })
        dispatch({ type: 'error', message: messagesRef.current.error[result.error] })
      })
    }
    const onDisconnect = () => dispatch({ type: 'connection', connection: 'lost' })
    const onLobby: ServerToClient['room:state'] = (lobby) => dispatch({ type: 'lobby', lobby })
    const onView: ServerToClient['game:view'] = (view) => dispatch({ type: 'view', view })
    const onEvent: ServerToClient['game:event'] = (event) => dispatch({ type: 'event', event })
    const onChat: ServerToClient['chat:message'] = (message) => dispatch({ type: 'chat', message })
    const onError: ServerToClient['error'] = ({ code }) =>
      dispatch({ type: 'error', message: messagesRef.current.error[code] })

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('room:state', onLobby)
    socket.on('game:view', onView)
    socket.on('game:event', onEvent)
    socket.on('chat:message', onChat)
    socket.on('error', onError)

    return () => {
      /* Named removals, then a real disconnect. `socket.off()` with no argument
         would also strip socket.io's own internal listeners. */
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('room:state', onLobby)
      socket.off('game:view', onView)
      socket.off('game:event', onEvent)
      socket.off('chat:message', onChat)
      socket.off('error', onError)
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  /* Read through a ref rather than closed over, so switching language does not
     rebuild every action callback and re-register the socket listeners. */
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const fail = useCallback((code: ErrorCode) => {
    dispatch({ type: 'error', message: messagesRef.current.error[code] })
  }, [])

  /* Every emit whose ack does nothing on success and dispatches `fail` on a
     refusal goes through here, so that pattern lives once instead of in every
     action below. `createRoom` and `joinRoom` keep their own emit: their ack
     also has to clear an in-flight guard. */
  const emitOrFail = useCallback(
    <Ev extends keyof ClientToServer>(event: Ev, payload: Parameters<ClientToServer[Ev]>[0]) => {
      const ack = (result: { ok: true } | { ok: false; error: ErrorCode }) => {
        if (!result.ok) fail(result.error)
      }
      const args = [payload, ack] as Parameters<ClientToServer[Ev]>
      socketRef.current?.emit(event, ...args)
    },
    [fail],
  )

  /*
   * One create at a time, guarded here rather than in the button: a double tap on a
   * phone would otherwise open two tables. The flag clears on every acknowledgement.
   */
  const creating = useRef(false)

  /**
   * Creates a table on the default rules. `solo` also seats three bots but stays in
   * the lobby, so the rules can be set before the host starts.
   */
  const createRoom = useCallback(
    (playerName: string, solo = false, level: BotLevel = 'normal') => {
      const socket = socketRef.current
      if (creating.current || socket === null) return
      creating.current = true
      socket
        .timeout(ACK_TIMEOUT_MS)
        .emit(
          'room:create',
          { playerName, pace: null, rules: DEFAULT_TABLE_RULES },
          (error, result) => {
            creating.current = false
            // Dropped or unanswered: the connection banner already says so, the button is free.
            if (error) return
            if (!result.ok) {
              fail(result.error)
              return
            }
            writeSession(result.roomCode, result.sessionToken)
            writeRoomCodeToUrl(result.roomCode)
            dispatch({ type: 'joined', roomCode: result.roomCode, seat: result.seat })
            if (!solo) return
            for (const seat of [1, 2, 3]) {
              socket.emit(
                'room:setSeat',
                { seat, occupant: { kind: 'bot', level } },
                () => undefined,
              )
            }
          },
        )
    },
    [fail],
  )

  const setSeat = useCallback(
    (seat: number, occupant: SeatOccupant) => {
      emitOrFail('room:setSeat', { seat, occupant })
    },
    [emitOrFail],
  )

  const moveSeat = useCallback(
    (seat: number) => {
      socketRef.current?.emit('room:moveSeat', { seat }, (result) => {
        if (!result.ok) fail(result.error)
        else dispatch({ type: 'seat', seat: result.seat })
      })
    },
    [fail],
  )

  /**
   * The host changing the table from the lobby.
   *
   * Nothing is dispatched on success. The server answers by broadcasting `room:state` to
   * every member - which is the only way a guest sees the change at all - so writing the
   * new value into local state here would be a second source of truth for something the
   * server is still free to refuse.
   */
  const configureRoom = useCallback(
    (changes: TableConfiguration) => {
      emitOrFail('room:configure', changes)
    },
    [emitOrFail],
  )

  // Same guard as `creating`, for the same double tap.
  const joining = useRef(false)

  const joinRoom = useCallback(
    (roomCode: string, playerName: string) => {
      const socket = socketRef.current
      if (joining.current || socket === null) return
      joining.current = true
      socket
        .timeout(ACK_TIMEOUT_MS)
        .emit('room:join', { roomCode, playerName }, (error, result) => {
          joining.current = false
          if (error) return
          if (!result.ok) {
            fail(result.error)
            return
          }
          writeSession(roomCode, result.sessionToken)
          writeRoomCodeToUrl(roomCode)
          dispatch({ type: 'joined', roomCode, seat: result.seat })
        })
    },
    [fail],
  )

  const startGame = useCallback(() => {
    emitOrFail('game:start', {})
  }, [emitOrFail])

  const nextHand = useCallback(() => {
    emitOrFail('game:nextHand', {})
  }, [emitOrFail])

  const restartGame = useCallback(() => {
    emitOrFail('game:restart', {})
  }, [emitOrFail])

  const playMove = useCallback(
    (move: Move) => {
      emitOrFail('game:move', { move })
    },
    [emitOrFail],
  )

  const sendChat = useCallback(
    (text: string) => {
      emitOrFail('chat:send', { text })
    },
    [emitOrFail],
  )

  const roomCode = state.roomCode
  const leave = useCallback(() => {
    // Told to the server first: without this the seat keeps a dead socket id and
    // the room can never be reclaimed.
    socketRef.current?.emit('room:leave', {}, () => undefined)
    if (roomCode !== null) clearSession(roomCode)
    dispatch({ type: 'left' })
  }, [roomCode])

  const dismissToast = useCallback((id: number) => {
    dispatch({ type: 'dismissToast', id })
  }, [])

  return {
    state,
    /* Handed out so voice can ride the same socket: the server resolves a voice
       member through this socket's presence. A ref, because it is created inside
       an effect and is null on the first render. */
    socketRef,
    actions: {
      createRoom,
      configureRoom,
      setSeat,
      moveSeat,
      joinRoom,
      startGame,
      nextHand,
      restartGame,
      playMove,
      sendChat,
      leave,
      dismissToast,
    },
  }
}
