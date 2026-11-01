import { describe, expect, it } from 'vitest'
import { buildDeck, cardPoints, legalCards, winningIndex } from './cards.js'
import { cards, trick } from './test-helpers.js'
import type { Trump } from './types.js'

const strict = { pisse: false, mustOvertrump: true }
const ids = (cs: { id: string }[]) => cs.map((x) => x.id).sort()

describe('deck and points', () => {
  it('has 32 distinct cards', () => {
    const deck = buildDeck()
    expect(new Set(deck.map((x) => x.id)).size).toBe(32)
  })

  it.each<Trump>(['S', 'H', 'AT', 'SA'])('is worth 152 card points at %s', (trump) => {
    expect(buildDeck().reduce((s, x) => s + cardPoints(x, trump), 0)).toBe(152)
  })
})

describe('trick winner', () => {
  it('highest of the led suit wins without trump', () => {
    expect(winningIndex(trick(0, '10H AH 7S KH'), 'S')).toBe(2)
    expect(winningIndex(trick(0, '10H AH 7C KH'), 'S')).toBe(1)
  })

  it('jack and nine rank top at trump', () => {
    expect(winningIndex(trick(0, 'AS 9S JS 10S'), 'S')).toBe(2)
  })

  it('every suit ranks as trump at tout atout, but off-suit never wins', () => {
    expect(winningIndex(trick(0, 'AH 9H JS 10H'), 'AT')).toBe(1)
  })

  it('sans atout ranks ace over ten over king', () => {
    expect(winningIndex(trick(0, 'KH 10H AH 9H'), 'SA')).toBe(2)
  })
})

describe('legal cards', () => {
  it('must follow suit', () => {
    expect(ids(legalCards(cards('7H KH JS 8C'), trick(1, 'AH'), 'S', strict, 2))).toEqual([
      '7H',
      'KH',
    ])
  })

  it('must climb at trump when able', () => {
    expect(ids(legalCards(cards('7S AS JC'), trick(1, '10S'), 'S', strict, 2))).toEqual(['AS'])
  })

  it('may play any trump when unable to climb', () => {
    expect(ids(legalCards(cards('7S 8S JC'), trick(1, 'JS'), 'S', strict, 2))).toEqual(['7S', '8S'])
  })

  it('must trump when void in the led suit and an opponent leads', () => {
    expect(ids(legalCards(cards('7S 8C JC'), trick(1, 'AH'), 'S', strict, 2))).toEqual(['7S'])
  })

  it('must overtrump an opponent who ruffed', () => {
    expect(ids(legalCards(cards('7S AS JC'), trick(0, 'AH 10S'), 'S', strict, 2))).toEqual(['AS'])
  })

  it('must undertrump when unable to overtrump', () => {
    expect(ids(legalCards(cards('7S 8S JC'), trick(0, 'AH JS'), 'S', strict, 2))).toEqual([
      '7S',
      '8S',
    ])
  })

  it('without pisse, must trump even when the partner holds the trick', () => {
    expect(ids(legalCards(cards('7S 8C'), trick(0, 'AH 7H'), 'S', strict, 2))).toEqual(['7S'])
  })

  it('with pisse, may discard when the partner holds the trick', () => {
    const rules = { pisse: true, mustOvertrump: true }
    expect(ids(legalCards(cards('7S 8C'), trick(0, 'AH 7H'), 'S', rules, 2))).toEqual(['7S', '8C'])
  })

  it('never has to overtrump the partner', () => {
    expect(ids(legalCards(cards('7S AS 8C'), trick(0, 'AH 10S'), 'S', strict, 3))).toEqual([
      '7S',
      'AS',
    ])
  })

  it('may discard anything without trump in hand', () => {
    expect(ids(legalCards(cards('7D 8C'), trick(1, 'AH'), 'S', strict, 2))).toEqual(['7D', '8C'])
  })

  it('must climb in the led suit at tout atout', () => {
    expect(ids(legalCards(cards('7H 9H JS'), trick(1, 'AH'), 'AT', strict, 2))).toEqual(['9H'])
  })

  it('only follows at sans atout', () => {
    expect(ids(legalCards(cards('7H AH JS'), trick(1, '10H'), 'SA', strict, 2))).toEqual([
      '7H',
      'AH',
    ])
  })

  it('without the climb rule any trump of the led suit goes', () => {
    const lax = { pisse: false, mustOvertrump: false }
    expect(ids(legalCards(cards('7S AS'), trick(1, '10S'), 'S', lax, 2))).toEqual(['7S', 'AS'])
  })
})
