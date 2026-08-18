import { test as setup } from '@playwright/test'
import fs from 'fs'
import {
  login,
  getPrerequisites,
  getAvailablePorts,
  createManagedServer,
  waitForRcon,
  deleteManagedServer,
  DOCKER_STATE_PATH,
  type DockerState,
} from './helpers'

const SERVER_NAME = 'e2e-test-server'
const RCON_PASSWORD = 'E2eRconPass123'

setup('spin up Docker PZ server', async () => {
  let token: string | undefined
  let serverId: string | undefined

  try {
    token = await login()

    const prereqs = await getPrerequisites(token)
    if (!prereqs.dockerAvailable) {
      setup.skip(true, 'Docker is not available — skipping integration tests')
      return
    }
    if (!prereqs.baseVolume?.exists || !prereqs.baseVolume?.populated) {
      setup.skip(
        true,
        'Base volume is not populated — run the base-volume setup in the panel first',
      )
      return
    }

    const ports = await getAvailablePorts(token)

    const result = await createManagedServer(token, {
      serverName: SERVER_NAME,
      gamePort: ports.gamePort,
      rconPort: ports.rconPort,
      rconPassword: RCON_PASSWORD,
    })

    if (!result.success) {
      throw new Error(`Failed to create managed server: ${result.error}`)
    }

    serverId = (result.server as Record<string, unknown>)?.id as string
    const containerId = result.containerId

    if (!serverId || !containerId) {
      throw new Error(
        `Server created but missing ids — serverId: ${serverId}, containerId: ${containerId}`,
      )
    }

    const rconReady = await waitForRcon(token, 120_000)
    if (!rconReady) {
      throw new Error('RCON did not become available within 120 seconds')
    }

    const state: DockerState = { serverId, containerId, token }
    fs.writeFileSync(DOCKER_STATE_PATH, JSON.stringify(state, null, 2))
  } catch (err) {
    // Clean up the server if we created one but a later step failed
    if (serverId && token) {
      await deleteManagedServer(token, serverId, true).catch(() => {})
    }
    throw err
  }
})
