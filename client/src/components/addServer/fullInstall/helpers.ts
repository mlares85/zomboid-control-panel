// Shared pure helpers for the Full Install flow (extracted from ServerSetup.tsx).

export const LINUX_SERVICE_INSTALL_PATH = "/opt/zomboid-panel/data/pzserver";

// Generate a random password
export function generatePassword(length = 12): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Format bytes to human readable size
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function installationErrorGuidance(message: string): string {
  if (!message.startsWith("Installation path is not writable:")) {
    return message;
  }

  return `${message} On Linux, use ${LINUX_SERVICE_INSTALL_PATH}, or add both your install folder and its _Data folder to ReadWritePaths in zomboid-panel.service, then restart the service.`;
}
