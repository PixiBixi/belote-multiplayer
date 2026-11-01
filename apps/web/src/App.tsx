import { ChatPanel } from './components/ChatPanel.js'
import { Toaster } from './components/Toaster.js'
import { VoicePanel } from './components/VoicePanel.js'
import { useGameSocket } from './hooks/useGameSocket.js'
import { useTableSounds } from './hooks/useTableSounds.js'
import { useVoice } from './hooks/useVoice.js'
import { useMessages } from './i18n/index.js'
import { readRoomCodeFromUrl } from './lib/room-url.js'
import { seatName } from './lib/seats.js'
import { Home } from './screens/Home.js'
import { Lobby } from './screens/Lobby.js'
import { Table } from './screens/Table.js'

/** The screen is a function of what the server pushed; no client-side navigation state. */
export function App() {
  const { state, actions, socketRef } = useGameSocket()
  const voice = useVoice({ socketRef, selfSeat: state.seat ?? 0 })
  const t = useMessages()

  /* Called unconditionally, before any early return: sound follows the feed, and the
     engine must outlive the switch between lobby and table. */
  useTableSounds({
    feed: state.feed,
    mySeat: state.seat ?? 0,
    isMyTurn:
      state.view !== null &&
      state.view.hand.currentSeat === state.view.you.seat &&
      state.view.you.legalMoves.length > 0,
  })

  if (state.connection === 'lost') {
    return (
      <main className="home">
        <h1 className="brand">{t.brand}</h1>
        <p className="banner banner-bad" role="alert">
          {t.connection.lost}
        </p>
      </main>
    )
  }

  if (state.screen === 'table' && state.view !== null) {
    const view = state.view
    const nameOf = (seat: number) => seatName(view.seats, seat)
    const seatNames = view.seats.map((s) => nameOf(s.seat))
    return (
      <>
        <Table
          view={view}
          lobby={state.lobby}
          onPlay={actions.playMove}
          onNextHand={actions.nextHand}
          onRestart={actions.restartGame}
          onLeave={actions.leave}
          side={
            <>
              <VoicePanel voice={voice} seatNames={seatNames} selfSeat={view.you.seat} />
              <ChatPanel
                feed={state.feed}
                mySeat={view.you.seat}
                nameOf={nameOf}
                onSend={actions.sendChat}
              />
            </>
          }
        />
        <Toaster toasts={state.toasts} onDismiss={actions.dismissToast} />
      </>
    )
  }

  if (state.screen === 'lobby' && state.lobby !== null && state.seat !== null) {
    return (
      <>
        <Lobby
          lobby={state.lobby}
          mySeat={state.seat}
          onStart={actions.startGame}
          onLeave={actions.leave}
          onConfigure={actions.configureRoom}
          onSetSeat={actions.setSeat}
          onMoveSeat={actions.moveSeat}
        />
        <Toaster toasts={state.toasts} onDismiss={actions.dismissToast} />
      </>
    )
  }

  return (
    <Home
      onCreate={actions.createRoom}
      onJoin={actions.joinRoom}
      error={state.error}
      prefilledCode={readRoomCodeFromUrl()}
    />
  )
}
