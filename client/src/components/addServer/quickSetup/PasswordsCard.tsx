import { Shield, Eye, EyeOff, Copy, Check, RefreshCw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

export interface PasswordsGroup {
  rconPassword: string;
  onRconPasswordChange: (value: string) => void;
  rconPort: number;
  onRconPortChange: (value: number) => void;
  rconVisible: boolean;
  onToggleRconVisible: () => void;
  copied: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
  adminPassword: string;
  onAdminPasswordChange: (value: string) => void;
  adminVisible: boolean;
  onToggleAdminVisible: () => void;
}

// RCON + in-game admin password card used on the Configure step of Quick
// Setup. Unlike Full Install (which splits these across RconCard and the
// advanced options), Quick Setup keeps both credentials in one "Required"
// card, matching the original ServerSetup.tsx layout.
export function PasswordsCard({ passwords: p }: { passwords: PasswordsGroup }) {
  return (
    <Card className="border-primary/35 bg-card shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <CardTitle className="text-lg">Passwords</CardTitle>
          <Badge className="ml-auto">Required</Badge>
        </div>
        <CardDescription>
          RCON lets the panel manage the server. The admin password is for
          in-game admin access.
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
                  type={p.rconVisible ? "text" : "password"}
                  value={p.rconPassword}
                  onChange={(e) => p.onRconPasswordChange(e.target.value)}
                  className="pr-10 font-mono"
                  maxLength={128}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1 h-9 w-9 p-0"
                  onClick={p.onToggleRconVisible}
                  aria-label={p.rconVisible ? "Hide RCON password" : "Show RCON password"}
                >
                  {p.rconVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" onClick={p.onCopy} aria-label="Copy password">
                      {p.copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
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
                      onClick={p.onRegenerate}
                      aria-label="Generate new password"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Generate new password</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {p.rconPassword.length > 0 && p.rconPassword.length < 6 && (
              <p className="text-xs text-destructive">Minimum 6 characters</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              Admin Password <span className="text-destructive">*</span>
              <FieldHelp
                description="In-game admin password, passed as the server's -adminpassword launch argument."
                context="Required before the server can start for the first time. This is different from the RCON password and is used to log in as admin in-game."
                recommendation="must-configure"
                articleId="first-run-checklist"
              />
            </Label>
            <div className="relative">
              <Input
                type={p.adminVisible ? "text" : "password"}
                value={p.adminPassword}
                onChange={(e) => p.onAdminPasswordChange(e.target.value)}
                placeholder="For in-game admin access"
                className="pr-10"
                maxLength={128}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1 h-9 w-9 p-0"
                onClick={p.onToggleAdminVisible}
                aria-label={p.adminVisible ? "Hide admin password" : "Show admin password"}
              >
                {p.adminVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {p.adminPassword.trim().length === 0 && (
              <p className="text-xs text-destructive">Required before server can start</p>
            )}
          </div>
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
            value={p.rconPort}
            onChange={(e) => p.onRconPortChange(parseInt(e.target.value) || 27015)}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">Default port: 27015</p>
        </div>
      </CardContent>
    </Card>
  );
}
