export interface InstallLog {
  type: "info" | "success" | "error" | "command" | "stdout" | "stderr";
  message: string;
  timestamp: Date;
}
