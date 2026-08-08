export interface BridgeStatus {
  configured: boolean;
  bridgePath: string | null;
  isRunning: boolean;
  pendingCommands: number;
  modConnected: boolean;
  consecutiveFailures?: number;
  hasFileWatcher?: boolean;
  transport?: {
    type: "local" | "sftp";
    running: boolean;
    lastLatencyMs?: number | null;
    lastError?: string | null;
  };
  config?: {
    statusStaleMs: number;
    pollIntervalMs: number;
    statusCheckMs: number;
  };
  connection?: {
    healthy: boolean;
    canSendCommands: boolean;
    summary: string;
    issues: string[];
    checks: Record<string, boolean | number | null>;
  };
  statusFile?: {
    exists: boolean;
    path?: string;
    size?: number;
    modified?: string;
    age?: number;
    ageSeconds?: number;
    error?: string;
  };
  modStatus: {
    alive: boolean;
    version: string;
    serverName: string;
    playerCount?: number;
    players: string[];
    path: string;
    timestamp: number;
    age?: number;
    error?: string;
  } | null;
  detectedPaths?: {
    serverName: string;
    installPath: string;
    zomboidDataPath: string;
  } | null;
}
