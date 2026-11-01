import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { FeedEntry } from '../hooks/game-reducer.js'
import { ChatPanel } from './ChatPanel.js'

const nameOf = (seat: number) => ['Ana', 'Ben'][seat] ?? `Seat ${seat}`

const feed: FeedEntry[] = [
  { id: 1, kind: 'event', event: { type: 'belote', seat: 1, call: 'belote' } },
  { id: 2, kind: 'chat', seat: 1, name: 'Ben', text: 'close one' },
  { id: 3, kind: 'chat', seat: 0, name: 'Ana', text: 'not really' },
]

const setup = (overrides: Partial<Parameters<typeof ChatPanel>[0]> = {}) => {
  const props = { feed, mySeat: 0, nameOf, onSend: vi.fn(), ...overrides }
  render(<ChatPanel {...props} />)
  return props
}

describe('ChatPanel', () => {
  it('interleaves chat and system lines in one stream', () => {
    setup()
    expect(screen.getByText(/Ben : Belote/)).toBeTruthy()
    expect(screen.getByText('close one')).toBeTruthy()
  })

  it('marks system lines so they never read as speech', () => {
    const { container } = render(
      <ChatPanel feed={feed} mySeat={0} nameOf={nameOf} onSend={vi.fn()} />,
    )
    expect(container.querySelectorAll('[data-system]')).toHaveLength(1)
  })

  it('attributes another player’s message', () => {
    setup()
    expect(screen.getByText('Ben')).toBeTruthy()
  })

  it('labels your own messages "Toi" rather than with your name', () => {
    setup()
    expect(screen.queryByText('Ana')).toBeNull()
    expect(screen.getByText('Toi')).toBeTruthy()
  })

  it('colours a line by team, relative to the viewer', () => {
    const { container } = render(
      <ChatPanel feed={feed} mySeat={0} nameOf={nameOf} onSend={vi.fn()} />,
    )
    // Seat 1 is an opponent of seat 0, and the belote event is about seat 1.
    expect(container.querySelector('.sys-line.team-them')).not.toBeNull()
    expect(container.querySelector('.msg-mine .team-us')).not.toBeNull()
  })

  it('skips an event the catalogue stays silent about', () => {
    const { container } = render(
      <ChatPanel
        feed={[
          {
            id: 1,
            kind: 'event',
            event: {
              type: 'cardPlayed',
              seat: 0,
              card: { id: 'JH' as never, rank: 'J', suit: 'H' },
            },
          },
        ]}
        mySeat={0}
        nameOf={nameOf}
        onSend={vi.fn()}
      />,
    )
    expect(container.querySelectorAll('[data-system]')).toHaveLength(0)
  })

  it('sends a trimmed message', async () => {
    const { onSend } = setup()
    await userEvent.type(screen.getByLabelText(/écrire à la table/i), '  hello  ')
    await userEvent.click(screen.getByRole('button', { name: /envoyer/i }))
    expect(onSend).toHaveBeenCalledWith('hello')
  })

  it('refuses to send an empty message', async () => {
    const { onSend } = setup()
    await userEvent.click(screen.getByRole('button', { name: /envoyer/i }))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('clears the field after sending', async () => {
    setup()
    const field = screen.getByLabelText<HTMLInputElement>(/écrire à la table/i)
    await userEvent.type(field, 'hi{Enter}')
    expect(field.value).toBe('')
  })

  it('collapses and reopens', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /replier/i }))
    expect(screen.queryByLabelText(/écrire à la table/i)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /^discussion$/i }))
    expect(screen.getByLabelText(/écrire à la table/i)).toBeTruthy()
  })

  it('counts only other people’s chat as unread while collapsed', async () => {
    const { rerender } = render(<ChatPanel feed={[]} mySeat={0} nameOf={nameOf} onSend={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /replier/i }))
    rerender(<ChatPanel feed={feed} mySeat={0} nameOf={nameOf} onSend={vi.fn()} />)
    // One line from Ben; the event and Ana's own line do not count.
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('does not steal focus when opened', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /replier/i }))
    await userEvent.click(screen.getByRole('button', { name: /^discussion$/i }))
    expect(document.activeElement).not.toBe(screen.getByLabelText(/écrire à la table/i))
  })
})
