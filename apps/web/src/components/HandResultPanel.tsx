import type { PlayerView } from '@belote/protocol'
import { useCountdown } from '../hooks/useCountdown.js'
import { useMessages } from '../i18n/index.js'
import { TrumpGlyph } from './PlayingCard.js'

type NameOf = (seat: number) => string

/** Score of the hand just played, from the viewer's side of the table. */
export function HandResultPanel({
  view,
  name,
  onNext,
}: {
  view: PlayerView
  name: NameOf
  onNext: () => void
}) {
  const t = useMessages()
  const r = view.hand.result
  const left = useCountdown(view.nextHandDeadline)
  if (!r) return null
  const us = view.you.seat % 2
  const them = 1 - us

  if (r.kind === 'redeal') {
    return (
      <div className="result-card" role="status">
        <p className="result-title">{t.result.redeal}</p>
        <NextButton left={left} onNext={onNext} />
      </div>
    )
  }

  const c = r.contract
  const takerUs = c?.taker !== null && c?.taker !== undefined && c.taker % 2 === us
  const title =
    r.made === null
      ? r.litige
        ? t.result.litige
        : t.result.vache
      : r.made
        ? takerUs
          ? t.result.made
          : t.result.theyMade
        : takerUs
          ? t.result.failed
          : t.result.theyFailed
  const tone = r.made === null ? 'neutral' : r.made === takerUs ? 'good' : 'bad'

  const rows: [string, [number, number]][] = [
    [t.result.cards, r.trickPoints],
    [t.result.declarations, r.declarationPoints],
    [t.result.belote, r.belotePoints],
  ]

  return (
    <div className={`result-card tone-${tone}`} role="status">
      {c && (
        <div className="result-contract">
          <TrumpGlyph trump={c.trump} />
          <span>
            {t.table.contractLine(c.value, c.trump)}
            {c.taker !== null && <> · {name(c.taker)}</>}
          </span>
        </div>
      )}
      <p className="result-title">{title}</p>
      {r.capot !== null && <p className="result-capot">{t.result.capot}</p>}
      <table className="result-table">
        <thead>
          <tr>
            <th />
            <th>{t.table.us}</th>
            <th>{t.table.them}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, pts]) =>
            pts[0] + pts[1] === 0 && label !== t.result.cards ? null : (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{pts[us]}</td>
                <td>{pts[them]}</td>
              </tr>
            ),
          )}
          <tr className="total">
            <th scope="row">{t.result.total}</th>
            <td>+{r.scored[us]}</td>
            <td>+{r.scored[them]}</td>
          </tr>
        </tbody>
      </table>
      <NextButton left={left} onNext={onNext} />
    </div>
  )
}

function NextButton({ left, onNext }: { left: number | null; onNext: () => void }) {
  const t = useMessages()
  return (
    <button type="button" className="btn btn-primary" onClick={onNext}>
      {left !== null && left > 0 ? t.result.nextIn(left) : t.result.next}
    </button>
  )
}

export function GameOverPanel({
  view,
  name,
  isHost,
  onRestart,
}: {
  view: PlayerView
  name: NameOf
  isHost: boolean
  onRestart: () => void
}) {
  const t = useMessages()
  const us = view.you.seat % 2
  const won = view.winner === us
  const w = view.winner ?? 0
  return (
    <div className={`result-card over ${won ? 'tone-good' : 'tone-bad'}`} role="status">
      <p className="over-title">{won ? t.over.weWon : t.over.weLost}</p>
      <p>{t.over.winners(name(w), name(w + 2))}</p>
      <p className="over-score">
        <span>{view.scores[us]}</span>
        <span className="sep">-</span>
        <span>{view.scores[1 - us]}</span>
      </p>
      <p className="muted">{t.over.hands(view.history.length)}</p>
      {isHost ? (
        <button type="button" className="btn btn-primary" onClick={onRestart}>
          {t.over.again}
        </button>
      ) : (
        <p className="muted">{t.over.waitHost}</p>
      )}
    </div>
  )
}
