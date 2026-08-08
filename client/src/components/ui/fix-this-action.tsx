import { useNavigate } from 'react-router-dom'
import { ToastAction } from '@/components/ui/toast'

// Rendered inside a toast when the server error response includes a
// `fixUrl` — takes the user straight to the Settings page that resolves it
// instead of leaving them to guess where the fix lives.
export function FixThisAction({ fixUrl }: { fixUrl: string }) {
  const navigate = useNavigate()
  return (
    <ToastAction altText="Fix this" onClick={() => navigate(fixUrl)}>
      Fix this →
    </ToastAction>
  )
}
