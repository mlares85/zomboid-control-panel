import type { FieldHelpData } from '../types'
import { INI_HELP } from './ini'
import { SANDBOX_HELP } from './sandbox'

// Field-level help for the Server Configuration page (live INI + sandbox
// editor). Data lives in ./ini.ts and ./sandbox.ts to stay under the file
// line limit; this module just merges them and resolves lookups. Not every
// one of the 400+ settings needs an entry — IniSettingRow/SandboxSettingRow
// simply omit the help icon when none exists, so add entries as they come
// up rather than trying to cover everything up front.
const SERVER_CONFIG_HELP: Record<string, FieldHelpData> = { ...INI_HELP, ...SANDBOX_HELP }

/**
 * Looks up help text for a Server Config field. Sandbox settings may pass a
 * `section` to resolve keys that repeat across sections (e.g. "Strength");
 * INI settings have no sections and can omit it.
 */
export function getServerConfigHelp(key: string, section?: string): FieldHelpData | undefined {
  if (section) {
    const composite = SERVER_CONFIG_HELP[`${section}:${key}`]
    if (composite) return composite
  }
  return SERVER_CONFIG_HELP[key]
}
