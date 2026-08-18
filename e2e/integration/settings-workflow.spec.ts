import { test, expect } from './integration-fixtures'

test.describe('settings workflow', () => {
  async function goToSettings(page: import('@playwright/test').Page) {
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('link', { name: 'Panel Settings', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible({ timeout: 15_000 })
  }

  test('RCON tab shows current config fields', async ({ dashboard: page }) => {
    await goToSettings(page)
    await page.getByRole('tab', { name: 'RCON' }).click()

    // The RCON/connection tab shows auto-reconnect and auto-start controls
    await expect(page.getByText(/Auto-reconnect/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel(/Start the game server when the panel starts/i)).toBeVisible()
  })

  test('change a safe setting and save', async ({ dashboard: page }) => {
    test.slow()
    await goToSettings(page)

    // Switch to Backups tab in settings — it has "Maximum Backups" which is safe
    await page.getByRole('tab', { name: 'Backups' }).click()
    await expect(page).toHaveURL(/[?&]tab=backups/)

    // Wait for the backups settings to render
    await expect(page.getByText(/Backup/i).first()).toBeVisible({ timeout: 10_000 })

    // Toggle auto-start server on the RCON tab instead — it is a checkbox
    await page.getByRole('tab', { name: 'RCON' }).click()

    const autoStartSwitch = page.getByLabel(/Start the game server when the panel starts/i)
    await expect(autoStartSwitch).toBeVisible({ timeout: 10_000 })

    // Read current state, toggle it
    const wasChecked = await autoStartSwitch.isChecked()
    await autoStartSwitch.click()

    // The save button should become enabled (dirty state)
    const saveButton = page.getByRole('button', { name: /Save Settings/i })
    await expect(saveButton).toBeEnabled({ timeout: 5_000 })
    await saveButton.click()

    // Wait for the save to complete — button text changes back to "No Unsaved Changes"
    await expect(page.getByRole('button', { name: /No Unsaved Changes/i })).toBeVisible({ timeout: 10_000 })

    // Refresh the page and verify the setting persisted
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('tab', { name: 'RCON' }).click()

    const refreshedSwitch = page.getByLabel(/Start the game server when the panel starts/i)
    await expect(refreshedSwitch).toBeVisible({ timeout: 10_000 })

    const nowChecked = await refreshedSwitch.isChecked()
    expect(nowChecked).toBe(!wasChecked)

    // Restore original value
    await refreshedSwitch.click()
    await page.getByRole('button', { name: /Save Settings/i }).click()
    await expect(page.getByRole('button', { name: /No Unsaved Changes/i })).toBeVisible({ timeout: 10_000 })
  })
})
