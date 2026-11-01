import {
  applyMove,
  botMove,
  createGame,
  legalMoves,
  type GameState,
  type Move,
} from '@belote/engine'
import { describe, expect, it } from 'vitest'
import { diffEvents } from './game-events.js'

/** Plays the first legal move for whoever is on turn, collecting every derived event. */
const playOut = (state: GameState, limit = 5000) => {
  const all: ReturnType<typeof diffEvents> = []
  let game = state
  for (let i = 0; i < limit && game.hand.phase !== 'done'; i++) {
    const seat = game.hand.currentSeat
    const move: Move | undefined = legalMoves(game, seat)[0]
    if (move === undefined) break
    const next = applyMove(game, seat, move)
    if (!next.okay) throw new Error(next.error)
    all.push(...diffEvents(game, next.value, seat, move))
    game = next.value
  }
  return { events: all, game }
}

describe('diffEvents', () => {
  it('derives a coherent feed for a whole hand', () => {
    // A seed whose bidding ends in a played hand rather than a redeal.
    let found: ReturnType<typeof playOut> | null = null
    for (let seed = 1; seed < 200 && found === null; seed++) {
      const out = playOut(createGame({ seed, rules: { vache: true } }))
      if (out.events.some((e) => e.type === 'handEnded')) found = out
    }
    if (found === null) throw new Error('no seed produced a played hand')
    const types = found.events.map((e) => e.type)
    expect(types).toContain('bid')
    expect(types.filter((t) => t === 'cardPlayed')).toHaveLength(32)
    expect(types.filter((t) => t === 'trickWon')).toHaveLength(8)
    expect(types.at(-1)).toBe('handEnded')
  })

  it('reports a redeal when everybody passes', () => {
    for (let seed = 1; seed < 400; seed++) {
      const out = playOut(createGame({ seed, rules: { vache: false } }))
      if (out.events.some((e) => e.type === 'redeal')) {
        expect(out.events.some((e) => e.type === 'handEnded')).toBe(false)
        return
      }
    }
    throw new Error('no seed produced a redeal')
  })

  it('counts the card points of a trick', () => {
    for (let seed = 1; seed < 200; seed++) {
      const { events } = playOut(createGame({ seed, rules: { vache: true } }))
      const tricks = events.flatMap((e) => (e.type === 'trickWon' ? [e.points] : []))
      if (tricks.length === 8) {
        expect(tricks.every((p) => p >= 0)).toBe(true)
        return
      }
    }
    throw new Error('no played hand found')
  })

  it('says belote then rebelote for the king and queen of trump', () => {
    const calls: string[] = []
    for (let seed = 1; seed < 300 && calls.length === 0; seed++) {
      let game = createGame({ seed })
      while (game.hand.phase !== 'done') {
        const seat = game.hand.currentSeat
        const move = botMove(game, seat, 'normal', seed)
        if (move === null) break
        const next = applyMove(game, seat, move)
        if (!next.okay) throw new Error(next.error)
        for (const e of diffEvents(game, next.value, seat, move)) {
          if (e.type === 'belote') calls.push(`${e.seat}:${e.call}`)
        }
        game = next.value
      }
    }
    expect(calls.length).toBeGreaterThanOrEqual(2)
    const [first, second] = calls
    expect(first?.endsWith(':belote')).toBe(true)
    expect(second?.endsWith(':rebelote')).toBe(true)
    expect(first?.split(':')[0]).toBe(second?.split(':')[0])
  })
})
