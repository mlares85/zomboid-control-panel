import { FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldHelp } from "@/components/FieldHelp";
import { AppSettings } from "@/lib/settingsTypes";

interface RemoteFile {
  name: string;
  size: number;
  modifiedAt: string | null;
}

interface BridgeRemoteLogsPanelProps {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void;
  remoteLogError: string | null;
  remoteLogs: RemoteFile[];
  remoteLogContent: {
    name: string;
    content: string;
    truncated: boolean;
    bytesReturned: number;
  } | null;
  loadingRemoteLogs: boolean;
  handleListRemoteLogs: () => Promise<void>;
  handleTailRemoteLog: (name: string) => Promise<void>;
}

// Read-only remote log browser: lists the remote Logs folder and fetches
// the tail of a chosen file over SFTP, on demand only.
export function BridgeRemoteLogsPanel({
  settings,
  updateSetting,
  remoteLogError,
  remoteLogs,
  remoteLogContent,
  loadingRemoteLogs,
  handleListRemoteLogs,
  handleTailRemoteLog,
}: BridgeRemoteLogsPanelProps) {
  return (
    <div className="rounded-md border border-border/60 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Remote server logs</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Absolute path to the Zomboid <code>Logs</code> folder on the
            remote host. Only <code>.txt</code> and <code>.log</code> files
            are listed.
          </p>
        </div>
        <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[18rem] flex-1 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="sftp-log-path">Remote log folder</Label>
            <FieldHelp
              description="Absolute path, on the remote host, to the Zomboid Logs folder."
              context="Only needed if you want to browse and tail remote server logs from the panel. The panel reads files on demand — nothing is mirrored to disk."
              recommendation="advanced"
              articleId="panelbridge-internals"
            />
          </div>
          <Input
            id="sftp-log-path"
            value={settings.panelBridgeSftpLogPath}
            onChange={(event) =>
              updateSetting("panelBridgeSftpLogPath", event.target.value)
            }
            placeholder="/home/pz/Zomboid/Logs"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleListRemoteLogs}
          disabled={loadingRemoteLogs || !settings.panelBridgeSftpLogPath.trim()}
        >
          {loadingRemoteLogs ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FolderOpen className="mr-2 h-4 w-4" />
          )}
          List logs
        </Button>
      </div>

      {remoteLogError && (
        <p className="text-xs text-destructive">{remoteLogError}</p>
      )}

      {remoteLogs.length > 0 && (
        <div className="space-y-2">
          <div className="max-h-48 overflow-auto rounded border border-border/50">
            <ul className="divide-y divide-border/40">
              {remoteLogs.map((file) => (
                <li
                  key={file.name}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => handleTailRemoteLog(file.name)}
                    className="min-w-0 flex-1 truncate text-left text-xs font-mono text-primary hover:underline"
                  >
                    {file.name}
                  </button>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {(file.size / 1024).toFixed(0)} KB
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Select a file to load the last 256 KB.
          </p>
        </div>
      )}

      {remoteLogContent && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium">{remoteLogContent.name}</p>
            <span className="text-[11px] text-muted-foreground">
              {remoteLogContent.truncated ? "tail of " : ""}
              {(remoteLogContent.bytesReturned / 1024).toFixed(0)} KB
            </span>
          </div>
          <pre className="max-h-72 overflow-auto rounded border border-border/50 bg-background/60 p-3 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words">
            {remoteLogContent.content}
          </pre>
        </div>
      )}
    </div>
  );
}
