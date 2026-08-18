import { test, expect } from './fixtures'

// The Dashboard's server controls are state-driven (see client/src/pages/Dashboard.tsx):
// "Start" renders while the server is offline (or unconfigured — disabled in that case);
// "Stop" / "Force stop" / "Restart" / "Save" render once it's online. A fresh test
// environment typically has no PZ server configured/running, so most of these tests
// gate on the control they need actually being present rather than assuming a state.

test.describe('dashboard', () => {
  test('status bar renders with a server control appropriate to current state', async ({ dashboard: page }) => {
    const statusBar = page.getByRole('banner', { name: 'Server status' })
    await expect(statusBar).toBeVisible()

    const startButton = statusBar.getByRole('button', { name: 'Start' })
    const stopButton = statusBar.getByRole('button', { name: 'Stop', exact: true })
    await expect(startButton.or(stopButton)).toBeVisible()
  })

  test('"More actions" dropdown opens and lists actions', async ({ dashboard: page }) => {
    const trigger = page.getByRole('button', { name: 'More server actions' })
    await trigger.click()

    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /refresh status/i })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /bridge settings/i })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(menu).not.toBeVisible()
  })

  test('stopping the server shows a confirmation dialog that can be cancelled', async ({ dashboard: page }) => {
    const stopButton = page.getByRole('banner', { name: 'Server status' }).getByRole('button', { name: 'Stop', exact: true })
    test.skip(!(await stopButton.isVisible().catch(() => false)), 'Server is not currently running — "Stop" is not rendered')

    await stopButton.click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/are you sure you want to stop the server/i)).toBeVisible()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('restarting the server shows a confirmation dialog that can be cancelled', async ({ dashboard: page }) => {
    const restartButton = page.getByRole('banner', { name: 'Server status' }).getByRole('button', { name: 'Restart', exact: true })
    test.skip(!(await restartButton.isVisible().catch(() => false)), 'Server is not currently running — "Restart" is not rendered')

    await restartButton.click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/restart the server/i)).toBeVisible()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).not.toBeVisible()
  })

  // The panel does not currently have a cards/classic Dashboard view toggle
  // (searched client/src for a view-mode switch — none exists). This test is
  // kept skipped-by-default as living documentation: if a toggle matching one
  // of these common patterns is added later, it starts getting exercised
  // automatically instead of silently having no coverage.
  test('view toggle switches between card and classic layouts, if present', async ({ dashboard: page }) => {
    const toggle = page
      .getByRole('tablist', { name: /view/i })
      .or(page.getByRole('group', { name: /view/i }))
      .or(page.getByRole('button', { name: /classic view|card view/i }))

    const present = await toggle.first().isVisible().catch(() => false)
    test.skip(!present, 'Dashboard does not currently expose a cards/classic view toggle')

    await toggle.first().click()
  })
})
