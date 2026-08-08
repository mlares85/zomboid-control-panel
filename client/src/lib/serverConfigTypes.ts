import { SandboxData } from '@/lib/api'
import { INI_SCHEMA, SANDBOX_SCHEMA } from '@/lib/serverConfigSchema'

export type EditorMode = 'structured' | 'raw'
export type FilterMode = 'all' | 'modified' | 'nondefault'
export type SandboxScalar = string | number | boolean | null | undefined
export type SandboxRecord = Record<string, SandboxScalar>

// PanelBridge enumerates every sandbox option. These are Project Zomboid's
// built-in groups, which belong in the Sandbox editor rather than Mod Settings.
export const VANILLA_SANDBOX_GROUPS = new Set([
  'Vanilla',
  'Map',
  'ZombieLore',
  'ZombieConfig',
  'MultiplierConfig',
  'Basement',
])

// These were shown by older panel releases but Build 42 does not support them.
export const UNSUPPORTED_INI_KEYS = new Set([
  'ServerImageLoginScreen',
  'ServerImageLoadingScreen',
  'ServerImageIcon',
])

/** Merge schema defaults into parsed INI settings so schema-defined keys always exist.
 *  Also warns to the console when a stored value doesn't parse for the schema type — helps
 *  catch a corrupted INI without changing behaviour. */
export function mergeSchemaDefaults(parsed: Record<string, string>): Record<string, string> {
  const merged = { ...parsed }
  for (const setting of INI_SCHEMA) {
    if (!(setting.key in merged)) {
      merged[setting.key] = String(setting.default ?? '')
      continue
    }
    const raw = merged[setting.key]
    if (raw == null || raw === '') continue
    if (setting.type === 'boolean' && raw !== 'true' && raw !== 'false') {
      console.warn(`[ServerConfig] ${setting.key} expected boolean, got "${raw}"`)
    } else if (setting.type === 'number' && Number.isNaN(Number(raw))) {
      console.warn(`[ServerConfig] ${setting.key} expected number, got "${raw}"`)
    } else if (setting.type === 'select' && setting.options && !setting.options.some(o => o.value === raw)) {
      console.warn(`[ServerConfig] ${setting.key} expected one of [${setting.options.map(o => o.value).join('|')}], got "${raw}"`)
    }
  }
  return merged
}

export function createSandboxDefaults(): SandboxData {
  const sandbox: SandboxData = {
    VERSION: 4,
    settings: {},
    ZombieLore: {},
    ZombieConfig: {},
    MultiplierConfig: {},
    Map: {},
    Basement: {},
  }
  for (const setting of SANDBOX_SCHEMA) {
    const section = (setting.section || 'settings') as keyof SandboxData
    const values = sandbox[section]
    if (typeof values === 'object' && values !== null) {
      values[setting.key] = setting.default ?? ''
    }
  }
  return sandbox
}
