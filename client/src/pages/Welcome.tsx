import { useNavigate } from 'react-router-dom'
import { AddServerFlow } from '@/components/addServer/AddServerFlow'

/**
 * First-run destination after account creation (Setup.tsx navigates here).
 * Thin route wrapper around the shared AddServerFlow so it can use
 * useNavigate to land on the Dashboard once done or skipped.
 */
export default function Welcome() {
  const navigate = useNavigate()

  return (
    <AddServerFlow
      mode="firstRun"
      onComplete={() => navigate('/', { replace: true })}
    />
  )
}
