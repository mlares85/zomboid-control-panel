// In-memory log buffer for real-time streaming
export const logBuffer = [];
export const MAX_BUFFER_SIZE = 500;

// Hook into Winston to capture logs for streaming
export function addLogToBuffer(level, message, source = "server") {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    source,
  };

  logBuffer.push(entry);
  if (logBuffer.length > MAX_BUFFER_SIZE) {
    logBuffer.shift();
  }

  return entry;
}
