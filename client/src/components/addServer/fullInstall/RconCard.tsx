import { Eye, EyeOff, Shield, RefreshCw, Copy, Check } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FieldHelp } from "@/components/FieldHelp";

export interface RconGroup {
  password: string;
  onPasswordChange: (value: string) => void;
  port: number;
  onPortChange: (value: number) => void;
  visible: boolean;
  onToggleVisible: () => void;
  copied: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
  adminPassword: string;
  onAdminPasswordChange: (value: string) => void;
  adminPasswordVisible: boolean;
  onToggleAdminPasswordVisible: () => void;
}

// RCON credentials card used on the Performance step of Full Install.
export function RconCard({ rcon }: { rcon: RconGroup }) {
  return (
    <Card className="border-primary/35 bg-card shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <CardTitle className="text-lg">Remote Control (RCON)</CardTitle>
          <Badge className="ml-auto">Required</Badge>
        </div>
        <CardDescription>
          This panel uses RCON to run commands on your server.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              RCON Password
              <FieldHelp
                description="Password the panel uses to control this server over RCON."
                context="Auto-generated for you — the panel writes this into the server's config, so the built-in Regenerate button is the safe way to change it."
                recommendation="safe-default"
                articleId="rcon-setup"
              />
            </Label>
            <div className="flex gap-1">
              <div className="relative flex-1">
                <Input
                  type={rcon.visible ? "text" : "password"}
                  value={rcon.password}
                  onChange={(e) => rcon.onPasswordChange(e.target.value)}
                  className="pr-10 font-mono"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1 h-9 w-9 p-0"
                  onClick={rcon.onToggleVisible}
                  aria-label={rcon.visible ? "Hide RCON password" : "Show RCON password"}
                >
                  {rcon.visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" onClick={rcon.onCopy} aria-label="Copy password">
                      {rcon.copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy password</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={rcon.onRegenerate}
                      aria-label="Generate new password"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Generate new password</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {rcon.password.length > 0 && rcon.password.length < 6 && (
              <p className="text-xs text-destructive">Minimum 6 characters</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              RCON Port
              <FieldHelp
                description="Port the RCON listener runs on."
                context="Must stay unique per server if you run more than one on the same machine — the panel fails to connect if two servers share a port."
                recommendation="safe-default"
                articleId="rcon-setup"
              />
            </Label>
            <Input
              type="number"
              value={rcon.port}
              onChange={(e) => rcon.onPortChange(parseInt(e.target.value) || 27015)}
              className="font-mono"
            />
          </div>
        </div>

        <div className={`space-y-2 border-t pt-4 rounded-lg ${!rcon.adminPassword.trim() ? '-mx-3 -mb-2 px-3 pb-2 border border-yellow-500/40 bg-yellow-500/5' : ''}`}>
          <Label className="flex items-center gap-1.5">
            Admin Password <span className="text-destructive">*</span>
            <FieldHelp
              description="In-game admin password, passed as the server's -adminpassword launch argument."
              context="Required before the server can start for the first time. This is different from the RCON password above and is used to log in as admin in-game."
              recommendation="must-configure"
              articleId="first-run-checklist"
            />
          </Label>
          <div className="relative max-w-sm">
            <Input
              type={rcon.adminPasswordVisible ? "text" : "password"}
              value={rcon.adminPassword}
              onChange={(e) => rcon.onAdminPasswordChange(e.target.value)}
              placeholder="Required before first server start"
              className={`pr-10 ${!rcon.adminPassword.trim() ? 'border-yellow-500/60' : ''}`}
              maxLength={128}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1 h-9 w-9 p-0"
              onClick={rcon.onToggleAdminPasswordVisible}
              aria-label={rcon.adminPasswordVisible ? "Hide admin password" : "Show admin password"}
            >
              {rcon.adminPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Used to log in as admin in-game. Different from the RCON password.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
