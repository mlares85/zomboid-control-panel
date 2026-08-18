import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const E2E_USERNAME = process.env.E2E_USERNAME || 'e2e_admin'
const E2E_PASSWORD = process.env.E2E_PASSWORD || 'E2eTestPassword123!'

export const DOCKER_STATE_PATH = path.join(__dirname, '.docker-state.json')

interface DockerStatus {
  available: boolean
}

interface Prerequisites {
  dockerAvailable: boolean
  baseVolume: { exists: boolean; populated: boolean }
}

interface AvailablePorts {
  gamePort: number
  rconPort: number
}

interface ManagedServerConfig {
  serverName: string
  gamePort: number
  rconPort: number
  rconPassword: string
}

interface CreateServerResult {
  success: boolean
  server?: Record<string, unknown>
  containerId?: string
  error?: string
}

interface DeleteServerResult {
  success: boolean
}

export interface DockerState {
  serverId: string
  containerId: string
  token: string
}

async function apiFetch(
  urlPath: string,
  token: string,
  options: RequestInit = {},
): Promise<Response> {
  return fetch(`${BASE}${urlPath}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string>),
    },
  })
}

export async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: E2E_USERNAME, password: E2E_PASSWORD }),
  })
  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${await res.text()}`)
  }
  const body = (await res.json()) as { success: boolean; accessToken: string }
  return body.accessToken
}

export async function getDockerStatus(
  token: string,
): Promise<DockerStatus> {
  const res = await apiFetch('/api/docker/status', token)
  if (!res.ok) {
    throw new Error(`Docker status failed: ${res.status}`)
  }
  return res.json() as Promise<DockerStatus>
}

export async function getPrerequisites(
  token: string,
): Promise<Prerequisites> {
  const res = await apiFetch('/api/docker/managed/prerequisites', token)
  if (!res.ok) {
    throw new Error(`Prerequisites check failed: ${res.status}`)
  }
  return res.json() as Promise<Prerequisites>
}

export async function getAvailablePorts(
  token: string,
): Promise<AvailablePorts> {
  const res = await apiFetch('/api/docker/managed/available-ports', token)
  if (!res.ok) {
    throw new Error(`Available ports check failed: ${res.status}`)
  }
  return res.json() as Promise<AvailablePorts>
}

export async function createManagedServer(
  token: string,
  config: ManagedServerConfig,
): Promise<CreateServerResult> {
  const res = await apiFetch('/api/docker/managed/servers', token, {
    method: 'POST',
    body: JSON.stringify(config),
  })
  if (!res.ok) {
    const text = await res.text()
    return { success: false, error: `${res.status}: ${text}` }
  }
  return res.json() as Promise<CreateServerResult>
}

export async function deleteManagedServer(
  token: string,
  serverId: string,
  removeData = true,
): Promise<DeleteServerResult> {
  const qs = removeData ? '?removeData=true' : ''
  const res = await apiFetch(
    `/api/docker/managed/servers/${serverId}${qs}`,
    token,
    { method: 'DELETE' },
  )
  if (!res.ok) {
    throw new Error(`Delete server failed: ${res.status}`)
  }
  return res.json() as Promise<DeleteServerResult>
}

// Server status response is a composed, multi-signal object whose shape
// varies by provider — typed loosely on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getServerStatus(token: string): Promise<any> {
  const res = await apiFetch('/api/servers/active/status', token)
  if (!res.ok) {
    throw new Error(`Server status failed: ${res.status}`)
  }
  return res.json()
}

export async function waitForRcon(
  token: string,
  timeoutMs = 120_000,
): Promise<boolean> {
  const start = Date.now()
  const interval = 5_000

  while (Date.now() - start < timeoutMs) {
    try {
      const status = await getServerStatus(token)
      if (status?.rcon?.connected) return true
    } catch {
      // Server may not be ready yet — keep polling
    }
    await new Promise((r) => setTimeout(r, interval))
  }
  return false
}

export async function stopContainer(
  token: string,
  containerId: string,
): Promise<void> {
  const res = await apiFetch(
    `/api/docker/containers/${containerId}/stop`,
    token,
    { method: 'POST' },
  )
  if (!res.ok) {
    throw new Error(`Stop container failed: ${res.status}`)
  }
}

export async function startContainer(
  token: string,
  containerId: string,
): Promise<void> {
  const res = await apiFetch(
    `/api/docker/containers/${containerId}/start`,
    token,
    { method: 'POST' },
  )
  if (!res.ok) {
    throw new Error(`Start container failed: ${res.status}`)
  }
}
