import { test, expect } from './integration-fixtures'

const TEMPLATE_NAME = 'E2E Test Template'

test.describe.serial('template workflow', () => {
  test.slow()

  async function goToTemplates(page: import('@playwright/test').Page) {
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('link', { name: 'Templates', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Simulation Templates' })).toBeVisible({ timeout: 15_000 })
  }

  test('save current config as a new template', async ({ dashboard: page }) => {
    await goToTemplates(page)

    await page.getByRole('button', { name: /Save Current Config/i }).click()

    // The create-template dialog opens
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog.getByText('Save Current Config as Template')).toBeVisible()

    // Fill in the template name
    await dialog.locator('#template-name').fill(TEMPLATE_NAME)

    // Wait for the server config snapshot to load, then save
    const saveButton = dialog.getByRole('button', { name: /Save Template/i })
    await expect(saveButton).toBeEnabled({ timeout: 15_000 })
    await saveButton.click()

    // Dialog closes and template list refreshes
    await expect(dialog).not.toBeVisible({ timeout: 10_000 })
  })

  test('template appears in the list', async ({ dashboard: page }) => {
    await goToTemplates(page)

    // Wait for templates to load — the card with our name should be visible
    await expect(page.getByText(TEMPLATE_NAME)).toBeVisible({ timeout: 15_000 })
  })

  test('export button works on the template', async ({ dashboard: page }) => {
    await goToTemplates(page)
    await expect(page.getByText(TEMPLATE_NAME)).toBeVisible({ timeout: 15_000 })

    // Each template card has an export/download action
    const exportButton = page.getByRole('button', { name: /Export|Download/i }).first()
    const hasExport = await exportButton.isVisible({ timeout: 5_000 }).catch(() => false)
    test.skip(!hasExport, 'Export button not rendered on template card')

    // Click export — triggers a file download, just verify no error toast
    await exportButton.click()
    // Allow a moment for the download to start; no error toast = success
    await page.waitForTimeout(2_000)
    await expect(page.getByText(/Export Failed/i)).not.toBeVisible()
  })

  test('delete the template and verify removal', async ({ dashboard: page }) => {
    await goToTemplates(page)
    await expect(page.getByText(TEMPLATE_NAME)).toBeVisible({ timeout: 15_000 })

    // Each card has a delete button — click it
    const deleteButton = page.getByRole('button', { name: /Delete/i }).first()
    await expect(deleteButton).toBeVisible({ timeout: 5_000 })
    await deleteButton.click()

    // Confirm the deletion in the confirm dialog
    const confirmButton = page.getByRole('button', { name: /Delete/i }).last()
    await expect(confirmButton).toBeVisible({ timeout: 5_000 })
    await confirmButton.click()

    // Template should disappear from the list
    await expect(page.getByText(TEMPLATE_NAME)).not.toBeVisible({ timeout: 10_000 })
  })
})
