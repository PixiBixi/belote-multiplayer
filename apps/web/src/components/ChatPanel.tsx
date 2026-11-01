import { MAX_CHAT_LENGTH, type GameEvent } from '@belote/protocol'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { FeedEntry } from '../hooks/game-reducer.js'
import { useMessages } from '../i18n/index.js'
import { sideTeam } from '../lib/seats.js'

/** The seat an event is about, when it has one: its line takes that seat's team colour. */
function eventSeat(event: GameEvent): number | null {
  if (event.type === 'bid') return event.bid.seat
  return 'seat' in event ? event.seat : null
}

type ChatPanelProps = {
  feed: FeedEntry[]
  mySeat: number
  nameOf: (seat: number) => string
  onSend: (text: string) => void
}

export function ChatPanel({ feed, mySeat, nameOf, onSend }: ChatPanelProps) {
  const messages = useMessages()
  const [open, setOpen] = useState(true)
  const [draft, setDraft] = useState('')
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const seenRef = useRef(0)
  const [unread, setUnread] = useState(0)

  /* Unread counts chat from other people only. A badge that ticks up every time
     somebody draws a card trains people to ignore it. */
  const chatCount = feed.filter((entry) => entry.kind === 'chat' && entry.seat !== mySeat).length

  useEffect(() => {
    if (open) {
      seenRef.current = chatCount
      setUnread(0)
      return
    }
    setUnread(Math.max(0, chatCount - seenRef.current))
  }, [chatCount, open])

  useEffect(() => {
    if (!open) return
    const body = bodyRef.current
    if (body !== null) body.scrollTop = body.scrollHeight
  }, [feed, open])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (text.length === 0) return
    onSend(text)
    setDraft('')
  }

  if (!open) {
    return (
      <button
        type="button"
        className="chat-tab"
        onClick={() => {
          setOpen(true)
        }}
      >
        {messages.chat.title}
        {unread > 0 && <span className="unread">{unread}</span>}
      </button>
    )
  }

  return (
    <section className="chat-panel" aria-label={messages.chat.label}>
      <header className="chat-head">
        <span>{messages.chat.title}</span>
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            setOpen(false)
          }}
          aria-label={messages.chat.collapse}
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </header>

      <div className="chat-body" ref={bodyRef}>
        {feed.map((entry) => {
          if (entry.kind === 'event') {
            const text = messages.event(entry.event, nameOf)
            if (text === null) return null
            const seat = eventSeat(entry.event)
            return (
              <p
                className={seat === null ? 'sys-line' : `sys-line team-${sideTeam(seat, mySeat)}`}
                data-system=""
                key={entry.id}
              >
                {text}
              </p>
            )
          }
          const mine = entry.seat === mySeat
          return (
            <div className={mine ? 'msg msg-mine' : 'msg'} key={entry.id}>
              <div className={`msg-bubble team-${sideTeam(entry.seat, mySeat)}`}>
                <span className="msg-who">{mine ? messages.chat.you : entry.name}</span>
                <span>{entry.text}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* No autoFocus: stealing the keyboard mid-turn would break playing cards by
          keyboard. */}
      <form className="chat-foot" onSubmit={submit}>
        <label className="visually-hidden" htmlFor="chat-input">
          {messages.chat.messageLabel}
        </label>
        <input
          id="chat-input"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
          }}
          maxLength={MAX_CHAT_LENGTH}
          autoComplete="off"
          placeholder={messages.chat.placeholder}
        />
        <button type="submit" className="btn btn-primary">
          {messages.chat.send}
        </button>
      </form>
    </section>
  )
}
