import { useState } from 'react'
import { CheckCircle2, ExternalLink, Loader2, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { backupApi, BackupDestination } from '@/lib/api'

const DEFAULT_REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'

interface GoogleDriveSetupProps {
  destination: BackupDestination
  onUpdated: () => void
}

// Manual OAuth code-paste flow: the server has no fixed public redirect URI,
// so the user gets an authorization link, approves access in Google's UI,
// then pastes the resulting code back here.
export function GoogleDriveSetup({ destination, onUpdated }: GoogleDriveSetupProps) {
  const { toast } = useToast()
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [redirectUri, setRedirectUri] = useState(DEFAULT_REDIRECT_URI)
  const [code, setCode] = useState('')
  const [gettingLink, setGettingLink] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [linkOpened, setLinkOpened] = useState(false)

  // Non-secret marker the server may store on the destination's config once
  // the OAuth handshake succeeds. Secrets themselves are never sent back.
  const connected = Boolean(destination.config?.['connected'])

  const handleGetLink = async () => {
    if (!clientId.trim()) {
      toast({ title: 'Client ID Required', description: 'Enter the OAuth Client ID from Google Cloud Console.', variant: 'destructive' })
      return
    }
    setGettingLink(true)
    try {
      const result = await backupApi.gdriveAuthUrl({ clientId: clientId.trim(), redirectUri: redirectUri.trim() || DEFAULT_REDIRECT_URI })
      window.open(result.url, '_blank', 'noopener,noreferrer')
      setLinkOpened(true)
    } catch (error) {
      toast({ title: 'Could Not Get Authorization Link', description: error instanceof Error ? error.message : 'Failed to build the auth URL', variant: 'destructive' })
    } finally {
      setGettingLink(false)
    }
  }

  const handleConnect = async () => {
    if (!code.trim() || !clientSecret.trim()) {
      toast({
        title: 'Missing Information',
        description: 'Enter the Client Secret and paste the authorization code Google gave you.',
        variant: 'destructive',
      })
      return
    }
    setConnecting(true)
    try {
      const result = await backupApi.gdriveCallback({
        destinationId: destination.id,
        code: code.trim(),
        redirectUri: redirectUri.trim() || DEFAULT_REDIRECT_URI,
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
      })
      if (result.success) {
        toast({ title: 'Google Drive Connected', description: `${destination.name} is now linked.`, variant: 'success' as const })
        setCode('')
        onUpdated()
      } else {
        toast({ title: 'Connection Failed', description: result.message || 'Google rejected the authorization code.', variant: 'destructive' })
      }
    } catch (error) {
      toast({ title: 'Connection Failed', description: error instanceof Error ? error.message : 'Failed to connect Google Drive', variant: 'destructive' })
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="space-y-4 rounded-md border border-border/50 bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Google Drive OAuth</span>
        {connected ? (
          <Badge variant="success" className="gap-1"><CheckCircle2 className="w-3 h-3" />Connected</Badge>
        ) : (
          <Badge variant="secondary">Not Connected</Badge>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`gdrive-client-${destination.id}`}>OAuth Client ID</Label>
        <Input
          id={`gdrive-client-${destination.id}`}
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="xxxxxxxx.apps.googleusercontent.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`gdrive-secret-${destination.id}`}>OAuth Client Secret</Label>
        <Input
          id={`gdrive-secret-${destination.id}`}
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder="Client secret from Google Cloud Console"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`gdrive-redirect-${destination.id}`}>Redirect URI</Label>
        <Input
          id={`gdrive-redirect-${destination.id}`}
          value={redirectUri}
          onChange={(e) => setRedirectUri(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Must match a redirect URI registered for this Client ID in Google Cloud Console.</p>
      </div>

      <Button variant="outline" size="sm" onClick={handleGetLink} disabled={gettingLink} className="gap-2">
        {gettingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
        Get Authorization Link
      </Button>

      {linkOpened && (
        <div className="space-y-2 pt-2 border-t border-border/40">
          <Label htmlFor={`gdrive-code-${destination.id}`}>Authorization Code</Label>
          <Input
            id={`gdrive-code-${destination.id}`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste the code Google gave you"
          />
          <Button size="sm" onClick={handleConnect} disabled={connecting} className="gap-2">
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Connect
          </Button>
        </div>
      )}
    </div>
  )
}
