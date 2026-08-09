import { ExternalLink, Shield } from 'lucide-react'

const FIREWALL_PORTS = [
  { proto: 'UDP', port: '16261', purpose: 'Game traffic' },
  { proto: 'TCP', port: '27015', purpose: 'RCON' },
]

const FIREWALL_HELP_URL =
  'https://support.microsoft.com/en-us/windows/allow-an-app-through-windows-defender-firewall'

/**
 * Reminder shown on the Complete step for Windows: PZ won't be reachable
 * from outside the LAN until these ports are allowed through Windows
 * Firewall. Links to Microsoft's instructions rather than trying to
 * automate a firewall rule change from the panel.
 */
export function WindowsFirewallGuide() {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/15 p-4 text-left">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">🪟 Windows Firewall</p>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Allow PZ through Windows Firewall so players outside your network can connect.
      </p>

      <ul className="mt-2.5 space-y-1.5">
        {FIREWALL_PORTS.map((p) => (
          <li
            key={p.port}
            className="flex items-center justify-between rounded-md border border-border/50 bg-background/40 px-2.5 py-1.5"
          >
            <span className="font-mono text-xs text-foreground/85">
              {p.proto} {p.port}
            </span>
            <span className="text-xs text-muted-foreground">{p.purpose}</span>
          </li>
        ))}
      </ul>

      <a
        href={FIREWALL_HELP_URL}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        Open Windows Firewall instructions <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  )
}
