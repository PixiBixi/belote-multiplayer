import type { Card, Rank, Suit, Trump } from '@belote/engine'
import type { CSSProperties } from 'react'
import { useMessages } from '../i18n/index.js'

const SUIT_PATH: Record<Suit, string> = {
  H: 'M12 21.2s-7.6-4.7-9.7-9.5C.8 8 3 4 6.9 4c2.2 0 3.7 1.2 5.1 3.2C13.4 5.2 14.9 4 17.1 4 21 4 23.2 8 21.7 11.7 19.6 16.5 12 21.2 12 21.2z',
  D: 'M12 1.6c2.5 3.7 5.1 7 8.2 10.4-3.1 3.4-5.7 6.7-8.2 10.4-2.5-3.7-5.1-7-8.2-10.4 3.1-3.4 5.7-6.7 8.2-10.4z',
  S: 'M12 1.8C9 6.4 2.8 9.6 2.8 14.3c0 2.8 2.2 4.8 4.8 4.8 1.6 0 2.9-.7 3.6-1.8-.2 1.9-1 3.4-2.6 4.9h6.8c-1.6-1.5-2.4-3-2.6-4.9.7 1.1 2 1.8 3.6 1.8 2.6 0 4.8-2 4.8-4.8C21.2 9.6 15 6.4 12 1.8z',
  C: 'M12 2.2a4.4 4.4 0 0 0-4.2 5.8 4.4 4.4 0 1 0 1.8 8.5c.7-.3 1.3-.7 1.7-1.2-.1 2.4-.9 4.5-2.7 6.5h6.8c-1.8-2-2.6-4.1-2.7-6.5.4.5 1 .9 1.7 1.2a4.4 4.4 0 1 0 1.8-8.5A4.4 4.4 0 0 0 12 2.2z',
}

export const isRed = (suit: Suit) => suit === 'H' || suit === 'D'

export function SuitIcon({ suit, className }: { suit: Suit; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`suit-icon suit-${suit} ${className ?? ''}`}
      aria-hidden="true"
    >
      <path d={SUIT_PATH[suit]} />
    </svg>
  )
}

/** A trump as a glyph: the suit, or a short tag for tout atout / sans atout. */
export function TrumpGlyph({ trump }: { trump: Trump }) {
  if (trump === 'AT' || trump === 'SA')
    return <span className={`trump-tag trump-${trump}`}>{trump}</span>
  return <SuitIcon suit={trump} />
}

/* Classic pip positions in percent of the face, top half upright, bottom half turned. */
const PIPS: Partial<Record<Rank, [number, number][]>> = {
  '7': [
    [28, 16],
    [72, 16],
    [50, 33],
    [28, 50],
    [72, 50],
    [28, 84],
    [72, 84],
  ],
  '8': [
    [28, 16],
    [72, 16],
    [50, 33],
    [28, 50],
    [72, 50],
    [50, 67],
    [28, 84],
    [72, 84],
  ],
  '9': [
    [28, 16],
    [72, 16],
    [28, 39],
    [72, 39],
    [50, 50],
    [28, 61],
    [72, 61],
    [28, 84],
    [72, 84],
  ],
  '10': [
    [28, 16],
    [72, 16],
    [50, 28],
    [28, 39],
    [72, 39],
    [28, 61],
    [72, 61],
    [50, 72],
    [28, 84],
    [72, 84],
  ],
}

const COURT_LETTER_CLASS: Partial<Record<Rank, string>> = {
  J: 'court-j',
  Q: 'court-q',
  K: 'court-k',
}

type Props = {
  card: Card
  /** Greys the card out when the rules forbid it this turn. */
  disabled?: boolean
  playable?: boolean
  trump?: boolean
  onClick?: (() => void) | undefined
  style?: CSSProperties
  className?: string
}

export function PlayingCard({ card, disabled, playable, trump, onClick, style, className }: Props) {
  const t = useMessages()
  const label = t.card(card.rank, card.suit)
  const classes = [
    'pcard',
    isRed(card.suit) ? 'red' : 'black',
    disabled ? 'is-disabled' : '',
    playable ? 'is-playable' : '',
    trump ? 'is-trump' : '',
    className ?? '',
  ].join(' ')
  const face = (
    <>
      <span className="pcard-index tl">
        <span className="pcard-rank">{t.rankShort[card.rank]}</span>
        <SuitIcon suit={card.suit} />
      </span>
      <span className="pcard-index br">
        <span className="pcard-rank">{t.rankShort[card.rank]}</span>
        <SuitIcon suit={card.suit} />
      </span>
      <CardFace card={card} letter={t.rankShort[card.rank]} />
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        style={style}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
      >
        {face}
      </button>
    )
  }
  return (
    <div className={classes} style={style} role="img" aria-label={label}>
      {face}
    </div>
  )
}

function CardFace({ card, letter }: { card: Card; letter: string }) {
  const pips = PIPS[card.rank]
  if (pips) {
    return (
      <span className="pcard-face pips">
        {pips.map(([x, y], i) => (
          <span
            key={i}
            className="pip"
            style={{ left: `${x}%`, top: `${y}%`, rotate: y > 52 ? '180deg' : '0deg' }}
          >
            <SuitIcon suit={card.suit} />
          </span>
        ))}
      </span>
    )
  }
  if (card.rank === 'A') {
    return (
      <span className="pcard-face ace">
        <SuitIcon suit={card.suit} />
      </span>
    )
  }
  return (
    <span className={`pcard-face court ${COURT_LETTER_CLASS[card.rank] ?? ''}`}>
      <span className="court-frame">
        <span className="court-letter">{letter}</span>
        <SuitIcon suit={card.suit} className="court-suit" />
        <span className="court-letter flipped">{letter}</span>
      </span>
    </span>
  )
}

export function CardBack({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={`pcard back ${className ?? ''}`} style={style} aria-hidden="true" />
}
