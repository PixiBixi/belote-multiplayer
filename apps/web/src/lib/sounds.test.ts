import type { GameEvent } from '@belote/protocol'
import { describe, expect, it } from 'vitest'
import { soundForEvent, soundsForEvents } from './sounds.js'

const card = { id: 'JH' as never, rank: 'J' as const, suit: 'H' as const }
const result = (scored: [number, number]) =>
  ({ kind: 'played', scored }) as unknown as Extract<GameEvent, { type: 'handEnded' }>['result']

describe('soundForEvent', () => {
  it('snaps for a card played', () => {
    expect(soundForEvent({ type: 'cardPlayed', seat: 1, card }, 0)).toBe('card')
  })

  it('tells our team taking a trick from the other one', () => {
    // Team is seat % 2: seat 2 is our partner from seat 0, seat 1 is an opponent.
    expect(soundForEvent({ type: 'trickWon', seat: 2, points: 10 }, 0)).toBe('trickWon')
    expect(soundForEvent({ type: 'trickWon', seat: 1, points: 10 }, 0)).toBe('trickLost')
    expect(soundForEvent({ type: 'trickWon', seat: 1, points: 10 }, 3)).toBe('trickWon')
  })

  it('stays silent on a pass, ticks on a bid and stings on a coinche', () => {
    expect(soundForEvent({ type: 'bid', bid: { seat: 1, type: 'pass' } }, 0)).toBeNull()
    expect(soundForEvent({ type: 'bid', bid: { seat: 1, type: 'take', trump: 'H' } }, 0)).toBe(
      'bid',
    )
    expect(soundForEvent({ type: 'bid', bid: { seat: 1, type: 'coinche' } }, 0)).toBe('coinche')
    expect(soundForEvent({ type: 'bid', bid: { seat: 1, type: 'surcoinche' } }, 0)).toBe('coinche')
  })

  it('flourishes on belote and rebelote', () => {
    expect(soundForEvent({ type: 'belote', seat: 1, call: 'belote' }, 0)).toBe('belote')
    expect(soundForEvent({ type: 'belote', seat: 1, call: 'rebelote' }, 0)).toBe('belote')
  })

  it('tells winning a hand from losing it, by team', () => {
    const ended = (scored: [number, number]): GameEvent => ({
      type: 'handEnded',
      result: result(scored),
      scores: scored,
    })
    expect(soundForEvent(ended([100, 62]), 0)).toBe('handWon')
    expect(soundForEvent(ended([100, 62]), 1)).toBe('handLost')
    expect(soundForEvent(ended([40, 122]), 3)).toBe('handWon')
  })

  it('tells winning the game from losing it', () => {
    expect(soundForEvent({ type: 'gameEnded', winner: 0, scores: [1000, 800] }, 2)).toBe('gameWon')
    expect(soundForEvent({ type: 'gameEnded', winner: 0, scores: [1000, 800] }, 1)).toBe('gameLost')
  })

  it('sounds a timeout for everyone', () => {
    expect(soundForEvent({ type: 'turnTimedOut', seat: 3 }, 0)).toBe('timedOut')
  })

  it('stays silent for what the log already says in words', () => {
    for (const event of [
      { type: 'handStarted', number: 1, dealer: 0 },
      { type: 'declared', seat: 1, kinds: ['tierce'] },
      { type: 'redeal', dealer: 1 },
      { type: 'botTookOver', seat: 1 },
      { type: 'seatDisconnected', seat: 1 },
      { type: 'seatReconnected', seat: 1 },
      { type: 'seatLeft', seat: 1 },
      { type: 'gameRestarted' },
    ] as GameEvent[]) {
      expect(soundForEvent(event, 0)).toBeNull()
    }
  })
})

describe('soundsForEvents', () => {
  it('keeps the order the events arrived in and drops the silent ones', () => {
    expect(
      soundsForEvents(
        [
          { type: 'cardPlayed', seat: 1, card },
          { type: 'seatLeft', seat: 1 },
          { type: 'trickWon', seat: 1, points: 12 },
        ],
        0,
      ),
    ).toEqual(['card', 'trickLost'])
  })

  it('plays only the bigger ending when a hand ends the game', () => {
    expect(
      soundsForEvents(
        [
          { type: 'handEnded', result: result([100, 62]), scores: [1000, 800] },
          { type: 'gameEnded', winner: 0, scores: [1000, 800] },
        ],
        0,
      ),
    ).toEqual(['gameWon'])
  })

  it('still plays the hand ending when the game continues', () => {
    expect(
      soundsForEvents([{ type: 'handEnded', result: result([100, 62]), scores: [100, 62] }], 0),
    ).toEqual(['handWon'])
  })
})
