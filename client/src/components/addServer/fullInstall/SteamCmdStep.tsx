import {
  Download,
  CheckCircle,
  Loader2,
  ExternalLink,
  FolderOpen,
  Settings2,
  Sparkles,
  Search,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FieldHelp } from "@/components/FieldHelp";

interface SteamCmdStepProps {
  path: string;
  onPathChange: (path: string) => void;
  hasSteamCmd: boolean;
  onChangePath: () => void;
  downloading: boolean;
  status: string;
  onAutoDownload: () => void;
  onSaveManualPath: () => void;
  onAutoDetect: () => void;
  onBrowseFolder: (
    setter: (path: string) => void,
    description: string,
    currentPath?: string,
  ) => void;
}

// Full Install Step 1: SteamCMD detection / auto-download / manual path.
export function SteamCmdStep({
  path,
  onPathChange,
  hasSteamCmd,
  onChangePath,
  downloading,
  status,
  onAutoDownload,
  onSaveManualPath,
  onAutoDetect,
  onBrowseFolder,
}: SteamCmdStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2 pb-6 border-b">
        <h2 className="text-2xl font-semibold flex items-center justify-center gap-1.5">
          Set Up SteamCMD
          <FieldHelp
            description="Path to the SteamCMD folder used to download and update dedicated server files."
            context="One-Click Setup installs it for you. If you already have SteamCMD, point at the existing folder instead of downloading a second copy."
            recommendation="safe-default"
            articleId="first-run-checklist"
          />
        </h2>
        <p className="text-muted-foreground">
          SteamCMD is required to download and update Project Zomboid dedicated
          server files.
        </p>
      </div>

      {!hasSteamCmd ? (
        <div className="space-y-6">
          {/* One-Click Setup */}
          <Card className="border-primary/35 bg-card shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 space-y-4">
                  <div>
                    <h3 className="font-semibold text-lg">One-Click Setup</h3>
                    <p className="text-sm text-muted-foreground">
                      We will install SteamCMD and prepare it for this panel.
                    </p>
                  </div>

                  <div className="flex gap-2 items-center">
                    <Input
                      value={path}
                      onChange={(e) => onPathChange(e.target.value)}
                      placeholder="Select or enter the SteamCMD folder path"
                      className="font-mono flex-1"
                      disabled={downloading}
                      maxLength={260}
                    />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() =>
                              onBrowseFolder(
                                onPathChange,
                                "Select SteamCMD folder",
                                path,
                              )
                            }
                            disabled={downloading}
                            aria-label="Browse SteamCMD folder"
                          >
                            <FolderOpen className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Browse folder</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  <Button
                    onClick={onAutoDownload}
                    disabled={downloading}
                    className="w-full"
                    size="lg"
                  >
                    {downloading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {status || "Installing SteamCMD..."}
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        Install SteamCMD Automatically
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Manual Setup Accordion */}
          <Accordion type="single" collapsible className="border rounded-lg">
            <AccordionItem value="manual" className="border-0">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4" />
                  <span>Already have SteamCMD? Set the folder manually</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onAutoDetect}
                      className="gap-1.5"
                    >
                      <Search className="w-3.5 h-3.5" />
                      Auto-detect existing install
                    </Button>
                  </div>
                  <div className="bg-warning/10 border border-warning/40 rounded-lg p-4 text-sm shadow-sm">
                    <p className="font-medium text-warning">Manual Setup</p>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground mt-2">
                      <li>Download SteamCMD from Valve</li>
                      <li>
                        Extract to a folder (e.g.,{" "}
                        <code className="bg-muted px-1 rounded">
                          C:\SteamCMD
                        </code>{" "}
                        or{" "}
                        <code className="bg-muted px-1 rounded">
                          ~/steamcmd
                        </code>
                        )
                      </li>
                      <li>
                        Run{" "}
                        <code className="bg-muted px-1 rounded">steamcmd</code>{" "}
                        once so it can self-update
                      </li>
                    </ol>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() =>
                        window.open(
                          "https://developer.valvesoftware.com/wiki/SteamCMD#Downloading_SteamCMD",
                          "_blank",
                        )
                      }
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download SteamCMD
                      <ExternalLink className="w-3 h-3 ml-2" />
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Input
                      value={path}
                      onChange={(e) => onPathChange(e.target.value)}
                      placeholder="Path to your existing SteamCMD folder"
                      className="font-mono flex-1"
                      maxLength={260}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        onBrowseFolder(
                          onPathChange,
                          "Select SteamCMD folder",
                          path,
                        )
                      }
                      aria-label="Browse SteamCMD folder"
                    >
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                    <Button onClick={onSaveManualPath}>Save Path</Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      ) : (
        <Card className="border-primary/30 bg-card shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl border border-primary/25 bg-primary/14 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">SteamCMD Ready</p>
                <p className="text-sm text-muted-foreground font-mono">
                  {path}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={onChangePath}>
                Change Path
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
