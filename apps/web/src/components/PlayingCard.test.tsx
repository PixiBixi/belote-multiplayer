import type { Card, CardId } from '@belote/engine'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CardBack, PlayingCard } from './PlayingCard.js'

const jackOfHearts: Card = { id: 'JH' as CardId, rank: 'J', suit: 'H' }

describe('PlayingCard', () => {
  it('is an image named in words when it is not clickable', () => {
    render(<PlayingCard card={jackOfHearts} />)
    expect(screen.getByRole('img', { name: 'Valet de cœur' })).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows the short rank of the language', () => {
    const { container } = render(<PlayingCard card={jackOfHearts} />)
    expect(container.querySelector('.pcard-rank')?.textContent).toBe('V')
  })

  it('is a button that reports the click', async () => {
    const onClick = vi.fn()
    render(<PlayingCard card={jackOfHearts} onClick={onClick} />)
    await userEvent.click(screen.getByRole('button', { name: 'Valet de cœur' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not report a click when disabled', async () => {
    const onClick = vi.fn()
    render(<PlayingCard card={jackOfHearts} onClick={onClick} disabled />)
    await userEvent.click(screen.getByRole('button', { name: 'Valet de cœur' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('marks red suits, trump and playable cards for the stylesheet', () => {
    const { container } = render(<PlayingCard card={jackOfHearts} trump playable />)
    const card = container.querySelector('.pcard')
    expect(card?.classList.contains('red')).toBe(true)
    expect(card?.classList.contains('is-trump')).toBe(true)
    expect(card?.classList.contains('is-playable')).toBe(true)
  })

  it('draws a black suit in black', () => {
    const { container } = render(
      <PlayingCard card={{ id: 'AS' as CardId, rank: 'A', suit: 'S' }} />,
    )
    expect(container.querySelector('.pcard')?.classList.contains('black')).toBe(true)
  })

  it('hides the back of a card from assistive technology', () => {
    const { container } = render(<CardBack />)
    expect(container.querySelector('.pcard.back')?.getAttribute('aria-hidden')).toBe('true')
  })
})
