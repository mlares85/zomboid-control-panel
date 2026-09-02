import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { LANGUAGE_CODES, SOURCE_LANGUAGE } from './languages'

export { LANGUAGES, SOURCE_LANGUAGE, LANGUAGE_CODES } from './languages'
export type { LanguageDef } from './languages'
export type SupportedLanguage = string

export const LANGUAGE_STORAGE_KEY = 'zcp-language'

// Discovers every client/src/locales/<code>/<namespace>.json file at build
// time — no per-language, per-namespace import list to maintain. Adding a
// language folder (or a namespace file within one) is picked up here with
// no code change. See client/src/locales/README.md.
// i18next's own Resource type is this loose (ResourceKey = string | an
// object of unspecified shape), so `any` here matches its actual contract
// rather than fighting it with a narrower type that doesn't describe it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const localeModules = import.meta.glob('../locales/*/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const LOCALE_PATH_RE = /\.\.\/locales\/([^/]+)\/([^/]+)\.json$/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const resources: Record<string, Record<string, any>> = {}
for (const [filePath, mod] of Object.entries(localeModules)) {
  const match = filePath.match(LOCALE_PATH_RE)
  if (!match) continue
  const [, code, namespace] = match
  resources[code] ??= {}
  resources[code][namespace] = mod
}

// Detect the user's saved preference, falling back to browser language,
// then the source language.
function detectLanguage(): string {
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)
  if (saved && LANGUAGE_CODES.includes(saved)) return saved

  const browserLang = navigator.language
  // Exact match first (zh-CN), then base language (fr-FR → fr)
  if (LANGUAGE_CODES.includes(browserLang)) return browserLang
  const base = browserLang.split('-')[0]
  if (LANGUAGE_CODES.includes(base)) return base

  return SOURCE_LANGUAGE
}

i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: SOURCE_LANGUAGE,
  interpolation: {
    escapeValue: false, // React already escapes
  },
  // Use the first namespace found as default (typically 'common' or 'shell')
  defaultNS: 'shell',
  // Don't fail on missing keys during migration — show the key as-is
  parseMissingKeyHandler: (key: string) => key,
})

export default i18n
