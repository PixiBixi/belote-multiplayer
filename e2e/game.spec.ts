import { expect, test } from '@playwright/test'
import { playHand, playSolo } from './helpers.js'

test.describe('a full hand against three bots', () => {
  test.setTimeout(120_000)

  test('classic', async ({ page }) => {
    await playSolo(page, 'Ana')
    await playHand(page, 'classic')
    await expect(page.locator('.result-card')).toBeVisible()
  })

  test('coinche', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Ton prénom').fill('Ana')
    await page.getByRole('button', { name: /Créer une table/ }).click()
    await page.getByRole('button', { name: 'Compléter avec des bots' }).click()
    await page.getByRole('radio', { name: /Coinche/ }).click()
    await expect(page.getByRole('radio', { name: /Coinche/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await page.getByRole('button', { name: 'Lancer la partie' }).click()
    await expect(page.locator('.hand-fan')).toBeVisible()
    await playHand(page, 'coinche')
    await expect(page.locator('.result-card')).toBeVisible()
  })
})
