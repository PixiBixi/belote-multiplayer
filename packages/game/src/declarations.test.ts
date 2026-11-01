import { describe, expect, it } from 'vitest'
import { compareDeclarations, declarationWinner, findDeclarations } from './declarations.js'
import { cards } from './test-helpers.js'

describe('findDeclarations', () => {
  it('finds a tierce', () => {
    const found = findDeclarations(cards('7H 8H 9H KS AC'))
    expect(found).toMatchObject([{ kind: 'tierce', points: 20, top: '9', suit: 'H' }])
  })

  it('counts a run of five or more as a cent', () => {
    expect(findDeclarations(cards('9S 10S JS QS KS AS'))).toMatchObject([
      { kind: 'cent', points: 100, top: 'A' },
    ])
  })

  it('finds a cinquante and splits runs at a gap', () => {
    const found = findDeclarations(cards('7C 8C 9C 10C QC KC AC'))
    expect(found.map((d) => d.kind)).toEqual(['cinquante', 'tierce'])
  })

  it('scores carrés of jacks and nines above the rest, none for sevens', () => {
    expect(findDeclarations(cards('JS JH JD JC'))).toMatchObject([{ kind: 'carre', points: 200 }])
    expect(findDeclarations(cards('9S 9H 9D 9C'))).toMatchObject([{ kind: 'carre', points: 150 }])
    expect(findDeclarations(cards('7S 7H 7D 7C'))).toEqual([])
  })
})

describe('declaration ranking', () => {
  it('higher top wins between equal sequences, trump breaks a dead heat', () => {
    const [low] = findDeclarations(cards('7H 8H 9H'))
    const [high] = findDeclarations(cards('8S 9S 10S'))
    if (!low || !high) throw new Error('setup')
    expect(compareDeclarations(high, low, 'C')).toBeGreaterThan(0)
    const [a] = findDeclarations(cards('7H 8H 9H'))
    const [b] = findDeclarations(cards('7S 8S 9S'))
    if (!a || !b) throw new Error('setup')
    expect(compareDeclarations(b, a, 'S')).toBeGreaterThan(0)
    expect(compareDeclarations(b, a, 'C')).toBe(0)
  })

  it('awards the team with the best declaration, nobody on a tie', () => {
    const t1 = findDeclarations(cards('7H 8H 9H'))
    const c50 = findDeclarations(cards('7S 8S 9S 10S'))
    expect(declarationWinner([t1, c50, [], []], 'C')).toBe(1)
    const t2 = findDeclarations(cards('7C 8C 9C'))
    expect(declarationWinner([t1, t2, [], []], 'D')).toBeNull()
    expect(declarationWinner([[], [], [], []], 'D')).toBeNull()
  })
})
