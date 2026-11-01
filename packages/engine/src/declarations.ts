import {
  RANKS,
  SUITS,
  teamOf,
  type Card,
  type Declaration,
  type Rank,
  type Team,
  type Trump,
} from './types.js'

const CARRE_POINTS: Partial<Record<Rank, number>> = {
  J: 200,
  '9': 150,
  A: 100,
  '10': 100,
  K: 100,
  Q: 100,
}

function sequenceOf(length: number): Pick<Declaration, 'kind' | 'points'> | null {
  if (length >= 5) return { kind: 'cent', points: 100 }
  if (length === 4) return { kind: 'cinquante', points: 50 }
  if (length === 3) return { kind: 'tierce', points: 20 }
  return null
}

/**
 * Every combination in a hand: the longest run per stretch of consecutive ranks in each
 * suit, and each carré worth something. A card may count in both a carré and a sequence.
 */
export function findDeclarations(hand: readonly Card[]): Declaration[] {
  const found: Declaration[] = []
  for (const suit of SUITS) {
    const held = new Set(hand.filter((c) => c.suit === suit).map((c) => c.rank))
    let run: Card[] = []
    const flush = () => {
      const seq = sequenceOf(run.length)
      const top = run[run.length - 1]
      if (seq && top) found.push({ ...seq, cards: run.map((c) => c.id), top: top.rank, suit })
      run = []
    }
    for (const rank of RANKS) {
      const card = hand.find((c) => c.suit === suit && c.rank === rank)
      if (held.has(rank) && card) run.push(card)
      else flush()
    }
    flush()
  }
  for (const rank of RANKS) {
    const points = CARRE_POINTS[rank]
    const cards = hand.filter((c) => c.rank === rank)
    if (points !== undefined && cards.length === 4) {
      found.push({ kind: 'carre', points, cards: cards.map((c) => c.id), top: rank })
    }
  }
  return found
}

/** Positive when `a` outranks `b`, zero on a true tie. */
export function compareDeclarations(a: Declaration, b: Declaration, trump: Trump): number {
  if (a.points !== b.points) return a.points - b.points
  const aCarre = a.kind === 'carre'
  const bCarre = b.kind === 'carre'
  if (aCarre !== bCarre) return aCarre ? 1 : -1
  const byTop = RANKS.indexOf(a.top) - RANKS.indexOf(b.top)
  if (byTop !== 0) return byTop
  const aTrump = a.suit !== undefined && a.suit === trump
  const bTrump = b.suit !== undefined && b.suit === trump
  if (aTrump !== bTrump) return aTrump ? 1 : -1
  return 0
}

/**
 * Only the team holding the single best declaration scores, and it then scores all of
 * its declarations. A dead heat between the teams' best means neither scores.
 */
export function declarationWinner(declared: readonly Declaration[][], trump: Trump): Team | null {
  let best: { team: Team; decl: Declaration } | null = null
  let tie = false
  declared.forEach((decls, seat) => {
    for (const decl of decls) {
      if (best === null) {
        best = { team: teamOf(seat), decl }
        continue
      }
      const cmp = compareDeclarations(decl, best.decl, trump)
      if (cmp > 0) {
        best = { team: teamOf(seat), decl }
        tie = false
      } else if (cmp === 0 && teamOf(seat) !== best.team) {
        tie = true
      }
    }
  })
  if (best === null || tie) return null
  return (best as { team: Team }).team
}
