import { expect, test } from '@playwright/test'
import { createTable, joinTable, openPlayer } from './helpers.js'

test('host fills bots and changes rules, a guest joining by code sees them', async ({
  browser,
}) => {
  const host = await openPlayer(browser)
  const code = await createTable(host, 'Ana')

  await host.getByRole('button', { name: 'Compléter avec des bots' }).click()
  await expect(host.locator('.lobby-seat select')).toHaveCount(3)
  await expect(host.getByRole('button', { name: 'Lancer la partie' })).toBeEnabled()

  await host.getByRole('radio', { name: /Coinche/ }).click()
  await expect(host.getByRole('radio', { name: /Coinche/ })).toHaveAttribute('aria-checked', 'true')
  // Controls follow the server's view, so click then assert rather than check().
  await host.getByRole('switch', { name: /Pisser/ }).click()
  await expect(host.getByRole('switch', { name: /Pisser/ })).toBeChecked()
  await host.getByRole('switch', { name: /Annonces/ }).click()
  await expect(host.getByRole('switch', { name: /Annonces/ })).not.toBeChecked()
  await host.getByRole('button', { name: '1000', exact: true }).click()
  await expect(host.getByRole('button', { name: '1000', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // A seat is free for the guest once a bot leaves.
  await host.getByRole('button', { name: 'Retirer' }).first().click()
  await expect(host.locator('.lobby-seat select')).toHaveCount(2)

  const guest = await openPlayer(browser)
  await joinTable(guest, code, 'Ben')
  await expect(guest.locator('.lobby-code')).toContainText(code)
  await expect(guest.getByRole('radio', { name: /Coinche/ })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(guest.getByRole('switch', { name: /Pisser/ })).toBeChecked()
  await expect(guest.getByRole('switch', { name: /Annonces/ })).not.toBeChecked()
  await expect(guest.getByRole('button', { name: '1000', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  // A guest cannot configure the table.
  await expect(guest.getByRole('switch', { name: /Pisser/ })).toBeDisabled()
})
