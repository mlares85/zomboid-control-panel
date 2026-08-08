export const DIAG_CATEGORIES = {
  services: { label: "Core Services", order: 1 },
  bridge: { label: "PanelBridge IPC", order: 2 },
  server: { label: "Active Server", order: 3 },
  storage: { label: "Storage & Database", order: 4 },
  runtime: { label: "Runtime & Memory", order: 5 },
  updates: { label: "Updates", order: 6 },
};

export function diagOk(id, label, message, extras = {}) {
  return { id, label, status: "ok", message, severity: "info", ...extras };
}
export function diagFail(id, label, message, extras = {}) {
  return {
    id,
    label,
    status: "fail",
    message,
    severity: "critical",
    ...extras,
  };
}
export function diagWarn(id, label, message, extras = {}) {
  return { id, label, status: "warn", message, severity: "warning", ...extras };
}
export function diagInfo(id, label, message, extras = {}) {
  return { id, label, status: "info", message, severity: "info", ...extras };
}
export function diagSkip(id, label, message, extras = {}) {
  return { id, label, status: "skip", message, severity: "info", ...extras };
}

// Run a single check function, catching any unexpected throw and converting
// it into a 'fail' diag entry rather than aborting the whole report.
// Each check function returns a diag object (or null to skip).
export async function runCheck(label, fn, ctx = {}) {
  try {
    const result = await fn();
    return result;
  } catch (e) {
    return diagFail(
      `error.${label}`,
      label,
      `Check failed: ${e?.message || "unknown error"}`,
      ctx,
    );
  }
}

export function fmtMB(bytes) {
  if (!Number.isFinite(bytes)) return "?";
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}
export function fmtGB(bytes) {
  if (!Number.isFinite(bytes)) return "?";
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
export function fmtAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "unknown";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
