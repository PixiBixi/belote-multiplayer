import { expect, type Browser, type Locator, type Page } from '@playwright/test'

/** One player is one browser context: its own localStorage, its own socket. */
export async function openPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ locale: 'fr-FR' })
  return context.newPage()
}

async function enterName(page: Page, name: string): Promise<void> {
  await page.goto('/')
  await page.getByLabel('Ton prénom').fill(name)
}

/** Creates a table and returns its code, read from the invitation link. */
export async function createTable(page: Page, name: string): Promise<string> {
  await enterName(page, name)
  await page.getByRole('button', { name: /Créer une table/ }).click()
  await expect(page.locator('.lobby-code')).toContainText('Table')
  const text = (await page.locator('.lobby-code').textContent()) ?? ''
  const code = /Table\s+(\S+)/.exec(text)?.[1]
  if (code === undefined) throw new Error('no table code was shown')
  return code
}

export async function joinTable(page: Page, code: string, name: string): Promise<void> {
  await enterName(page, name)
  await page.getByLabel('Code de la table').fill(code)
  await page.getByRole('button', { name: 'Rejoindre', exact: true }).click()
}

export async function playSolo(page: Page, name: string): Promise<void> {
  await enterName(page, name)
  await page.getByRole('button', { name: /Jouer contre l’ordinateur/ }).click()
  // Solo stops in the lobby with three bots seated, so the rules can be set first.
  await expect(page.locator('.lobby-seat.mine')).toBeVisible()
  await expect(page.locator('.lobby-seat .seat-empty')).toHaveCount(0)
  await page.locator('.lobby-actions .btn-primary:not([disabled])').click()
  await expect(page.locator('.hand-fan')).toBeVisible()
}

/** Tolerant click: the table re-renders constantly, so a miss is retried by the caller. */
async function tryClick(target: Locator): Promise<boolean> {
  try {
    await target.first().click({ timeout: 400 })
    return true
  } catch {
    return false
  }
}

/** Plays legal moves (bid, declare, card) until the hand result panel shows. */
export async function playHand(page: Page, variant: 'classic' | 'coinche'): Promise<void> {
  const result = page.locator('.result-card')
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (await result.isVisible()) return
    if (variant === 'classic') {
      if (await tryClick(page.locator('.bid-panel .bid-take'))) continue
    } else if (await page.locator('.bid-panel.coinche').isVisible()) {
      await tryClick(page.locator('.bid-panel .chip-trump'))
      if (await tryClick(page.locator('.bid-panel .btn-primary:not([disabled])'))) continue
    }
    if (await tryClick(page.locator('.bid-panel .bid-pass, .bid-panel .btn-ghost'))) continue
    await tryClick(page.locator('.declare-btn'))
    if (await tryClick(page.locator('.hand-fan .is-playable'))) continue
    await page.waitForTimeout(150)
  }
  throw new Error('the hand did not reach its result panel')
}
