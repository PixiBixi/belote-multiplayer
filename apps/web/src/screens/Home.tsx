import { ROOM_CODE_LENGTH, MAX_NAME_LENGTH } from '@belote/protocol'
import { useState, type FormEvent } from 'react'
import { PlayingCard } from '../components/PlayingCard.js'
import { LOCALES, LOCALE_NAME, useLocale, useMessages, useSetLocale } from '../i18n/index.js'
import type { Card, CardId } from '@belote/engine'

const NAME_KEY = 'belote.pref.name'

function readName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveName(name: string): void {
  try {
    window.localStorage.setItem(NAME_KEY, name)
  } catch {
    /* The name will not be remembered. Play continues. */
  }
}

/* The hero hand: a belote, naturally. */
const HERO: Card[] = [
  { id: 'JH' as CardId, rank: 'J', suit: 'H' },
  { id: '9H' as CardId, rank: '9', suit: 'H' },
  { id: 'KH' as CardId, rank: 'K', suit: 'H' },
  { id: 'QH' as CardId, rank: 'Q', suit: 'H' },
  { id: 'AS' as CardId, rank: 'A', suit: 'S' },
]

type Props = {
  onCreate: (name: string, solo: boolean) => void
  onJoin: (code: string, name: string) => void
  error: string | null
  prefilledCode: string | null
}

export function Home({ onCreate, onJoin, error, prefilledCode }: Props) {
  const t = useMessages()
  const locale = useLocale()
  const setLocale = useSetLocale()
  const [name, setName] = useState(readName)
  const [code, setCode] = useState(prefilledCode ?? '')
  const trimmed = name.trim()

  const go = (fn: () => void) => {
    if (trimmed.length === 0) return
    saveName(trimmed)
    fn()
  }
  const submitJoin = (e: FormEvent) => {
    e.preventDefault()
    go(() => onJoin(code.trim().toUpperCase(), trimmed))
  }

  return (
    <main className="home">
      <div className="hero" aria-hidden="true">
        {HERO.map((card, i) => (
          <PlayingCard
            key={card.id}
            card={card}
            className="hero-card"
            style={{ ['--i' as string]: i }}
          />
        ))}
      </div>
      <h1 className="brand">{t.brand}</h1>
      <p className="tagline">{t.tagline}</p>

      {error && (
        <p className="banner banner-bad" role="alert">
          {error}
        </p>
      )}

      <div className="home-card">
        <label className="field">
          <span>{t.home.nameLabel}</span>
          <input
            value={name}
            maxLength={MAX_NAME_LENGTH}
            placeholder={t.home.namePlaceholder}
            autoComplete="nickname"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {prefilledCode === null && (
          <div className="home-actions">
            <button
              type="button"
              className="btn btn-primary btn-big"
              disabled={trimmed.length === 0}
              onClick={() => go(() => onCreate(trimmed, true))}
            >
              {t.home.solo}
              <small>{t.home.soloHint}</small>
            </button>
            <button
              type="button"
              className="btn btn-gold btn-big"
              disabled={trimmed.length === 0}
              onClick={() => go(() => onCreate(trimmed, false))}
            >
              {t.home.create}
              <small>{t.home.createHint}</small>
            </button>
          </div>
        )}

        <form className="join" onSubmit={submitJoin}>
          <span className="join-title">{t.home.joinTitle}</span>
          <div className="join-row">
            <input
              aria-label={t.home.codeLabel}
              placeholder={t.home.codeLabel}
              value={code}
              maxLength={ROOM_CODE_LENGTH}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="code-input"
            />
            <button
              type="submit"
              className="btn"
              disabled={trimmed.length === 0 || code.trim().length !== ROOM_CODE_LENGTH}
            >
              {t.home.join}
            </button>
          </div>
        </form>
      </div>

      <div className="locale-pick" role="group" aria-label={t.home.language}>
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            className={`chip ${l === locale ? 'is-on' : ''}`}
            aria-pressed={l === locale}
            onClick={() => setLocale(l)}
          >
            {LOCALE_NAME[l]}
          </button>
        ))}
      </div>
    </main>
  )
}
