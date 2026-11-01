import type { BotLevel, TableRules } from '@belote/engine'
import {
  DEFAULT_TURN_SECONDS,
  TARGET_CHOICES,
  type LobbyView,
  type MatchPace,
  type SeatInfo,
  type SeatOccupant,
  type TableConfiguration,
} from '@belote/protocol'
import { CopyButton } from '../components/CopyButton.js'
import { useMessages } from '../i18n/index.js'
import { roomLink } from '../lib/room-url.js'

type Props = {
  lobby: LobbyView
  mySeat: number
  onStart: () => void
  onLeave: () => void
  onConfigure: (changes: TableConfiguration) => void
  onSetSeat: (seat: number, occupant: SeatOccupant) => void
  onMoveSeat: (seat: number) => void
}

const LEVELS: BotLevel[] = ['easy', 'normal', 'hard']
const CLOCKS: (number | null)[] = [null, 15, DEFAULT_TURN_SECONDS, 60]

export function Lobby({
  lobby,
  mySeat,
  onStart,
  onLeave,
  onConfigure,
  onSetSeat,
  onMoveSeat,
}: Props) {
  const t = useMessages()
  const isHost = lobby.hostSeat === mySeat
  const editable = isHost && lobby.configurable
  const rules = lobby.rules
  const setRule = (patch: Partial<TableRules>) => onConfigure({ rules: { ...rules, ...patch } })
  const seat = (n: number) =>
    lobby.seats.find((s) => s.seat === n) ?? { seat: n, kind: 'empty' as const }
  const empties = lobby.seats.filter((s) => s.kind === 'empty').map((s) => s.seat)
  const hostName = seat(lobby.hostSeat)

  return (
    <main className="lobby">
      <header className="lobby-head">
        <h1 className="brand">{t.brand}</h1>
        <p className="lobby-code">{t.lobby.title(lobby.roomCode)}</p>
        <div className="invite">
          <span>{t.lobby.invite}</span>
          <CopyButton
            value={roomLink(lobby.roomCode)}
            label={t.lobby.copy}
            subject={t.lobby.invite}
          />
        </div>
      </header>

      <section className="lobby-table" aria-label={t.lobby.teamsHint}>
        <div className="mini-felt">
          {[0, 1, 2, 3].map((n) => (
            <SeatCard
              key={n}
              info={seat(n)}
              mine={n === mySeat}
              host={n === lobby.hostSeat}
              // Fixed positions, not relative to me: a seat change must visibly move my card.
              position={(['bottom', 'right', 'top', 'left'] as const)[n] ?? 'bottom'}
              editable={editable}
              canMove={lobby.configurable}
              onSetSeat={onSetSeat}
              onMoveSeat={onMoveSeat}
            />
          ))}
          <div className="mini-felt-centre">
            <span className="team-dot us" /> {t.lobby.teamUs} · <span className="team-dot them" />{' '}
            {t.lobby.teamThem}
          </div>
        </div>
        <p className="muted small">{t.lobby.teamsHint}</p>
        {editable && empties.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => empties.forEach((n) => onSetSeat(n, { kind: 'bot', level: 'normal' }))}
          >
            {t.lobby.fillBots}
          </button>
        )}
      </section>

      <section className="lobby-rules" aria-label={t.lobby.rules}>
        <h2>{t.lobby.rules}</h2>
        <fieldset disabled={!editable}>
          <div className="variant-pick" role="radiogroup" aria-label={t.lobby.variant}>
            {(['classic', 'coinche'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={rules.variant === v}
                className={`variant ${rules.variant === v ? 'is-on' : ''}`}
                onClick={() => setRule({ variant: v })}
              >
                <strong>{v === 'classic' ? t.lobby.classic : t.lobby.coinche}</strong>
                <small>{v === 'classic' ? t.lobby.classicHint : t.lobby.coincheHint}</small>
              </button>
            ))}
          </div>

          <Toggle
            label={t.lobby.allTrumps}
            hint={t.lobby.allTrumpsHint}
            on={rules.allTrumps}
            set={(on) => setRule({ allTrumps: on })}
          />
          <Toggle
            label={t.lobby.vache}
            hint={t.lobby.vacheHint}
            on={rules.vache}
            set={(on) => setRule({ vache: on })}
          />
          <Toggle
            label={t.lobby.pisse}
            hint={t.lobby.pisseHint}
            on={rules.pisse}
            set={(on) => setRule({ pisse: on })}
          />
          <Toggle
            label={t.lobby.overtrump}
            hint={t.lobby.overtrumpHint}
            on={rules.mustOvertrump}
            set={(on) => setRule({ mustOvertrump: on })}
          />
          <Toggle
            label={t.lobby.declarations}
            hint={t.lobby.declarationsHint}
            on={rules.declarations}
            set={(on) => setRule({ declarations: on })}
          />

          <div className="pick-row">
            <span className="pick-label">{t.lobby.target}</span>
            <div className="chip-row">
              {TARGET_CHOICES.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`chip ${rules.target === n ? 'is-on' : ''}`}
                  aria-pressed={rules.target === n}
                  onClick={() => setRule({ target: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="pick-row">
            <span className="pick-label">{t.lobby.clock}</span>
            <div className="chip-row">
              {CLOCKS.map((s) => {
                const pace: MatchPace = s === null ? null : { turnSeconds: s }
                const on = (lobby.pace?.turnSeconds ?? null) === s
                return (
                  <button
                    key={s ?? 'none'}
                    type="button"
                    className={`chip ${on ? 'is-on' : ''}`}
                    aria-pressed={on}
                    onClick={() => onConfigure({ pace })}
                  >
                    {s === null ? t.lobby.noClock : t.lobby.seconds(s)}
                  </button>
                )
              })}
            </div>
          </div>
        </fieldset>
      </section>

      <footer className="lobby-actions">
        <button type="button" className="btn btn-ghost" onClick={onLeave}>
          {t.lobby.leave}
        </button>
        {isHost ? (
          <button
            type="button"
            className="btn btn-primary btn-big"
            disabled={!lobby.canStart}
            onClick={onStart}
          >
            {lobby.canStart ? t.lobby.start : t.lobby.waiting}
          </button>
        ) : (
          <p className="muted">
            {hostName.kind !== 'empty' ? t.lobby.waitingHost(hostName.name) : t.lobby.waiting}
          </p>
        )}
      </footer>
    </main>
  )
}

function Toggle({
  label,
  hint,
  on,
  set,
}: {
  label: string
  hint: string
  on: boolean
  set: (on: boolean) => void
}) {
  return (
    <label className="toggle">
      <span className="toggle-text">
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => set(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
    </label>
  )
}

function SeatCard({
  info,
  mine,
  host,
  position,
  editable,
  canMove,
  onSetSeat,
  onMoveSeat,
}: {
  info: SeatInfo
  mine: boolean
  host: boolean
  position: 'bottom' | 'right' | 'top' | 'left'
  editable: boolean
  canMove: boolean
  onSetSeat: (seat: number, occupant: SeatOccupant) => void
  onMoveSeat: (seat: number) => void
}) {
  const t = useMessages()
  const team = info.seat % 2 === 0 ? 'us' : 'them'
  return (
    <div className={`lobby-seat at-${position} team-${team} ${mine ? 'mine' : ''}`}>
      {info.kind === 'empty' ? (
        <>
          <span className="seat-empty">{t.lobby.empty}</span>
          <div className="seat-actions">
            {canMove && !mine && (
              <button type="button" className="btn btn-small" onClick={() => onMoveSeat(info.seat)}>
                {t.lobby.sitHere}
              </button>
            )}
            {editable && (
              <button
                type="button"
                className="btn btn-small btn-ghost"
                onClick={() => onSetSeat(info.seat, { kind: 'bot', level: 'normal' })}
              >
                {t.lobby.addBot}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <span className="avatar">{info.name.slice(0, 1).toUpperCase()}</span>
          <span className="seat-name">
            {info.name}
            {mine && <em> ({t.lobby.you})</em>}
            {host && <span className="tag">{t.lobby.host}</span>}
          </span>
          {info.kind === 'bot' && (
            <div className="seat-actions">
              <select
                aria-label={info.name}
                value={info.level}
                disabled={!editable}
                onChange={(e) =>
                  onSetSeat(info.seat, { kind: 'bot', level: e.target.value as BotLevel })
                }
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {t.botLevel[l]}
                  </option>
                ))}
              </select>
              {editable && (
                <button
                  type="button"
                  className="btn btn-small btn-ghost"
                  onClick={() => onSetSeat(info.seat, { kind: 'empty' })}
                >
                  {t.lobby.removeBot}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
