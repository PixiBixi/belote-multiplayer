import { describe, expect, it } from 'vitest'
import { botMove } from './bot.js'
import { applyMove, createGame, nextHand } from './game.js'
import { replay, type GameRecord, type GameStep } from './replay.js'
import { DEFAULT_TABLE_RULES, type GameState, type TableRules } from './types.js'

/** Plays a bot game to the end and records every step on the way. */
function recordedGame(seed: number, rules: TableRules): { record: GameRecord; final: GameState } {
  let state = createGame({ seed, rules })
  const steps: GameStep[] = []
  for (let turn = 0; turn < 20000 && state.phase !== 'finished'; turn++) {
    if (state.hand.phase === 'done') {
      // A 128-bit seed per hand, as the server draws them.
      const handSeed = [seed, state.handNumber, 3, 4] as const
      state = nextHand(state, handSeed)
      steps.push({ kind: 'nextHand', seed: handSeed })
      continue
    }
    const seat = state.hand.currentSeat
    const move = botMove(state, seat, 'normal')
    if (move === null) throw new Error('bot found no move')
    const applied = applyMove(state, seat, move)
    if (!applied.okay) throw new Error(applied.error)
    state = applied.value
    steps.push({ kind: 'move', seat, move })
  }
  return { record: { seed, rules, steps }, final: state }
}

describe('replay', () => {
  it.each<[string, TableRules]>([
    ['classic', DEFAULT_TABLE_RULES],
    ['coinche', { ...DEFAULT_TABLE_RULES, variant: 'coinche', allTrumps: true }],
  ])('rebuilds a whole %s game to the identical state', (_name, rules) => {
    const { record, final } = recordedGame(42, rules)
    expect(final.phase).toBe('finished')
    expect(replay(record)).toEqual({ okay: true, value: final })
  })

  it('survives a JSON round trip, the form a record is logged in', () => {
    const { record, final } = recordedGame(7, DEFAULT_TABLE_RULES)
    const parsed = JSON.parse(JSON.stringify(record)) as GameRecord
    expect(replay(parsed)).toEqual({ okay: true, value: final })
  })

  it('stops part-way when asked, at the state before that step', () => {
    const { record } = recordedGame(3, DEFAULT_TABLE_RULES)
    const partial = replay(record, 5)
    expect(partial.okay && partial.value.hand.bids.length + partial.value.hand.trick.length).toBe(5)
  })

  it('names the first step the rules refuse', () => {
    const { record } = recordedGame(3, DEFAULT_TABLE_RULES)
    const first = record.steps[0] as Extract<GameStep, { kind: 'move' }>
    const broken: GameRecord = {
      ...record,
      steps: [first, { kind: 'move', seat: first.seat, move: first.move }],
    }
    expect(replay(broken)).toEqual({ okay: false, error: { step: 1, error: 'not_your_turn' } })
    expect(replay({ ...record, steps: [{ kind: 'nextHand', seed: 1 }] })).toEqual({
      okay: false,
      error: { step: 0, error: 'hand_not_done' },
    })
  })
})
