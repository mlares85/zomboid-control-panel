import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from './ui/input'

interface PasswordInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: string
  disabled?: boolean
  id?: string
  className?: string
  maxLength?: number
}

/**
 * Password field with a show/hide toggle. Extracted from the duplicated
 * pattern in Setup.tsx and Servers.tsx so RCON password entry (Setup wizard,
 * Servers dialogs, AddServerFlow) shares one implementation.
 */
export function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete = 'new-password',
  disabled,
  id,
  className,
  maxLength,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  const generatedId = useId()
  const inputId = id || generatedId

  return (
    <div className="relative">
      <Input
        id={inputId}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        maxLength={maxLength}
        className={className ? `pr-10 ${className}` : 'pr-10'}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        tabIndex={-1}
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}
