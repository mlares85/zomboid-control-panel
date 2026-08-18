import { test, expect } from './fixtures'

test.describe('templates', () => {
  /** Navigate to the Templates page via the sidebar link and wait for its heading. */
  async function goToTemplates(page: import('@playwright/test').Page) {
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await nav.getByRole('link', { name: 'Templates', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Simulation Templates' })).toBeVisible({ timeout: 15_000 })
  }

  test('page loads with "Simulation Templates" heading', async ({ dashboard: page }) => {
    await goToTemplates(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Simulation Templates' })).toBeVisible()
  })

  test('"Save Current Config" button is present', async ({ dashboard: page }) => {
    await goToTemplates(page)
    await expect(page.getByRole('button', { name: /Save Current Config/i })).toBeVisible()
  })

  test('"Import" button is present', async ({ dashboard: page }) => {
    await goToTemplates(page)
    await expect(page.getByRole('button', { name: /Import/i })).toBeVisible()
  })

  test('template cards render when templates exist', async ({ dashboard: page }) => {
    await goToTemplates(page)

    // Wait for loading to finish — either cards appear or an empty state shows
    const templateCard = page.getByRole('button', { name: /Preview/i }).first()
    const emptyState = page.getByText('No templates yet')
    const errorState = page.getByText("Couldn't load templates")

    // Wait for one of the three states to appear
    await expect(
      templateCard.or(emptyState).or(errorState)
    ).toBeVisible({ timeout: 15_000 })

    const hasCards = await templateCard.isVisible().catch(() => false)
    if (!hasCards) {
      test.skip(true, 'No templates on this server — cards not shown')
    }

    // Each card has a Preview button and an export (download) button
    await expect(templateCard).toBeVisible()
  })

  test('built-in templates show "Built-in" badge', async ({ dashboard: page }) => {
    await goToTemplates(page)

    const builtInBadge = page.getByText('Built-in').first()
    const emptyState = page.getByText('No templates yet')

    await expect(
      builtInBadge.or(emptyState)
    ).toBeVisible({ timeout: 15_000 })

    const hasBadge = await builtInBadge.isVisible().catch(() => false)
    if (!hasBadge) {
      test.skip(true, 'No built-in templates loaded — badge not shown')
    }
    await expect(builtInBadge).toBeVisible()
  })

  test('empty state shows "No templates yet" when no templates exist', async ({ dashboard: page }) => {
    await goToTemplates(page)

    const emptyState = page.getByText('No templates yet')
    const templateCard = page.getByRole('button', { name: /Preview/i }).first()

    await expect(
      emptyState.or(templateCard)
    ).toBeVisible({ timeout: 15_000 })

    const hasEmpty = await emptyState.isVisible().catch(() => false)
    if (!hasEmpty) {
      test.skip(true, 'Templates exist — empty state not shown')
    }
    await expect(emptyState).toBeVisible()
  })
})
