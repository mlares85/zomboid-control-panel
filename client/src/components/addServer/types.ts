import type { EnvironmentMount, EnvironmentSnapshot } from '@/lib/api'

export type WizardStepId = 'environment' | 'server-type' | 'configure' | 'verify' | 'complete'

/** What the user chose to do on the ServerTypeStep. */
export type WizardIntent = 'detected' | 'new' | 'existing' | 'skip'

export interface WizardSelection {
  intent: WizardIntent
  mount?: EnvironmentMount
}

export type { EnvironmentMount, EnvironmentSnapshot }
