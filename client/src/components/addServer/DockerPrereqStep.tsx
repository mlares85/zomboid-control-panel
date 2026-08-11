import { useState, useEffect, useContext } from "react";
import {
  CheckCircle, Loader2, ChevronLeft, ArrowRight, AlertTriangle, Info,
  Download, FolderOpen,
} from "lucide-react";
import { dockerApi } from "@/lib/api";
import { SocketContext } from "@/contexts/SocketContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderBrowser } from "@/components/FolderBrowser";
import { DockerStepIndicator } from "./DockerSetup";

interface DockerPrereqStepProps {
  onBack: () => void;
  onContinue: (basePath?: string) => void;
}

interface Prerequisites {
  dockerAvailable: boolean;
  baseVolume: { exists: boolean; populated: boolean; mountpoint?: string };
}

export function DockerPrereqStep({ onBack, onContinue }: DockerPrereqStepProps) {
  const [prereqs, setPrereqs] = useState<Prerequisites | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [downloading, setDownloading] = useState(false);
  const [downloadLogs, setDownloadLogs] = useState<string[]>([]);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // "Use existing path" state
  const [existingPath, setExistingPath] = useState("");
  const [pathValid, setPathValid] = useState<boolean | null>(null);
  const [pathError, setPathError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  const [browseOpen, setBrowseOpen] = useState(false);
  const socket = useContext(SocketContext);

  useEffect(() => {
    dockerApi
      .getManagedPrerequisites()
      .then(setPrereqs)
      .catch((e: Error) => setError(e.message ?? "Failed to check prerequisites"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!socket || !downloading) return;
    const handleLog = (data: { type: string; text: string }) => {
      setDownloadLogs((prev) => [...prev.slice(-100), data.text]);
      const match = data.text.match(/progress:\s*([\d.]+)/);
      if (match) setDownloadProgress(parseFloat(match[1]));
      const valMatch = data.text.match(/[Vv]alidat\w*[^\d]*(\d+)%/);
      if (valMatch) setDownloadProgress(parseInt(valMatch[1]));
    };
    const handleComplete = (data: { success: boolean; message: string }) => {
      setDownloading(false);
      if (data.success) {
        dockerApi.getManagedPrerequisites().then(setPrereqs).catch(() => {});
      } else {
        setDownloadError(data.message);
      }
    };
    socket.on("docker:populate-log", handleLog);
    socket.on("docker:populate-complete", handleComplete);
    return () => {
      socket.off("docker:populate-log", handleLog);
      socket.off("docker:populate-complete", handleComplete);
    };
  }, [socket, downloading]);

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadLogs([]);
    setDownloadProgress(0);
    setDownloadError(null);
    try {
      await dockerApi.populateBase();
    } catch (e) {
      setDownloading(false);
      setDownloadError(e instanceof Error ? e.message : "Failed to start download");
    }
  };

  const handleValidatePath = async () => {
    if (!existingPath.trim()) return;
    setValidating(true);
    setPathError(null);
    setPathValid(null);
    try {
      const result = await dockerApi.validateBasePath(existingPath.trim());
      setPathValid(result.valid);
      if (!result.valid) setPathError(result.error ?? "Invalid path");
    } catch (e) {
      setPathError(e instanceof Error ? e.message : "Validation failed");
      setPathValid(false);
    } finally {
      setValidating(false);
    }
  };

  const baseReady = prereqs?.baseVolume.populated || pathValid === true;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <DockerStepIndicator currentStep={1} />
      <div className="text-center space-y-2 pb-4">
        <h2 className="text-2xl font-semibold">Docker Prerequisites</h2>
        <p className="text-muted-foreground">
          Checking that Docker is accessible and server files are available.
        </p>
      </div>

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Checking prerequisites...
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="py-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Failed to check prerequisites</p>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {prereqs && (
        <div className="space-y-4">
          {/* Docker socket status */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                {prereqs.dockerAvailable
                  ? <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                  : <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />}
                <div>
                  <p className="font-medium">Docker Socket</p>
                  <p className="text-sm text-muted-foreground">
                    {prereqs.dockerAvailable
                      ? "Docker is available and connected"
                      : "Mount the Docker socket into the panel container (-v /var/run/docker.sock:/var/run/docker.sock)"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Base volume / server files */}
          {prereqs.baseVolume.populated ? (
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                  <div>
                    <p className="font-medium">Shared Server Files</p>
                    <p className="text-sm text-muted-foreground">Base volume is populated</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-4 space-y-4">
                <div className="flex items-center gap-3">
                  <Info className="w-5 h-5 text-blue-500 shrink-0" />
                  <div>
                    <p className="font-medium">Server Files Needed</p>
                    <p className="text-sm text-muted-foreground">
                      Point to an existing PZ server folder, or download fresh files (~7GB).
                    </p>
                  </div>
                </div>

                {/* Option 1: Use existing path */}
                <div className="space-y-2 pt-1">
                  <Label className="text-sm font-medium">Use existing server files</Label>
                  <div className="flex gap-2">
                    <Input
                      value={existingPath}
                      onChange={(e) => { setExistingPath(e.target.value); setPathValid(null); setPathError(null); }}
                      placeholder="/pz-server or /mnt/user/appdata/..."
                      className="font-mono text-sm flex-1"
                    />
                    <Button variant="outline" size="icon" className="shrink-0" onClick={() => setBrowseOpen(true)} aria-label="Browse folders">
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleValidatePath} disabled={!existingPath.trim() || validating}>
                      {validating && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                      Verify
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Browse or type the path to your PZ server folder (should contain start-server.sh or ProjectZomboid64), then click Verify.
                  </p>
                  <FolderBrowser
                    open={browseOpen}
                    onOpenChange={setBrowseOpen}
                    initialPath={existingPath || "/"}
                    title="Select PZ Server Folder"
                    onSelect={(path) => { setExistingPath(path); setPathValid(null); setPathError(null); }}
                  />
                  {pathValid === true && (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Valid PZ server files found
                    </p>
                  )}
                  {pathError && (
                    <div className="text-xs space-y-1">
                      <p className="text-destructive">{pathError}</p>
                      <p className="text-muted-foreground">
                        If you don't have server files yet, use the download option below.
                      </p>
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex-1 border-t" /><span>or</span><span className="flex-1 border-t" />
                </div>

                {/* Option 2: Download */}
                {downloadError && (
                  <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{downloadError}</span>
                  </div>
                )}
                {downloading ? (
                  <div className="space-y-3">
                    <Progress value={downloadProgress} className="h-2" />
                    <p className="text-sm text-muted-foreground">
                      Downloading server files... {Math.round(downloadProgress)}%
                    </p>
                    <ScrollArea className="h-32 rounded-md border bg-muted/50 p-3">
                      <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                        {downloadLogs.join("\n")}
                      </pre>
                    </ScrollArea>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={handleDownload}>
                    <Download className="w-4 h-4 mr-2" />
                    {downloadError ? "Retry Download" : "Download Server Files (~7GB)"}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="w-4 h-4 mr-2" />Choose Setup Type
        </Button>
        <Button
          onClick={() => onContinue(pathValid ? existingPath.trim() : undefined)}
          disabled={!prereqs?.dockerAvailable || (!baseReady && !pathValid)}
        >
          Continue<ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
