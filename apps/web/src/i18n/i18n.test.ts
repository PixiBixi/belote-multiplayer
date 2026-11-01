import { describe, expect, it } from 'vitest'
import { CATALOGUES, LOCALES, detectLocale } from './index.js'
import type { Messages } from './messages.js'

/** Every leaf of a catalogue, as dotted paths, so two can be compared. */
const leaves = (value: unknown, prefix = ''): string[] => {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, prefix === '' ? key : `${prefix}.${key}`),
  )
}

describe('the catalogues', () => {
  it('cover exactly the same keys', () => {
    const [first, ...rest] = LOCALES.map((locale) => leaves(CATALOGUES[locale]).sort())
    for (const other of rest) expect(other).toEqual(first)
  })

  it('leave nothing empty', () => {
    const flat = (value: unknown): unknown[] =>
      typeof value === 'object' && value !== null ? Object.values(value).flatMap(flat) : [value]
    for (const locale of LOCALES) {
      const messages: Messages = CATALOGUES[locale]
      for (const entry of flat(messages)) {
        if (typeof entry === 'string') expect(entry.length).toBeGreaterThan(0)
      }
    }
  })

  it('cover every error code in both languages', () => {
    const codes = Object.keys(CATALOGUES.fr.error).sort()
    expect(Object.keys(CATALOGUES.en.error).sort()).toEqual(codes)
    expect(codes.length).toBeGreaterThan(10)
  })
})

describe('grammar each language owns', () => {
  it('names cards in each language, with its own preposition', () => {
    expect(CATALOGUES.fr.card('J', 'H')).toBe('Valet de cœur')
    expect(CATALOGUES.en.card('J', 'H')).toBe('Jack of hearts')
    expect(CATALOGUES.fr.rankShort.J).toBe('V')
    expect(CATALOGUES.en.rankShort.J).toBe('J')
  })

  it('pluralises tricks by each language’s own rule', () => {
    expect(CATALOGUES.fr.table.tricks(1)).toBe('1 pli')
    expect(CATALOGUES.fr.table.tricks(3)).toBe('3 plis')
    expect(CATALOGUES.en.table.tricks(1)).toBe('1 trick')
    expect(CATALOGUES.en.table.tricks(3)).toBe('3 tricks')
  })

  it('keeps the game’s own terms in both languages', () => {
    for (const locale of LOCALES) {
      const t = CATALOGUES[locale]
      expect(t.bidValue(250)).toMatch(/capot/i)
      expect(t.table.belote).toMatch(/belote/i)
      expect(t.table.rebelote).toMatch(/rebelote/i)
      expect(t.table.coinche).toMatch(/coinche/i)
      expect(t.table.surcoinche).toMatch(/surcoinche/i)
    }
  })

  it('writes an event as a whole sentence, or nothing for a silent one', () => {
    const name = (seat: number) => ['Ana', 'Ben', 'Cy', 'Di'][seat] ?? '?'
    for (const locale of LOCALES) {
      const t = CATALOGUES[locale]
      expect(t.event({ type: 'trickWon', seat: 1, points: 21 }, name)).toContain('Ben')
      expect(t.event({ type: 'trickWon', seat: 1, points: 21 }, name)).toContain('21')
      expect(
        t.event(
          { type: 'cardPlayed', seat: 0, card: { id: 'JH' as never, rank: 'J', suit: 'H' } },
          name,
        ),
      ).toBeNull()
    }
  })

  it('names a bid by its contract and trump', () => {
    expect(CATALOGUES.fr.bidBubble({ seat: 0, type: 'bid', value: 90, trump: 'H' })).toBe('90 Cœur')
    expect(CATALOGUES.en.bidBubble({ seat: 0, type: 'bid', value: 90, trump: 'H' })).toBe(
      '90 Hearts',
    )
    expect(CATALOGUES.en.bidBubble({ seat: 0, type: 'pass' })).toBe('Pass')
    expect(CATALOGUES.fr.bidBubble({ seat: 0, type: 'pass' })).toBe('Passe')
  })
})

describe('detectLocale', () => {
  it('prefers what was stored', () => {
    window.localStorage.setItem('belote.pref.locale', 'en')
    expect(detectLocale()).toBe('en')
    window.localStorage.clear()
  })

  it('ignores a stored value that is not a locale', () => {
    window.localStorage.setItem('belote.pref.locale', 'klingon')
    expect(LOCALES).toContain(detectLocale())
    window.localStorage.clear()
  })

  it('falls back to a locale that exists', () => {
    window.localStorage.clear()
    expect(LOCALES).toContain(detectLocale())
  })
})
