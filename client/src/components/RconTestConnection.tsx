import { useState } from 'react'
import { CheckCircle2, KeyRound, Loader2, WifiOff } from 'lucide-react'
import { Button } from './ui/button'
import { rconApi } from '@/lib/api'

type TestState = 'idle' | 'testing' | 'ok' | 'auth-failed' | 'unreachable'

interface RconTestConnectionProps {
  host: string
  port: number
  password: string
  disabled?: boolean
  onResult?: (state: 'ok' | 'auth-failed' | 'unreachable') => void
}

/**
 * "Test connection" button + inline status used wherever a server's RCON
 * host/port/password is being entered (ConfigureStep, VerifyStep). Connects
 * the panel's shared RCON service to the given credentials — the same
 * action the Dashboard's "Connect RCON" quick action performs — and reports
 * back whether it worked, and if not, whether that looks like a network
 * problem or a wrong password.
 */
export function RconTestConnection({ host, port, password, disabled, onResult }: RconTestConnectionProps) {
  const [state, setState] = useState<TestState>('idle')
  const [message, setMessage] = useState('')

  const runTest = async () => {
    setState('testing')
    setMessage('')
    try {
      await rconApi.connect(host, port, password)
      setState('ok')
      onResult?.('ok')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      const authFailed = /authentication|password/i.test(msg)
      setState(authFailed ? 'auth-failed' : 'unreachable')
      setMessage(msg)
      onResult?.(authFailed ? 'auth-failed' : 'unreachable')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={runTest}
        disabled={disabled || state === 'testing' || !host || !port}
      >
        {state === 'testing' ? (
          <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Testing...</>
        ) : (
          <><KeyRound className="w-3.5 h-3.5 mr-1.5" /> Test Connection</>
        )}
      </Button>
      {state === 'ok' && (
        <span className="flex items-center gap-1 text-xs text-primary">
          <CheckCircle2 className="w-3.5 h-3.5" /> Connected
        </span>
      )}
      {state === 'auth-failed' && (
        <span className="text-xs text-destructive">Wrong RCON password</span>
      )}
      {state === 'unreachable' && (
        <span className="flex items-center gap-1 text-xs text-destructive" title={message}>
          <WifiOff className="w-3.5 h-3.5" /> Unreachable
        </span>
      )}
    </div>
  )
}
