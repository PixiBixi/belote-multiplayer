import { applyMove, createGame, nextHand } from './game.js'
import type { GameState, Move, Result, RuleViolation, TableRules } from './types.js'
import { err, ok } from './types.js'
import type { DeckSeed } from './rng.js'

/** One thing that happened to a game: a seat's move, or the next hand being dealt. */
export type GameStep =
  { kind: 'move'; seat: number; move: Move } | { kind: 'nextHand'; seed: DeckSeed }

/** Everything needed to rebuild a game exactly: the engine is deterministic from here. */
export type GameRecord = { seed: DeckSeed; rules: TableRules; steps: GameStep[] }

export type ReplayError = { step: number; error: RuleViolation | 'hand_not_done' }

/**
 * Rebuilds the state a record leads to. A step the rules refuse stops the replay and
 * names its index, which is how a reported bug is pinned to the move that caused it.
 */
export function replay(
  record: GameRecord,
  upTo = record.steps.length,
): Result<GameState, ReplayError> {
  let state = createGame({ seed: record.seed, rules: record.rules })
  for (let i = 0; i < Math.min(upTo, record.steps.length); i++) {
    const step = record.steps[i] as GameStep
    if (step.kind === 'nextHand') {
      if (state.phase === 'finished' || state.hand.phase !== 'done')
        return err({ step: i, error: 'hand_not_done' })
      state = nextHand(state, step.seed)
      continue
    }
    const applied = applyMove(state, step.seat, step.move)
    if (!applied.okay) return err({ step: i, error: applied.error })
    state = applied.value
  }
  return ok(state)
}
