import type { Move, Trump } from '@belote/engine'
import type { HandView } from '@belote/protocol'
import { useMemo, useState } from 'react'
import { useMessages } from '../i18n/index.js'
import { TrumpGlyph } from './PlayingCard.js'

type Props = {
  hand: HandView
  moves: Move[]
  variant: 'classic' | 'coinche'
  onMove: (move: Move) => void
}

/** Only renders what `legalMoves` offers: the client never decides what is allowed. */
export function BiddingPanel({ hand, moves, variant, onMove }: Props) {
  const t = useMessages()
  const canPass = moves.some((m) => m.type === 'pass')
  const coinche = moves.find((m) => m.type === 'coinche')
  const surcoinche = moves.find((m) => m.type === 'surcoinche')

  if (variant === 'classic') {
    const takes = moves.filter((m): m is Extract<Move, { type: 'take' }> => m.type === 'take')
    return (
      <div className="bid-panel" role="group" aria-label={t.table.chooseTrump}>
        <p className="bid-hint">{hand.biddingRound === 1 ? t.table.roundOne : t.table.roundTwo}</p>
        <div className="bid-row">
          {takes.map((m) => (
            <button
              key={m.trump}
              type="button"
              className={`btn bid-take trump-${m.trump}`}
              onClick={() => onMove(m)}
            >
              <TrumpGlyph trump={m.trump} />
              <span>{t.table.take(m.trump)}</span>
            </button>
          ))}
          {canPass && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onMove({ type: 'pass' })}
            >
              {t.table.pass}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <CoincheBids
      moves={moves}
      onMove={onMove}
      canPass={canPass}
      coinche={coinche !== undefined}
      surcoinche={surcoinche !== undefined}
    />
  )
}

function CoincheBids({
  moves,
  onMove,
  canPass,
  coinche,
  surcoinche,
}: {
  moves: Move[]
  onMove: (move: Move) => void
  canPass: boolean
  coinche: boolean
  surcoinche: boolean
}) {
  const t = useMessages()
  const bids = useMemo(
    () => moves.filter((m): m is Extract<Move, { type: 'bid' }> => m.type === 'bid'),
    [moves],
  )
  const values = [...new Set(bids.map((b) => b.value))]
  const trumps = [...new Set(bids.map((b) => b.trump))] as Trump[]
  const [value, setValue] = useState<number | null>(null)
  const [trump, setTrump] = useState<Trump | null>(null)
  const chosenValue = value !== null && values.includes(value) ? value : (values[0] ?? null)
  const ready = chosenValue !== null && trump !== null

  return (
    <div className="bid-panel coinche" role="group" aria-label={t.table.chooseValue}>
      {values.length > 0 && (
        <>
          <div className="bid-label">{t.table.chooseValue}</div>
          <div className="chip-row values">
            {values.map((v) => (
              <button
                key={v}
                type="button"
                className={`chip ${v === chosenValue ? 'is-on' : ''}`}
                aria-pressed={v === chosenValue}
                onClick={() => setValue(v)}
              >
                {t.bidValue(v)}
              </button>
            ))}
          </div>
          <div className="bid-label">{t.table.chooseTrump}</div>
          <div className="chip-row trumps">
            {trumps.map((tr) => (
              <button
                key={tr}
                type="button"
                className={`chip chip-trump trump-${tr} ${tr === trump ? 'is-on' : ''}`}
                aria-pressed={tr === trump}
                aria-label={t.trumpName(tr)}
                onClick={() => setTrump(tr)}
              >
                <TrumpGlyph trump={tr} />
              </button>
            ))}
          </div>
        </>
      )}
      <div className="bid-row">
        {values.length > 0 && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!ready}
            onClick={() => {
              if (chosenValue !== null && trump !== null)
                onMove({ type: 'bid', value: chosenValue, trump })
            }}
          >
            {ready ? t.table.bid(chosenValue, trump) : t.table.chooseTrump}
          </button>
        )}
        {coinche && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => onMove({ type: 'coinche' })}
          >
            {t.table.coinche}
          </button>
        )}
        {surcoinche && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => onMove({ type: 'surcoinche' })}
          >
            {t.table.surcoinche}
          </button>
        )}
        {canPass && (
          <button type="button" className="btn btn-ghost" onClick={() => onMove({ type: 'pass' })}>
            {t.table.pass}
          </button>
        )}
      </div>
    </div>
  )
}
