import { describe, expect, it } from 'vitest'
import { Room } from './room.js'

const newRoom = (...names: string[]) => {
  const room = new Room('ABC234')
  const tokens = names.map((name, i) => {
    const joined = room.join(name, `socket-${i}`)
    if (!joined.okay) throw new Error(joined.error)
    return joined.value
  })
  return { room, tokens }
}

const kinds = (room: Room) => room.lobbyView().seats.map((s) => s.kind)

describe('Room lobby seats', () => {
  it('seats the creator at seat 0 as host, then fills the first empty seat', () => {
    const { room, tokens } = newRoom('Ana', 'Ben', 'Cleo')
    expect(tokens.map((t) => t.seat)).toEqual([0, 1, 2])
    expect(room.hostSeat).toBe(0)
    expect(kinds(room)).toEqual(['human', 'human', 'human', 'empty'])
  })

  it('is idempotent per socket and refuses a fifth player with room_full', () => {
    const { room } = newRoom('Ana', 'Ben', 'Cleo', 'Dan')
    expect(room.join('Ana again', 'socket-0')).toMatchObject({ okay: true, value: { seat: 0 } })
    expect(room.join('Eve', 'socket-9')).toEqual({ okay: false, error: 'room_full' })
  })

  it('lets the host put a bot in an empty seat, change its level, and empty it', () => {
    const { room } = newRoom('Ana')
    expect(room.setSeat(0, 1, { kind: 'bot', level: 'easy' }).okay).toBe(true)
    const first = room.lobbyView().seats[1]
    expect(first).toMatchObject({ kind: 'bot', level: 'easy', standingInFor: null })

    room.setSeat(0, 1, { kind: 'bot', level: 'hard' })
    const second = room.lobbyView().seats[1]
    expect(second).toMatchObject({ kind: 'bot', level: 'hard' })
    // Changing the level keeps the name, so the table does not see a new face.
    expect(second && 'name' in second ? second.name : null).toBe(
      first && 'name' in first ? first.name : undefined,
    )

    room.setSeat(0, 1, { kind: 'empty' })
    expect(kinds(room)[1]).toBe('empty')
  })

  it('gives each bot a different friendly name', () => {
    const { room } = newRoom('Ana')
    for (const seat of [1, 2, 3]) room.setSeat(0, seat, { kind: 'bot', level: 'normal' })
    const names = room.lobbyView().seats.flatMap((s) => (s.kind === 'bot' ? [s.name] : []))
    expect(new Set(names).size).toBe(3)
    expect(names.some((n) => /^Bot \d/.test(n))).toBe(false)
  })

  it('refuses setSeat from a guest, on a human seat, and once the game started', () => {
    const { room } = newRoom('Ana', 'Ben')
    expect(room.setSeat(1, 2, { kind: 'bot', level: 'easy' })).toEqual({
      okay: false,
      error: 'not_host',
    })
    expect(room.setSeat(0, 1, { kind: 'empty' })).toEqual({ okay: false, error: 'seat_taken' })
    for (const seat of [2, 3]) room.setSeat(0, seat, { kind: 'bot', level: 'easy' })
    expect(room.start(0, 1).okay).toBe(true)
    expect(room.setSeat(0, 2, { kind: 'empty' })).toEqual({
      okay: false,
      error: 'game_already_started',
    })
  })

  it('moves a human to an empty seat and keeps the host with them', () => {
    const { room } = newRoom('Ana', 'Ben')
    expect(room.moveSeat(0, 2)).toEqual({ okay: true, value: { seat: 2 } })
    expect(kinds(room)).toEqual(['empty', 'human', 'human', 'empty'])
    expect(room.hostSeat).toBe(2)
    expect(room.seatOfSocket('socket-0')).toBe(2)
  })

  it('refuses to move onto an occupied seat or after the start', () => {
    const { room } = newRoom('Ana', 'Ben')
    expect(room.moveSeat(0, 1)).toEqual({ okay: false, error: 'seat_taken' })
    for (const seat of [2, 3]) room.setSeat(0, seat, { kind: 'bot', level: 'easy' })
    expect(room.moveSeat(0, 2)).toEqual({ okay: false, error: 'seat_taken' })
    room.start(0, 1)
    expect(room.moveSeat(1, 3)).toEqual({ okay: false, error: 'game_already_started' })
  })

  it('reports canStart only once all four seats are human or bot', () => {
    const { room } = newRoom('Ana')
    expect(room.lobbyView().canStart).toBe(false)
    room.setSeat(0, 1, { kind: 'bot', level: 'easy' })
    room.setSeat(0, 2, { kind: 'bot', level: 'easy' })
    expect(room.lobbyView().canStart).toBe(false)
    room.setSeat(0, 3, { kind: 'bot', level: 'easy' })
    expect(room.lobbyView().canStart).toBe(true)
  })

  it('refuses to start with an empty seat, or by a guest', () => {
    const { room } = newRoom('Ana', 'Ben')
    expect(room.start(0, 1)).toEqual({ okay: false, error: 'seats_not_filled' })
    room.setSeat(0, 2, { kind: 'bot', level: 'easy' })
    room.setSeat(0, 3, { kind: 'bot', level: 'easy' })
    expect(room.start(1, 1)).toEqual({ okay: false, error: 'not_host' })
  })

  it('starts with a handStarted event and locks the configuration', () => {
    const { room } = newRoom('Ana')
    for (const seat of [1, 2, 3]) room.setSeat(0, seat, { kind: 'bot', level: 'easy' })
    const started = room.start(0, 7)
    expect(started.okay && started.value[0]).toMatchObject({ type: 'handStarted', number: 1 })
    expect(room.lobbyView().configurable).toBe(false)
    expect(room.configure(0, { pace: null })).toEqual({
      okay: false,
      error: 'game_already_started',
    })
  })

  it('configures pace and rules for the host only', () => {
    const { room } = newRoom('Ana', 'Ben')
    expect(room.configure(1, { pace: null })).toEqual({ okay: false, error: 'not_host' })
    room.configure(0, { pace: { turnSeconds: 20 } })
    expect(room.lobbyView().pace).toEqual({ turnSeconds: 20 })
  })

  it('frees the seat on leave and passes the host on', () => {
    const { room } = newRoom('Ana', 'Ben', 'Cleo')
    const left = room.leave('socket-0')
    expect(left?.events).toEqual([{ type: 'seatLeft', seat: 0 }])
    expect(kinds(room)[0]).toBe('empty')
    expect(room.hostSeat).toBe(1)
    // The freed seat is the first empty one for the next joiner.
    expect(room.join('Dan', 'socket-9')).toMatchObject({ okay: true, value: { seat: 0 } })
  })

  it('is abandoned once no human is left', () => {
    const { room } = newRoom('Ana')
    room.setSeat(0, 1, { kind: 'bot', level: 'easy' })
    expect(room.abandoned).toBe(false)
    room.leave('socket-0')
    expect(room.abandoned).toBe(true)
  })
})
