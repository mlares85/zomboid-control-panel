import { useState } from "react";
import {
  Server, Shield, Cpu, Settings2, ChevronLeft, ArrowRight,
  Eye, EyeOff, Copy, Check, RefreshCw,
} from "lucide-react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { copyText } from "@/lib/utils";
import { DockerStepIndicator, type DockerConfig } from "./DockerSetup";

interface DockerConfigStepProps {
  config: DockerConfig;
  onChange: (config: DockerConfig) => void;
  onBack: () => void;
  onNext: () => void;
}

const SERVER_NAME_RE = /^[a-zA-Z0-9_]+$/;

function generatePassword(length = 12): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function DockerConfigStep({ config, onChange, onBack, onNext }: DockerConfigStepProps) {
  const [showRconPassword, setShowRconPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  // Generate initial password if empty
  if (!config.rconPassword) {
    onChange({ ...config, rconPassword: generatePassword(12) });
  }

  const set = (patch: Partial<DockerConfig>) => onChange({ ...config, ...patch });

  const handleCopyPassword = async () => {
    const ok = await copyText(config.rconPassword);
    if (ok) { setCopiedPassword(true); setTimeout(() => setCopiedPassword(false), 2000); }
  };

  const nameValid = config.serverName.length > 0 && SERVER_NAME_RE.test(config.serverName);
  const passwordValid = config.rconPassword.length >= 6;
  const configValid = nameValid && passwordValid && config.adminPassword.trim().length > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <DockerStepIndicator currentStep={2} />
      <div className="text-center space-y-2 pb-4">
        <h2 className="text-2xl font-semibold">Server Configuration</h2>
        <p className="text-muted-foreground">Name your server, set ports, and configure resources.</p>
      </div>

      {/* Server Name */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            <CardTitle className="text-lg">Server Identity</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Server Name <span className="text-destructive">*</span></Label>
            <Input value={config.serverName} onChange={(e) => set({ serverName: e.target.value })} placeholder="myserver" className="font-mono" />
            {config.serverName.length > 0 && !nameValid && (
              <p className="text-xs text-destructive">Letters, numbers, and underscores only</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* RCON */}
      <Card className="border-primary/35 bg-card shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Remote Control (RCON)</CardTitle>
            <Badge className="ml-auto">Required</Badge>
          </div>
          <CardDescription>The panel uses RCON to manage the server.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>RCON Password</Label>
              <div className="flex gap-1">
                <div className="relative flex-1">
                  <Input type={showRconPassword ? "text" : "password"} value={config.rconPassword} onChange={(e) => set({ rconPassword: e.target.value })} className="pr-10 font-mono" />
                  <Button type="button" variant="ghost" size="sm" className="absolute right-1 top-1 h-9 w-9 p-0" onClick={() => setShowRconPassword(!showRconPassword)} aria-label={showRconPassword ? "Hide" : "Show"}>
                    {showRconPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="icon" onClick={handleCopyPassword} aria-label="Copy password">
                        {copiedPassword ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy password</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="icon" onClick={() => set({ rconPassword: generatePassword(12) })} aria-label="Generate new password">
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Generate new password</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              {config.rconPassword.length > 0 && config.rconPassword.length < 6 && (
                <p className="text-xs text-destructive">Minimum 6 characters</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>RCON Port</Label>
              <Input type="number" value={config.rconPort} onChange={(e) => set({ rconPort: parseInt(e.target.value) || 27015 })} className="font-mono" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Memory */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5" />
            <CardTitle className="text-lg">Memory Allocation</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <div className="flex justify-between">
                <Label>Minimum RAM</Label>
                <span className="font-mono font-medium">{config.minMemory}GB</span>
              </div>
              <Slider value={[config.minMemory]} onValueChange={([val]) => { set({ minMemory: val, maxMemory: Math.max(val, config.maxMemory) }); }} min={2} max={16} step={1} aria-label={`Minimum RAM: ${config.minMemory}GB`} />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <Label>Maximum RAM</Label>
                <span className="font-mono font-medium">{config.maxMemory}GB</span>
              </div>
              <Slider value={[config.maxMemory]} onValueChange={([val]) => { set({ maxMemory: val, minMemory: Math.min(val, config.minMemory) }); }} min={2} max={16} step={1} aria-label={`Maximum RAM: ${config.maxMemory}GB`} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Advanced */}
      <Accordion type="single" collapsible className="border rounded-lg">
        <AccordionItem value="advanced" className="border-0">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4" /><span>Advanced Options</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Game Port</Label>
                <Input type="number" value={config.gamePort} onChange={(e) => set({ gamePort: parseInt(e.target.value) || 16261 })} className="font-mono" />
                <p className="text-xs text-muted-foreground">Auto-assigned to avoid conflicts</p>
              </div>
              <div className="space-y-2">
                <Label>Admin Password <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Input type={showAdminPassword ? "text" : "password"} value={config.adminPassword} onChange={(e) => set({ adminPassword: e.target.value })} placeholder="Required for in-game admin" className="pr-10" maxLength={128} />
                  <Button type="button" variant="ghost" size="sm" className="absolute right-1 top-1 h-9 w-9 p-0" onClick={() => setShowAdminPassword(!showAdminPassword)} aria-label={showAdminPassword ? "Hide" : "Show"}>
                    {showAdminPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {config.adminPassword.trim().length === 0 && (
                  <p className="text-xs text-destructive">Required before server can start</p>
                )}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="flex items-center gap-3 pt-2">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="w-4 h-4 mr-2" />Back
        </Button>
        <Button onClick={onNext} disabled={!configValid}>
          Review & Create<ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
