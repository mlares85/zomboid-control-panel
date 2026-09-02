# Locale Files

Each subdirectory is one language (e.g., `en/`, `fr/`, `de/`). Inside each
directory, namespace files (`*.json`) organize translations by page or
feature area.

## Adding a language

1. Create `client/src/locales/<code>/` with the same namespace files as
   English. Every key in every English file must have a corresponding key
   in the new locale (the parity test enforces this).
2. Add one row to `client/src/i18n/languages.ts` — nothing else should
   need to change. The `import.meta.glob` in `i18n/index.ts` discovers
   new files at build time.

## Adding a namespace

Create a new `<namespace>.json` in the English directory. If the same
namespace exists in other language directories, those translations are
picked up automatically. Missing keys fall through to English.

## Key naming

Use dot-separated paths: `"section.subsection.label"`. The top-level
key in the JSON groups related translations (e.g., `"nav"`, `"common"`,
`"status"`).
