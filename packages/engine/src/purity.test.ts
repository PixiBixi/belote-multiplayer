import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/* The engine must stay pure: deterministic and free of I/O, so games replay and the
   rules run anywhere. This scans the sources instead of trusting review to notice. */
const dir = import.meta.dirname
const sources = readdirSync(dir)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'test-helpers.ts')
  .map((f) => ({ file: f, text: readFileSync(join(dir, f), 'utf8') }))

const forbidden: [string, RegExp][] = [
  ['an import from outside the engine', /\bfrom\s+['"](?!\.\/)[^'"]+['"]/],
  ['a dynamic import', /\bimport\s*\(/],
  ['Math.random', /\bMath\.random\b/],
  ['the clock', /\bDate\.now\b|\bnew Date\b|\bperformance\.now\b/],
  ['timers', /\b(setTimeout|setInterval|setImmediate|queueMicrotask)\b/],
  ['I/O or the host', /\b(fetch|process|require|console|globalThis|window|document)\s*[.(]/],
  ['crypto', /\bcrypto\b/],
]

describe('engine purity', () => {
  it('finds sources to scan', () => {
    expect(sources.map((s) => s.file)).toContain('game.ts')
  })

  for (const [what, pattern] of forbidden) {
    it(`uses no ${what}`, () => {
      const offenders = sources.filter((s) => pattern.test(s.text)).map((s) => s.file)
      expect(offenders).toEqual([])
    })
  }
})
