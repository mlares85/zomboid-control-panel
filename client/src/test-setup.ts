import '@testing-library/jest-dom'

// Node >=22's built-in global `localStorage` shadows jsdom's Storage
// implementation and throws "not a function" on every call unless
// --localstorage-file is set, which breaks any component test that touches
// localStorage (e.g. the onboarding wizard's dismiss-to-localStorage
// pattern). Swap in a minimal in-memory Storage for the test environment
// only — production code is untouched.
class MemoryStorage implements Storage {
  private store = new Map<string, string>()

  get length() {
    return this.store.size
  }

  clear() {
    this.store.clear()
  }

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null
  }

  removeItem(key: string) {
    this.store.delete(key)
  }

  setItem(key: string, value: string) {
    this.store.set(key, String(value))
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  writable: true,
  configurable: true,
})
