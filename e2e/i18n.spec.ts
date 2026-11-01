import { expect, test } from '@playwright/test'

test('French by default, English after switching on Home', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('Ton prénom')).toBeVisible()
  await expect(page.getByRole('button', { name: /Créer une table/ })).toBeVisible()

  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByLabel('Your name')).toBeVisible()
  await expect(page.getByRole('button', { name: /Create a table/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Play against the computer/ })).toBeVisible()
})
