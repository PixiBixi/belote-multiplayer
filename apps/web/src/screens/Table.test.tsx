import type { Move } from '@belote/engine'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fr } from '../i18n/fr.js'
import {
  constrainedGame,
  doneGame,
  freshGame,
  lobbyView,
  playingGame,
  viewOf,
} from '../test-fixtures.js'
import { Table } from './Table.js'

const setup = (
  view: ReturnType<typeof viewOf>,
  overrides: Partial<Parameters<typeof Table>[0]> = {},
) => {
  const props = {
    view,
    lobby: null,
    onPlay: vi.fn<(move: Move) => void>(),
    onNextHand: vi.fn(),
    onRestart: vi.fn(),
    onLeave: vi.fn(),
    side: <p>side panel</p>,
    ...overrides,
  }
  const result = render(<Table {...props} />)
  return { ...props, ...result }
}

describe('Table', () => {
  it('renders the four seats, with the viewer at the bottom', () => {
    const view = viewOf(playingGame(), 0)
    const { container } = setup(view)
    expect(container.querySelectorAll('.seat')).toHaveLength(4)
    for (const name of ['Ana', 'Ben', 'Cy', 'Di'])
      expect(screen.getAllByText(name).length).toBeGreaterThan(0)
    expect(container.querySelector('.seat-bottom')?.textContent).toContain('Ana')
    expect(container.querySelector('.seat-bottom')?.classList.contains('team-us')).toBe(true)
    expect(container.querySelector('.seat-right')?.classList.contains('team-them')).toBe(true)
  })

  it('shows the viewer’s whole hand and only a count of the others', () => {
    const state = playingGame()
    const view = viewOf(state, 1)
    const { container } = setup(view)
    expect(container.querySelectorAll('.hand-fan .pcard')).toHaveLength(view.you.hand.length)
    expect(container.querySelectorAll('.opp-hand .pcard.mini')).toHaveLength(
      view.hand.handCounts.reduce((sum, n, seat) => (seat === 1 ? sum : sum + n), 0),
    )
  })

  it('enables exactly the cards whose id is in legalMoves, and plays the one clicked', async () => {
    const state = constrainedGame()
    const view = viewOf(state)
    const legal = new Set(view.you.legalMoves.flatMap((m) => (m.type === 'play' ? [m.cardId] : [])))
    expect(legal.size).toBeGreaterThan(0)
    expect(legal.size).toBeLessThan(view.you.hand.length)

    const { onPlay } = setup(view)
    for (const card of view.you.hand) {
      const button = screen.getByRole('button', { name: fr.card(card.rank, card.suit) })
      expect(button.hasAttribute('disabled'), card.id).toBe(!legal.has(card.id))
    }

    const first = view.you.hand.find((c) => legal.has(c.id))!
    await userEvent.click(screen.getByRole('button', { name: fr.card(first.rank, first.suit) }))
    expect(onPlay).toHaveBeenCalledWith({ type: 'play', cardId: first.id })
  })

  it('offers no clickable card to a seat that is not on turn', () => {
    const state = playingGame()
    const view = viewOf(state, (state.hand.currentSeat + 1) % 4)
    const { container } = setup(view)
    expect(container.querySelectorAll('.hand-fan button')).toHaveLength(0)
  })

  it('shows the bidding panel with only the offered moves', async () => {
    const state = freshGame()
    const view = viewOf(state)
    const { onPlay, container } = setup(view)
    const panel = container.querySelector('.bid-panel') as HTMLElement
    expect(panel).not.toBeNull()
    expect(within(panel).getAllByRole('button')).toHaveLength(view.you.legalMoves.length)

    const take = view.you.legalMoves.find((m) => m.type === 'take')!
    await userEvent.click(within(panel).getByRole('button', { name: fr.table.take(take.trump) }))
    expect(onPlay).toHaveBeenCalledWith(take)
    await userEvent.click(within(panel).getByRole('button', { name: fr.table.pass }))
    expect(onPlay).toHaveBeenLastCalledWith({ type: 'pass' })
  })

  it('shows no bidding panel when it is not our turn to bid', () => {
    const state = freshGame()
    const { container } = setup(viewOf(state, (state.hand.currentSeat + 1) % 4))
    expect(container.querySelector('.bid-panel')).toBeNull()
  })

  it('does not offer coinche before anybody has bid', () => {
    const view = viewOf(freshGame({ variant: 'coinche' }))
    setup(view)
    expect(screen.queryByRole('button', { name: fr.table.coinche })).toBeNull()
    expect(screen.queryByRole('button', { name: fr.table.surcoinche })).toBeNull()
    expect(screen.getByRole('button', { name: fr.table.pass })).toBeTruthy()
  })

  it('shows the result panel once a hand is done, and asks for the next one', async () => {
    const state = doneGame()
    expect(state.hand.phase).toBe('done')
    const { onNextHand } = setup(viewOf(state, 0))
    await userEvent.click(screen.getByRole('button', { name: fr.result.next }))
    expect(onNextHand).toHaveBeenCalledTimes(1)
  })

  it('shows no result panel mid-hand', () => {
    setup(viewOf(playingGame(), 0))
    expect(screen.queryByRole('button', { name: fr.result.next })).toBeNull()
  })

  it('names who is thinking when it is not our turn', () => {
    const state = playingGame()
    const other = (state.hand.currentSeat + 1) % 4
    setup(viewOf(state, other))
    expect(screen.getByText(/réfléchit/)).toBeTruthy()
  })

  it('confirms before leaving', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { onLeave } = setup(viewOf(playingGame(), 0))
    await userEvent.click(screen.getByRole('button', { name: fr.table.leave }))
    expect(onLeave).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: fr.table.leave }))
    expect(onLeave).toHaveBeenCalledTimes(1)
    confirm.mockRestore()
  })

  it('keeps the side panel in the drawer, closed until asked', async () => {
    const { container } = setup(viewOf(playingGame(), 0), { lobby: lobbyView() })
    const drawer = container.querySelector('.side-drawer') as HTMLElement
    expect(drawer.classList.contains('open')).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: fr.table.chat }))
    expect(drawer.classList.contains('open')).toBe(true)
    expect(within(drawer).getByText('side panel')).toBeTruthy()
  })
})
