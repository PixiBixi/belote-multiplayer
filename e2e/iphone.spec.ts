import { devices, expect, test, type Page } from '@playwright/test'
import { createTable, playSolo } from './helpers.js'
import { settle } from './settle.js'

/* Safari's engine at Safari's viewports: WebKit sizes inputs and grids differently from Chrome. */
const PHONES = ['iPhone SE (3rd gen)', 'iPhone 15', 'iPhone 15 landscape'] as const

async function geometry(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const rect = (el: Element) => el.getBoundingClientRect()
    const outside = [...document.querySelectorAll('button, input, .hand-fan .pcard')]
      .filter((el) => !el.closest('.side-drawer') && rect(el).width > 0)
      .filter((el) => {
        const r = rect(el)
        return r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1
      })
      .map((el) => el.className || el.tagName)
    const centre = document.querySelector('.centre')
    const crowding = centre
      ? [...document.querySelectorAll('.seat-left .plate, .seat-right .plate')].filter((el) => {
          const a = rect(el)
          const b = rect(centre)
          return (
            a.right > b.left + 4 &&
            a.left < b.right - 4 &&
            a.bottom > b.top + 4 &&
            a.top < b.bottom - 4
          )
        }).length
      : 0
    return { hscroll: document.documentElement.scrollWidth > vw, outside, crowding }
  })
}

for (const name of PHONES) {
  test.describe(name, () => {
    // The project already runs WebKit; drop the preset's browser so use() stays in this worker.
    const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices[name]
    test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale: 'fr-FR' })

    test('home has no sideways scroll', async ({ page }) => {
      await page.goto('/')
      await settle(page)
      expect((await geometry(page)).hscroll).toBe(false)
    })

    test('lobby seats do not overlap and a seat change moves mine', async ({ page }) => {
      await createTable(page, 'Ana')
      await settle(page)
      const overlaps = () =>
        page.evaluate(() => {
          const seats = [...document.querySelectorAll('.lobby-head, .lobby-seat')].map((e) =>
            e.getBoundingClientRect(),
          )
          let n = 0
          for (let i = 0; i < seats.length; i++)
            for (let j = i + 1; j < seats.length; j++) {
              const a = seats[i]!
              const b = seats[j]!
              if (
                Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
                Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2
              )
                n++
            }
          return n
        })
      expect(await overlaps()).toBe(0)
      await page
        .locator('.lobby-seat.at-top')
        .getByRole('button', { name: /asseoir/ })
        .click()
      await expect(page.locator('.lobby-seat.mine')).toHaveClass(/at-top/)
    })

    test('table fits without overlap', async ({ page }) => {
      await playSolo(page, 'Ana')
      await settle(page)
      const g = await geometry(page)
      expect(g.hscroll).toBe(false)
      expect(g.outside).toEqual([])
      expect(g.crowding).toBe(0)

      // The chat drawer covers the phone: it must close from its button and from the backdrop.
      const drawer = page.locator('.side-drawer')
      await page.getByRole('button', { name: 'Discussion' }).click()
      await expect(drawer).toHaveClass(/open/)
      await drawer.getByRole('button', { name: 'Fermer' }).click()
      await expect(drawer).not.toHaveClass(/open/)
      await page.getByRole('button', { name: 'Discussion' }).click()
      await page.locator('.drawer-backdrop').click({ position: { x: 5, y: 300 } })
      await expect(drawer).not.toHaveClass(/open/)
    })
  })
}
