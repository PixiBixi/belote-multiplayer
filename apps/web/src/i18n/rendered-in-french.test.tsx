import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { ChatPanel } from '../components/ChatPanel.js'
import { PlayingCard } from '../components/PlayingCard.js'
import { Toaster } from '../components/Toaster.js'
import { Lobby } from '../screens/Lobby.js'
import { Table } from '../screens/Table.js'
import { lobbyView, playingGame, viewOf } from '../test-fixtures.js'
import { LocaleProvider } from './LocaleProvider.js'

/**
 * The other half of `no-english.test.ts`: that one reads source, this one renders in
 * French and proves what a French player actually receives is French, accessible names
 * included. A string can be absent from a component and still arrive in English from a
 * lookup two modules away.
 */

/** Through the real provider and the real preference, the way a French browser does it. */
const inFrench = (node: ReactElement) => {
  window.localStorage.setItem('belote.pref.locale', 'fr')
  const result = render(<LocaleProvider>{node}</LocaleProvider>)
  window.localStorage.clear()
  return result
}

describe('a card, in French', () => {
  it('announces itself in French', () => {
    inFrench(<PlayingCard card={{ id: 'JH' as never, rank: 'J', suit: 'H' }} />)
    expect(screen.getByRole('img', { name: 'Valet de cœur' })).toBeTruthy()
  })
})

describe('the lobby, in French', () => {
  it('speaks French on its headings and controls', () => {
    inFrench(
      <Lobby
        lobby={lobbyView()}
        mySeat={0}
        onStart={vi.fn()}
        onLeave={vi.fn()}
        onConfigure={vi.fn()}
        onSetSeat={vi.fn()}
        onMoveSeat={vi.fn()}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Règles de la table' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Quitter' })).toBeTruthy()
  })
})

describe('the table, in French', () => {
  it('names its toolbar in French', () => {
    inFrench(
      <Table
        view={viewOf(playingGame())}
        lobby={null}
        onPlay={vi.fn()}
        onNextHand={vi.fn()}
        onRestart={vi.fn()}
        onLeave={vi.fn()}
        side={null}
      />,
    )
    expect(screen.getByRole('button', { name: 'Feuille de score' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Quitter la table' })).toBeTruthy()
  })
})

describe('the side panels, in French', () => {
  it('writes game events through the catalogue', () => {
    inFrench(
      <ChatPanel
        feed={[{ id: 1, kind: 'event', event: { type: 'gameRestarted' } }]}
        mySeat={0}
        nameOf={() => 'Ana'}
        onSend={vi.fn()}
      />,
    )
    expect(screen.getByText('Nouvelle partie !')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeTruthy()
  })

  it('names a toast’s close button in French', () => {
    inFrench(
      <Toaster
        toasts={[{ id: 1, tone: 'info', title: 'Bonjour', detail: '' }]}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Fermer : Bonjour' })).toBeTruthy()
  })
})
