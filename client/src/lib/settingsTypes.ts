export interface AppSettings {
  // Bridge Settings
  panelBridgeAutoUpdate: boolean;
  panelBridgeSftpEnabled: boolean;
  panelBridgeSftpHost: string;
  panelBridgeSftpPort: string;
  panelBridgeSftpUsername: string;
  panelBridgeSftpPassword: string;
  panelBridgeSftpBridgePath: string;
  panelBridgeSftpPollIntervalSeconds: string;
  panelBridgeSftpLogPath: string;
  panelBridgeSftpConfigPath: string;

  // Server automation
  autoStartServer: boolean;
  autoExportOnLogin: boolean;
  autoExportMaxPerPlayer: string;

  // Mod Checker Settings
  modCheckInterval: string;
  modAutoRestart: boolean;
  modRestartDelay: string;
  serverAutoUpdate: boolean;
  serverAutoUpdateWarningMinutes: string;
  steamUpdateAccount: string;

  // API Keys
  steamApiKey: string;

  // Workshop Collection Sync
  workshopCollectionId: string;
  workshopCollectionAutoSync: boolean;
  steamSessionId: string;
  steamLoginSecure: string;

  // General Settings
  darkMode: boolean;
  autoReconnect: boolean;
  reconnectInterval: string;

  // Panel Settings
  panelPort: string;

  // HTTPS Settings
  httpsEnabled: boolean;
  httpsPort: string;
  httpsKeyPath: string;
  httpsCertPath: string;

  // CORS Settings
  corsAllowedOrigins: string;
  corsAllowAll: boolean;
  corsAllowPrivateNetworks: boolean;
  corsDebug: boolean;

  // Privacy
  enablePublicIpLookup: boolean;

  // Which detected network interface's IPv4 the dashboard displays.
  // Empty string = auto-detect (first non-internal interface found).
  lanIpAddress: string;
}

export interface CorsDiagnostics {
  allowAll: boolean;
  allowPrivateNetworks: boolean;
  debug: boolean;
  customOrigins: string[];
  effectiveAllowedOrigins: string[];
  blocked: Array<{
    id: number;
    origin: string;
    source: string;
    blockedAt: string;
  }>;
  blockedCount: number;
  lastLoadedAt: string | null;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  panelBridgeAutoUpdate: true,
  panelBridgeSftpEnabled: false,
  panelBridgeSftpHost: "",
  panelBridgeSftpPort: "22",
  panelBridgeSftpUsername: "",
  panelBridgeSftpPassword: "",
  panelBridgeSftpBridgePath: "",
  panelBridgeSftpPollIntervalSeconds: "3",
  panelBridgeSftpLogPath: "",
  panelBridgeSftpConfigPath: "",
  autoStartServer: false,
  autoExportOnLogin: false,
  autoExportMaxPerPlayer: "3",
  modCheckInterval: "5",
  modAutoRestart: true,
  modRestartDelay: "5",
  serverAutoUpdate: false,
  serverAutoUpdateWarningMinutes: "15",
  steamUpdateAccount: "",
  steamApiKey: "",
  workshopCollectionId: "",
  workshopCollectionAutoSync: false,
  steamSessionId: "",
  steamLoginSecure: "",
  darkMode: true,
  autoReconnect: true,
  reconnectInterval: "5",
  panelPort: "3001",
  httpsEnabled: false,
  httpsPort: "3443",
  httpsKeyPath: "",
  httpsCertPath: "",
  corsAllowedOrigins: "",
  corsAllowAll: false,
  corsAllowPrivateNetworks: true,
  corsDebug: false,
  enablePublicIpLookup: false,
  lanIpAddress: "",
};

// Settings written by other pages are persisted as raw strings, so a stored
// "false" would otherwise read as truthy here.
export function toSettingBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}
