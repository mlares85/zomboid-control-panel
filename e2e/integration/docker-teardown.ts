import { test as teardown } from '@playwright/test'
import fs from 'fs'
import {
  deleteManagedServer,
  DOCKER_STATE_PATH,
  type DockerState,
} from './helpers'

teardown('tear down Docker PZ server', async () => {
  if (!fs.existsSync(DOCKER_STATE_PATH)) {
    console.log('No .docker-state.json found — nothing to tear down')
    return
  }

  const state: DockerState = JSON.parse(
    fs.readFileSync(DOCKER_STATE_PATH, 'utf-8'),
  )

  await deleteManagedServer(state.token, state.serverId, true)
  fs.unlinkSync(DOCKER_STATE_PATH)
})
