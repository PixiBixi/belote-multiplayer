import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../i18n/LocaleProvider.js'
import { Home } from './Home.js'

const setup = (overrides: Partial<Parameters<typeof Home>[0]> = {}) => {
  const props = {
    onCreate: vi.fn(),
    onJoin: vi.fn(),
    error: null,
    prefilledCode: null,
    ...overrides,
  }
  render(<Home {...props} />)
  return props
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('Home', () => {
  it('will not create or play solo without a name', async () => {
    const { onCreate } = setup()
    expect(screen.getByRole('button', { name: /créer une table/i }).hasAttribute('disabled')).toBe(
      true,
    )
    await userEvent.click(screen.getByRole('button', { name: /créer une table/i }))
    await userEvent.click(screen.getByRole('button', { name: /jouer contre l’ordinateur/i }))
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('creates a table with a trimmed name, not solo', async () => {
    const { onCreate } = setup()
    await userEvent.type(screen.getByLabelText(/ton prénom/i), '  Ana  ')
    await userEvent.click(screen.getByRole('button', { name: /créer une table/i }))
    expect(onCreate).toHaveBeenCalledWith('Ana', false)
  })

  it('starts a solo game against bots', async () => {
    const { onCreate } = setup()
    await userEvent.type(screen.getByLabelText(/ton prénom/i), 'Ana')
    await userEvent.click(screen.getByRole('button', { name: /jouer contre l’ordinateur/i }))
    expect(onCreate).toHaveBeenCalledWith('Ana', true)
  })

  it('remembers the name for next time', async () => {
    setup()
    await userEvent.type(screen.getByLabelText(/ton prénom/i), 'Ana')
    await userEvent.click(screen.getByRole('button', { name: /créer une table/i }))
    expect(window.localStorage.getItem('belote.pref.name')).toBe('Ana')
  })

  it('joins with an upper-cased code once it is the full length', async () => {
    const { onJoin } = setup()
    await userEvent.type(screen.getByLabelText(/ton prénom/i), 'Ben')
    const join = screen.getByRole('button', { name: /^rejoindre$/i })
    await userEvent.type(screen.getByLabelText(/code de la table/i), 'abc23')
    expect(join.hasAttribute('disabled')).toBe(true)
    await userEvent.type(screen.getByLabelText(/code de la table/i), '4')
    await userEvent.click(join)
    expect(onJoin).toHaveBeenCalledWith('ABC234', 'Ben')
  })

  it('offers only joining when arriving on an invite link', () => {
    setup({ prefilledCode: 'ABC234' })
    expect(screen.queryByRole('button', { name: /créer une table/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /jouer contre l’ordinateur/i })).toBeNull()
    expect(screen.getByLabelText<HTMLInputElement>(/code de la table/i).value).toBe('ABC234')
  })

  it('shows an error from the server', () => {
    setup({ error: 'La table est complète.' })
    expect(screen.getByRole('alert').textContent).toBe('La table est complète.')
  })

  it('switches language on request, and remembers it', async () => {
    render(
      <LocaleProvider>
        <Home onCreate={vi.fn()} onJoin={vi.fn()} error={null} prefilledCode={null} />
      </LocaleProvider>,
    )
    const english = screen.getByRole('button', { name: 'English' })
    await userEvent.click(english)
    expect(screen.getByLabelText('Your name')).toBeTruthy()
    expect(english.getAttribute('aria-pressed')).toBe('true')
    expect(window.localStorage.getItem('belote.pref.locale')).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })
})
