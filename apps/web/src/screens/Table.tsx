import type { Card, Move, PlayedCard, Trump } from '@belote/engine'
import { TRICK_PAUSE_MS, type LobbyView, type PlayerView, type SeatInfo } from '@belote/protocol'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BiddingPanel } from '../components/BiddingPanel.js'
import { HandResultPanel, GameOverPanel } from '../components/HandResultPanel.js'
import { CardBack, PlayingCard, SuitIcon, TrumpGlyph } from '../components/PlayingCard.js'
import { RulesSheet, ScoreSheet } from '../components/ScoreSheet.js'
import { useCountdown } from '../hooks/useCountdown.js'
import { useMessages } from '../i18n/index.js'
import { seatName, sideOf, sideTeam, type Side } from '../lib/seats.js'
import { readSortMode, writeSortMode } from '../lib/preferences.js'
import { SORT_MODES, sortHand, type SortMode } from '../lib/sort-hand.js'

type Props = {
  view: PlayerView
  lobby: LobbyView | null
  onPlay: (move: Move) => void
  onNextHand: () => void
  onRestart: () => void
  onLeave: () => void
  /** Chat and voice, wired by the app: the table itself holds no socket. */
  side: ReactNode
}

type Held = { cards: PlayedCard[]; winner: number; collecting: boolean }

export function Table({ view, lobby, onPlay, onNextHand, onRestart, onLeave, side }: Props) {
  const t = useMessages()
  const me = view.you.seat
  const hand = view.hand
  const trump: Trump | null = hand.contract?.trump ?? null
  const name = (seat: number) => seatName(view.seats, seat)
  const [panel, setPanel] = useState<'none' | 'sheet' | 'rules' | 'last' | 'side'>('none')

  useEffect(() => {
    if (panel === 'none') return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanel('none')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel])

  /* A completed trick stays on the felt for a beat, then slides to its winner. */
  const total = hand.tricksWon[0] + hand.tricksWon[1]
  const prevTotal = useRef(total)
  const [held, setHeld] = useState<Held | null>(null)
  useEffect(() => {
    const last = hand.lastTrick
    if (total > prevTotal.current && last) {
      prevTotal.current = total
      setHeld({ cards: last.cards, winner: last.winner, collecting: false })
      const collect = setTimeout(
        () => setHeld((h) => h && { ...h, collecting: true }),
        TRICK_PAUSE_MS - 380,
      )
      const clear = setTimeout(() => setHeld(null), TRICK_PAUSE_MS)
      return () => {
        clearTimeout(collect)
        clearTimeout(clear)
      }
    }
    prevTotal.current = total
    return undefined
  }, [total, hand.lastTrick])

  const shownTrick = hand.trick.length > 0 ? hand.trick : (held?.cards ?? [])
  const collectingTo = hand.trick.length === 0 && held?.collecting ? sideOf(held.winner, me) : null

  const myTurn = hand.currentSeat === me && view.you.legalMoves.length > 0
  const playable = new Set(
    view.you.legalMoves.flatMap((m) => (m.type === 'play' ? [m.cardId] : [])),
  )
  const declare = view.you.legalMoves.find((m) => m.type === 'declare')
  const [sortMode, setSortMode] = useState<SortMode>(readSortMode)
  const sorted = useMemo(
    () => sortHand(view.you.hand, trump, sortMode),
    [view.you.hand, trump, sortMode],
  )
  const nextSort = (): void => {
    const next = SORT_MODES[(SORT_MODES.indexOf(sortMode) + 1) % SORT_MODES.length] ?? 'alternate'
    setSortMode(next)
    writeSortMode(next)
  }

  const remaining = useCountdown(view.turnDeadline)
  const isHost = lobby?.hostSeat === me

  const showResult = hand.phase === 'done' && held === null && view.phase !== 'finished'
  const showOver = view.phase === 'finished' && held === null

  return (
    <div className="table-screen">
      <header className="topbar">
        <div className="brand-mini">{t.brand}</div>
        <ScoreBoard view={view} />
        <ContractChip view={view} name={name} />
        <nav className="topbar-actions">
          <IconButton
            label={t.table.lastTrick}
            onClick={() => setPanel('last')}
            disabled={!hand.lastTrick}
          >
            ⟲
          </IconButton>
          <IconButton label={t.table.scoreSheet} onClick={() => setPanel('sheet')}>
            ▤
          </IconButton>
          <IconButton label={t.table.rules} onClick={() => setPanel('rules')}>
            ?
          </IconButton>
          <IconButton
            label={t.table.chat}
            onClick={() => setPanel(panel === 'side' ? 'none' : 'side')}
          >
            ✉
          </IconButton>
          <IconButton
            label={t.table.leave}
            onClick={() => {
              if (window.confirm(t.table.confirmLeave)) onLeave()
            }}
          >
            ⏻
          </IconButton>
        </nav>
      </header>

      <main className="felt" data-phase={hand.phase}>
        {[0, 1, 2, 3].map((seat) => (
          <SeatPlate
            key={seat}
            seat={seat}
            me={me}
            view={view}
            info={view.seats.find((s) => s.seat === seat)}
            remaining={hand.currentSeat === seat ? remaining : null}
          />
        ))}

        <div className="centre">
          {hand.phase === 'bidding' && hand.turned && (
            <div className="turned">
              <CardBack className="deck" />
              <PlayingCard card={hand.turned} className="turned-card" />
            </div>
          )}
          <div className={`trick ${collectingTo ? `collect-${collectingTo}` : ''}`}>
            {shownTrick.map((p, i) => (
              <PlayingCard
                key={p.card.id}
                card={p.card}
                trump={trump !== null && (trump === 'AT' || p.card.suit === trump)}
                className={`in-trick at-${sideOf(p.seat, me)}${i === 0 ? ' is-lead' : ''}`}
                style={{ zIndex: i + 1 }}
              />
            ))}
          </div>
          {shownTrick[0] && collectingTo === null && (
            <p className="trick-lead">
              {t.table.ledBy(shownTrick[0].seat === me ? t.lobby.you : name(shownTrick[0].seat))}
              <SuitIcon suit={shownTrick[0].card.suit} />
            </p>
          )}
        </div>

        {showResult && hand.result && (
          <HandResultPanel view={view} name={name} onNext={onNextHand} />
        )}
        {showOver && (
          <GameOverPanel view={view} name={name} isHost={isHost} onRestart={onRestart} />
        )}
      </main>

      <footer className={`my-zone ${myTurn ? 'my-turn' : ''}`}>
        {myTurn && hand.phase === 'bidding' && (
          <BiddingPanel
            hand={hand}
            moves={view.you.legalMoves}
            variant={view.rules.variant}
            onMove={onPlay}
          />
        )}
        {declare && (
          <button
            type="button"
            className="btn btn-gold declare-btn"
            onClick={() => onPlay(declare)}
          >
            {t.table.declare(view.you.declarable.map((d) => t.declarationName(d.kind)))}
          </button>
        )}
        <div className="hint-row">
          <div className="turn-hint" aria-live="polite">
            {hand.phase === 'playing' &&
              (myTurn
                ? t.table.yourTurn
                : hand.currentSeat !== me
                  ? t.table.waitingFor(name(hand.currentSeat))
                  : '')}
          </div>
          {view.you.hand.length > 1 && (
            <button
              type="button"
              className="sort-btn"
              aria-label={t.table.sortBy(t.table.sortModes[sortMode])}
              onClick={nextSort}
            >
              <span aria-hidden="true">⇅</span> {t.table.sortModes[sortMode]}
            </button>
          )}
        </div>
        <HandFan
          cards={sorted}
          trump={trump}
          playable={playable}
          active={myTurn && hand.phase === 'playing'}
          onPlay={(card) => onPlay({ type: 'play', cardId: card.id })}
        />
      </footer>

      {panel === 'sheet' && <ScoreSheet view={view} onClose={() => setPanel('none')} />}
      {panel === 'rules' && <RulesSheet view={view} onClose={() => setPanel('none')} />}
      {panel === 'last' && hand.lastTrick && (
        <div className="modal-backdrop" onClick={() => setPanel('none')}>
          <div className="modal last-trick" role="dialog" aria-label={t.table.lastTrick}>
            <h2>{t.table.lastTrick}</h2>
            <div className="last-trick-cards">
              {hand.lastTrick.cards.map((p) => (
                <figure key={p.card.id} className={p.seat === hand.lastTrick?.winner ? 'won' : ''}>
                  <PlayingCard card={p.card} />
                  <figcaption>{name(p.seat)}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>
      )}
      {panel === 'side' && <div className="drawer-backdrop" onClick={() => setPanel('none')} />}
      <aside
        className={`side-drawer ${panel === 'side' ? 'open' : ''}`}
        aria-hidden={panel !== 'side'}
        inert={panel !== 'side'}
      >
        <div className="drawer-head">
          <button
            type="button"
            className="icon-btn"
            aria-label={t.sheet.close}
            onClick={() => setPanel('none')}
          >
            ✕
          </button>
        </div>
        {side}
      </aside>
    </div>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  )
}

function ScoreBoard({ view }: { view: PlayerView }) {
  const t = useMessages()
  const us = view.you.seat % 2
  const them = 1 - us
  const target = view.rules.target
  const pct = (n: number) => `${Math.min(100, (n / target) * 100)}%`
  const live = view.hand.phase === 'playing'
  const handPts = (team: number) => {
    const n = view.hand.pointsWon[team] ?? 0
    return live ? (
      <span className="score-hand" title={t.table.handPoints(n)} aria-label={t.table.handPoints(n)}>
        +{n}
      </span>
    ) : null
  }
  return (
    <div
      className="scoreboard"
      aria-label={`${t.table.us} ${view.scores[us]}, ${t.table.them} ${view.scores[them]}`}
    >
      <div className="score us">
        <span className="score-label">{t.table.us}</span>
        <span className="score-value">{view.scores[us]}</span>
        {handPts(us)}
        <span className="score-bar">
          <span style={{ width: pct(view.scores[us] ?? 0) }} />
        </span>
      </div>
      <div className="score-meta">
        <span>{t.table.handNo(view.hand.number)}</span>
        <span>{t.table.target(target)}</span>
        {view.reserve > 0 && <span className="reserve">{t.table.reserve(view.reserve)}</span>}
      </div>
      <div className="score them">
        <span className="score-label">{t.table.them}</span>
        <span className="score-value">{view.scores[them]}</span>
        {handPts(them)}
        <span className="score-bar">
          <span style={{ width: pct(view.scores[them] ?? 0) }} />
        </span>
      </div>
    </div>
  )
}

function ContractChip({ view, name }: { view: PlayerView; name: (seat: number) => string }) {
  const t = useMessages()
  const c = view.hand.contract
  if (!c) return <div className="contract-chip empty" />
  const team = c.taker === null ? null : sideTeam(c.taker, view.you.seat)
  return (
    <div className={`contract-chip ${team ?? 'vache'}`}>
      <span className="contract-trump">
        <TrumpGlyph trump={c.trump} />
      </span>
      <span className="contract-text">
        <strong className="contract-long">{t.table.contractLine(c.value, c.trump)}</strong>
        {c.value !== null && <strong className="contract-short">{c.value}</strong>}
        <small>
          {c.taker === null
            ? t.table.vacheLabel
            : c.taker === view.you.seat
              ? t.table.youTook
              : t.table.takerLabel(name(c.taker))}
        </small>
      </span>
      {c.multiplier > 1 && (
        <span className="contract-mult">
          {c.multiplier === 4 ? t.table.surcoinched : t.table.coinched}
        </span>
      )}
    </div>
  )
}

function SeatPlate({
  seat,
  me,
  view,
  info,
  remaining,
}: {
  seat: number
  me: number
  view: PlayerView
  info: SeatInfo | undefined
  remaining: number | null
}) {
  const t = useMessages()
  const hand = view.hand
  const side: Side = sideOf(seat, me)
  const nameText = info && info.kind !== 'empty' ? info.name : '…'
  const isTurn = hand.currentSeat === seat && hand.phase !== 'done'
  const team = sideTeam(seat, me)
  const lastBid =
    hand.phase === 'bidding' ? [...hand.bids].reverse().find((b) => b.seat === seat) : undefined
  const announced = hand.announced.find((a) => a.seat === seat)
  const firstTrick = hand.phase === 'playing' && hand.tricksWon[0] + hand.tricksWon[1] === 0
  const belote = hand.beloteCalls.filter((c) => c.seat === seat).at(-1)
  const isTaker = hand.contract?.taker === seat
  const count = hand.handCounts[seat] ?? 0

  let bubble: string | null = null
  if (lastBid) bubble = t.bidBubble(lastBid)
  else if (firstTrick && announced)
    bubble = announced.kinds.map((k) => t.declarationName(k)).join(' + ')
  else if (belote && hand.phase === 'playing')
    bubble = belote.call === 'belote' ? t.table.belote : t.table.rebelote

  return (
    <div className={`seat seat-${side} team-${team} ${isTurn ? 'is-turn' : ''}`}>
      {side !== 'bottom' && (
        <div className={`opp-hand opp-${side}`} aria-hidden="true">
          {Array.from({ length: count }, (_, i) => (
            <CardBack
              key={i}
              className="mini"
              style={{ ['--i' as string]: i, ['--n' as string]: count }}
            />
          ))}
        </div>
      )}
      <div className="plate">
        <div className="avatar" aria-hidden="true">
          {nameText.slice(0, 1).toUpperCase()}
          {isTurn && remaining !== null && <span className="timer">{remaining}</span>}
        </div>
        <div className="plate-text">
          <span className="plate-name">
            {nameText}
            {seat === me && <em> ({t.lobby.you})</em>}
          </span>
          <span className="plate-tags">
            {hand.dealer === seat && <span className="tag tag-dealer">{t.table.dealer}</span>}
            {isTaker && <span className="tag tag-taker">★ {t.table.taker}</span>}
            {info?.kind === 'bot' && (
              <span className="tag tag-bot">
                {info.standingInFor ? t.table.standingInFor(info.standingInFor) : t.table.bot}
              </span>
            )}
            {info?.kind === 'human' && info.status !== 'active' && (
              <span className="tag tag-off">{t.table.disconnected}</span>
            )}
          </span>
        </div>
      </div>
      {bubble && (
        <div
          className={`bubble ${lastBid?.type === 'coinche' || lastBid?.type === 'surcoinche' ? 'hot' : ''}`}
        >
          {bubble}
        </div>
      )}
    </div>
  )
}

function HandFan({
  cards,
  trump,
  playable,
  active,
  onPlay,
}: {
  cards: Card[]
  trump: Trump | null
  playable: Set<string>
  active: boolean
  onPlay: (card: Card) => void
}) {
  const n = cards.length
  return (
    <div className="hand-fan" style={{ ['--n' as string]: n }}>
      {cards.map((card, i) => {
        const can = active && playable.has(card.id)
        return (
          <PlayingCard
            key={card.id}
            card={card}
            trump={trump !== null && (trump === 'AT' || card.suit === trump)}
            playable={can}
            disabled={active && !can}
            onClick={active ? () => onPlay(card) : undefined}
            className="in-hand"
            style={{ ['--i' as string]: i }}
          />
        )
      })}
    </div>
  )
}
