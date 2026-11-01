import type { PlayerView } from '@belote/protocol'
import type { ReactNode } from 'react'
import { useMessages } from '../i18n/index.js'
import { TrumpGlyph } from './PlayingCard.js'

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const t = useMessages()
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label={t.sheet.close} onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

/** Every hand of the game, running totals included, from the viewer's side. */
export function ScoreSheet({ view, onClose }: { view: PlayerView; onClose: () => void }) {
  const t = useMessages()
  const us = view.you.seat % 2
  const them = 1 - us
  let a = 0
  let b = 0
  const rows = view.history.map((r, i) => {
    a += r.scored[us] ?? 0
    b += r.scored[them] ?? 0
    return { r, i, a, b }
  })
  return (
    <Modal title={t.sheet.title} onClose={onClose}>
      {rows.length === 0 ? (
        <p className="muted">{t.sheet.empty}</p>
      ) : (
        <table className="sheet">
          <thead>
            <tr>
              <th>{t.sheet.hand}</th>
              <th>{t.sheet.contract}</th>
              <th>{t.table.us}</th>
              <th>{t.table.them}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, i, a: ra, b: rb }) => (
              <tr key={i} className={r.made === false ? 'failed' : ''}>
                <td>{i + 1}</td>
                <td className="sheet-contract">
                  {r.contract ? (
                    <>
                      <TrumpGlyph trump={r.contract.trump} />
                      {r.contract.value !== null && <span>{t.bidValue(r.contract.value)}</span>}
                      {r.contract.multiplier > 1 && (
                        <span className="mult">×{r.contract.multiplier}</span>
                      )}
                    </>
                  ) : (
                    '-'
                  )}
                </td>
                <td>
                  <span className="delta">+{r.scored[us]}</span> <strong>{ra}</strong>
                </td>
                <td>
                  <span className="delta">+{r.scored[them]}</span> <strong>{rb}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  )
}

/** What this table plays by, readable mid-game. */
export function RulesSheet({ view, onClose }: { view: PlayerView; onClose: () => void }) {
  const t = useMessages()
  const r = view.rules
  const yes = (on: boolean) => (on ? t.rulesInPlay.on : t.rulesInPlay.off)
  const items: [string, string][] = [
    [t.lobby.variant, r.variant === 'classic' ? t.lobby.classic : t.lobby.coinche],
    [t.lobby.target, t.lobby.points(r.target)],
    [t.lobby.allTrumps, yes(r.allTrumps)],
    [t.lobby.vache, yes(r.vache)],
    [t.lobby.pisse, yes(r.pisse)],
    [t.lobby.overtrump, yes(r.mustOvertrump)],
    [t.lobby.declarations, yes(r.declarations)],
  ]
  return (
    <Modal title={t.rulesInPlay.title} onClose={onClose}>
      <dl className="rules-list">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}
