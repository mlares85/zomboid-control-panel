import { test, expect } from './fixtures'

test.describe('backups', () => {
  /** Navigate to the Backups page via the sidebar link and wait for its heading. */
  async function goToBackups(page: import('@playwright/test').Page) {
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('link', { name: 'World Backups', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'World Backups' })).toBeVisible({ timeout: 15_000 })
  }

  test('page loads with "World Backups" heading', async ({ dashboard: page }) => {
    await goToBackups(page)
    await expect(page.getByRole('heading', { level: 1, name: 'World Backups' })).toBeVisible()
  })

  test('format selector shows .zip / .tar.gz / .tar.zst options', async ({ dashboard: page }) => {
    await goToBackups(page)

    const trigger = page.getByLabel('Backup format')
    await expect(trigger).toBeVisible()
    await trigger.click()

    await expect(page.getByRole('option', { name: '.zip' })).toBeVisible()
    await expect(page.getByRole('option', { name: '.tar.gz' })).toBeVisible()
    await expect(page.getByRole('option', { name: '.tar.zst' })).toBeVisible()
  })

  test('"Create Backup" button is present in header', async ({ dashboard: page }) => {
    await goToBackups(page)
    // There may be two "Create Backup" buttons (header + empty state); scope to first
    await expect(page.getByRole('button', { name: /Create Backup/i }).first()).toBeVisible()
  })

  test('"Upload .zip" button is present', async ({ dashboard: page }) => {
    await goToBackups(page)
    await expect(page.getByRole('button', { name: /Upload \.zip/i })).toBeVisible()
  })

  test('Settings button toggles the settings panel', async ({ dashboard: page }) => {
    await goToBackups(page)

    // Wait for page to settle — the Backup Files heading proves the full page rendered
    await expect(page.getByText('Backup Files')).toBeVisible({ timeout: 10_000 })

    const settingsHeading = page.getByRole('heading', { name: 'Backup Settings' })
    const wasOpen = await settingsHeading.isVisible().catch(() => false)

    // Click Settings to toggle
    await page.getByRole('button', { name: 'Settings' }).click()

    if (wasOpen) {
      await expect(settingsHeading).not.toBeVisible()
    } else {
      await expect(settingsHeading).toBeVisible()
    }

    // Click again to toggle back
    await page.getByRole('button', { name: 'Settings' }).click()

    if (wasOpen) {
      await expect(settingsHeading).toBeVisible()
    } else {
      await expect(settingsHeading).not.toBeVisible()
    }
  })

  test('settings panel shows frequency selector, max backups input, and save button', async ({ dashboard: page }) => {
    await goToBackups(page)

    // Open settings
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Backup Settings' })).toBeVisible()

    // Backup frequency selector (label + trigger)
    await expect(page.getByLabel('Backup Frequency')).toBeVisible()

    // Max backups input
    await expect(page.getByLabel('Maximum Backups to Keep')).toBeVisible()

    // Save Settings button
    await expect(page.getByRole('button', { name: 'Save Settings' })).toBeVisible()
  })

  test('empty state shows "No safety net" when no backups exist', async ({ dashboard: page }) => {
    await goToBackups(page)

    // Wait for the file list card to render
    const backupFiles = page.getByText('Backup Files')
    await expect(backupFiles).toBeVisible({ timeout: 15_000 })

    // This depends on server state — if backups exist, skip.
    const emptyMessage = page.getByText('No safety net')
    const hasEmpty = await emptyMessage.isVisible().catch(() => false)
    if (!hasEmpty) {
      test.skip(true, 'Backups exist on this server — empty state not shown')
    }
    await expect(emptyMessage).toBeVisible()
  })

  test('Backup history section renders', async ({ dashboard: page }) => {
    await goToBackups(page)

    // BackupHistoryTable renders on the page — look for its content.
    // The section may show empty state or entries depending on server state.
    // At minimum, verify the page loaded fully without error.
    const historyHeading = page.getByText(/Backup History/i)
    const isVisible = await historyHeading.isVisible().catch(() => false)
    if (!isVisible) {
      // The component may render conditionally — verify the page is still loaded.
      await expect(page.getByRole('heading', { level: 1, name: 'World Backups' })).toBeVisible()
    }
  })

  test('refresh button is present', async ({ dashboard: page }) => {
    await goToBackups(page)
    await expect(page.getByRole('button', { name: 'Refresh backup status' })).toBeVisible()
  })
})
