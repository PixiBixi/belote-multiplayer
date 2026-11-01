import type { SeatOccupant } from '@belote/protocol'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SEATS, lobbyView } from '../test-fixtures.js'
import { Lobby } from './Lobby.js'

const setup = (overrides: Partial<Parameters<typeof Lobby>[0]> = {}, lobby = lobbyView()) => {
  const props = {
    lobby,
    mySeat: 0,
    onStart: vi.fn(),
    onLeave: vi.fn(),
    onConfigure: vi.fn(),
    onSetSeat: vi.fn<(seat: number, occupant: SeatOccupant) => void>(),
    onMoveSeat: vi.fn(),
    ...overrides,
  }
  render(<Lobby {...props} />)
  return props
}

const switchFor = (label: string) =>
  within(screen.getByText(label).closest('label') as HTMLElement).getByRole('switch')

describe('Lobby', () => {
  it('shows the table code and four seats', () => {
    setup()
    expect(screen.getByText('Table ABC234')).toBeTruthy()
    expect(screen.getAllByText('Place libre')).toHaveLength(2)
    expect(screen.getByText('Ben')).toBeTruthy()
  })

  it('lets the host toggle a rule, sending the full merged rules', async () => {
    const lobby = lobbyView()
    const { onConfigure } = setup({}, lobby)
    await userEvent.click(switchFor('Vache'))
    expect(onConfigure).toHaveBeenCalledTimes(1)
    expect(onConfigure).toHaveBeenCalledWith({
      rules: { ...lobby.rules, vache: !lobby.rules.vache },
    })
  })

  it('switches the variant and the target through the same merge', async () => {
    const lobby = lobbyView()
    const { onConfigure } = setup({}, lobby)
    await userEvent.click(screen.getByRole('radio', { name: /coinche/i }))
    expect(onConfigure).toHaveBeenLastCalledWith({ rules: { ...lobby.rules, variant: 'coinche' } })
    await userEvent.click(screen.getByRole('button', { name: '1500' }))
    expect(onConfigure).toHaveBeenLastCalledWith({ rules: { ...lobby.rules, target: 1500 } })
  })

  it('sets or removes the clock with an explicit pace, null for none', async () => {
    const { onConfigure } = setup({}, lobbyView({ pace: { turnSeconds: 30 } }))
    await userEvent.click(screen.getByRole('button', { name: 'Libre' }))
    expect(onConfigure).toHaveBeenLastCalledWith({ pace: null })
    await userEvent.click(screen.getByRole('button', { name: '60 s' }))
    expect(onConfigure).toHaveBeenLastCalledWith({ pace: { turnSeconds: 60 } })
  })

  it('adds a bot to an empty seat', async () => {
    const { onSetSeat } = setup()
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Ajouter un bot' })[0] as HTMLElement,
    )
    expect(onSetSeat).toHaveBeenCalledWith(2, { kind: 'bot', level: 'normal' })
  })

  it('fills every empty seat with bots', async () => {
    const { onSetSeat } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Compléter avec des bots' }))
    expect(onSetSeat).toHaveBeenCalledTimes(2)
    expect(onSetSeat).toHaveBeenNthCalledWith(1, 2, { kind: 'bot', level: 'normal' })
    expect(onSetSeat).toHaveBeenNthCalledWith(2, 3, { kind: 'bot', level: 'normal' })
  })

  it('changes a bot level and removes a bot', async () => {
    const lobby = lobbyView({
      seats: [
        SEATS[0]!,
        SEATS[1]!,
        { seat: 2, kind: 'bot', name: 'Bot 3', level: 'normal', standingInFor: null },
        { seat: 3, kind: 'empty' },
      ],
    })
    const { onSetSeat } = setup({}, lobby)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Bot 3' }), 'hard')
    expect(onSetSeat).toHaveBeenLastCalledWith(2, { kind: 'bot', level: 'hard' })
    await userEvent.click(screen.getByRole('button', { name: 'Retirer' }))
    expect(onSetSeat).toHaveBeenLastCalledWith(2, { kind: 'empty' })
  })

  it('moves a human to an empty seat to pick a partner', async () => {
    const { onMoveSeat } = setup()
    await userEvent.click(
      screen.getAllByRole('button', { name: 'S’asseoir ici' })[0] as HTMLElement,
    )
    expect(onMoveSeat).toHaveBeenCalledWith(2)
  })

  it('starts only when the server says every seat is filled', () => {
    const waiting = setup()
    expect(
      screen.getByRole('button', { name: /en attente des joueurs/i }).hasAttribute('disabled'),
    ).toBe(true)
    expect(waiting.onStart).not.toHaveBeenCalled()
  })

  it('lets the host start once the table can', async () => {
    const { onStart } = setup({}, lobbyView({ canStart: true }))
    await userEvent.click(screen.getByRole('button', { name: 'Lancer la partie' }))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('gives a guest disabled controls and no bot buttons, and names who starts', () => {
    setup({ mySeat: 1 })
    const rules = screen.getByRole('region', { name: 'Règles de la table' })
    expect(rules.querySelector('fieldset')?.disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Ajouter un bot' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Compléter avec des bots' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Lancer la partie' })).toBeNull()
    expect(screen.getByText('Ana va lancer la partie.')).toBeTruthy()
  })

  it('freezes the rules once the game has started', () => {
    setup({}, lobbyView({ configurable: false }))
    const rules = screen.getByRole('region', { name: 'Règles de la table' })
    expect(rules.querySelector('fieldset')?.disabled).toBe(true)
  })

  it('can leave', async () => {
    const { onLeave } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Quitter' }))
    expect(onLeave).toHaveBeenCalledTimes(1)
  })
})
