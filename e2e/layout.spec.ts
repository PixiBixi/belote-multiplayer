import { expect, test } from '@playwright/test'
import { playSolo } from './helpers.js'
import { settle } from './settle.js'

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone', width: 390, height: 844 },
]

for (const { name, width, height } of VIEWPORTS) {
  test(`table fits the ${name} viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await playSolo(page, 'Ana')
    await settle(page)

    const m = await page.evaluate(() => {
      const root = document.documentElement
      const cards = [...document.querySelectorAll('.hand-fan .pcard')].map((el) => {
        const r = el.getBoundingClientRect()
        return { l: r.left, r: r.right, t: r.top, b: r.bottom }
      })
      return {
        scrollW: root.scrollWidth,
        clientW: root.clientWidth,
        vw: window.innerWidth,
        vh: window.innerHeight,
        cards,
      }
    })
    expect(m.scrollW).toBeLessThanOrEqual(m.clientW)
    expect(m.cards.length).toBeGreaterThan(0)
    for (const c of m.cards) {
      expect(c.l).toBeGreaterThanOrEqual(0)
      expect(c.t).toBeGreaterThanOrEqual(0)
      expect(c.r).toBeLessThanOrEqual(m.vw)
      expect(c.b).toBeLessThanOrEqual(m.vh)
    }
  })
}
