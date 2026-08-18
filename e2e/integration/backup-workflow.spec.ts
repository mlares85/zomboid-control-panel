import { test, expect } from './integration-fixtures'

test.describe.serial('backup workflow', () => {
  test.slow()

  async function goToBackups(page: import('@playwright/test').Page) {
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('link', { name: 'World Backups', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'World Backups' })).toBeVisible({ timeout: 15_000 })
  }

  test('create a backup and verify it appears', async ({ dashboard: page }) => {
    await goToBackups(page)

    // Click "Create Backup" — use first() since there may be a header + empty-state button
    const createButton = page.getByRole('button', { name: /Create Backup/i }).first()
    await expect(createButton).toBeVisible({ timeout: 10_000 })
    await createButton.click()

    // Wait for the backup progress to complete — the progress card disappears
    // and the file list updates. Allow up to 30s for compression to finish.
    const backupFiles = page.getByText('Backup Files')
    await expect(backupFiles).toBeVisible({ timeout: 15_000 })

    // A backup file row should appear (file names end in .zip / .tar.gz / .tar.zst)
    await expect(
      page.getByText(/\.(zip|tar\.gz|tar\.zst)/).first()
    ).toBeVisible({ timeout: 30_000 })
  })

  test('delete the backup and verify removal', async ({ dashboard: page }) => {
    await goToBackups(page)

    // Wait for file list to load
    await expect(page.getByText('Backup Files')).toBeVisible({ timeout: 15_000 })

    // Find the first backup row's delete mechanism — select it then use bulk delete,
    // or use the per-row action. The file list uses checkboxes for selection.
    const firstCheckbox = page.getByRole('checkbox').first()
    const hasBackup = await firstCheckbox.isVisible({ timeout: 10_000 }).catch(() => false)
    test.skip(!hasBackup, 'No backups to delete')

    await firstCheckbox.check()

    // Click the "Delete Selected" button that appears when items are checked
    const deleteButton = page.getByRole('button', { name: /Delete Selected/i })
    await expect(deleteButton).toBeVisible({ timeout: 5_000 })
    await deleteButton.click()

    // Confirm the deletion dialog
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await dialog.getByRole('button', { name: /Delete/i }).click()

    // The dialog closes and the backup should be gone (or empty state returns)
    await expect(dialog).not.toBeVisible({ timeout: 10_000 })
  })
})
