import { FolderOpen, HardDrive } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FieldHelp } from "@/components/FieldHelp";

interface FolderStepProps {
  installPath: string;
  onInstallPathChange: (path: string) => void;
  onBrowseFolder: (
    setter: (path: string) => void,
    description: string,
    currentPath?: string,
  ) => void;
}

// Quick Setup Step 1: point at an existing PZ dedicated server install.
export function FolderStep({
  installPath,
  onInstallPathChange,
  onBrowseFolder,
}: FolderStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2 pb-6 border-b">
        <h2 className="text-2xl font-semibold">Select Server Files</h2>
        <p className="text-muted-foreground">
          Choose the existing Project Zomboid dedicated server folder.
        </p>
      </div>

      <Card className="bg-secondary/40 border-primary/24 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg border border-primary/20 bg-primary/10 flex items-center justify-center shrink-0">
              <HardDrive className="w-5 h-5 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="font-medium">Using existing files</p>
              <p className="text-sm text-muted-foreground">
                The folder should contain{" "}
                <code className="bg-muted px-1 rounded">StartServer64.bat</code>{" "}
                (Windows) or{" "}
                <code className="bg-muted px-1 rounded">start-server.sh</code>{" "}
                (Linux), plus the{" "}
                <code className="bg-muted px-1 rounded">java</code> folder.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Label className="text-base flex items-center gap-1.5">
          Server Files Location
          <FieldHelp
            description="Path to an existing Project Zomboid dedicated server folder."
            context="Must already contain the server's start script and java folder — this flow registers existing files rather than downloading new ones."
            recommendation="must-configure"
            articleId="adding-servers"
          />
        </Label>
        <div className="flex gap-2">
          <Input
            value={installPath}
            onChange={(e) => onInstallPathChange(e.target.value)}
            placeholder="Path to your existing dedicated server folder"
            className="font-mono flex-1"
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
                      onInstallPathChange,
                      "Select PZ server folder",
                      installPath,
                    )
                  }
                  aria-label="Browse server files folder"
                >
                  <FolderOpen className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Browse folder</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <p className="text-xs text-muted-foreground">
          Folder that already contains your Project Zomboid dedicated server
          files.
        </p>
      </div>
    </div>
  );
}
