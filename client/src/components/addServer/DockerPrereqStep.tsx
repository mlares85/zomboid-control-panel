import { useState, useEffect } from "react";
import {
  CheckCircle, Loader2, ChevronLeft, ArrowRight, AlertTriangle, Info,
} from "lucide-react";
import { dockerApi } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DockerStepIndicator } from "./DockerSetup";

interface DockerPrereqStepProps {
  onBack: () => void;
  onContinue: () => void;
}

interface Prerequisites {
  dockerAvailable: boolean;
  baseVolume: { exists: boolean; populated: boolean; mountpoint?: string };
}

export function DockerPrereqStep({ onBack, onContinue }: DockerPrereqStepProps) {
  const [prereqs, setPrereqs] = useState<Prerequisites | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dockerApi
      .getManagedPrerequisites()
      .then(setPrereqs)
      .catch((e) => setError(e.message ?? "Failed to check prerequisites"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <DockerStepIndicator currentStep={1} />
      <div className="text-center space-y-2 pb-4">
        <h2 className="text-2xl font-semibold">Docker Prerequisites</h2>
        <p className="text-muted-foreground">
          Checking that Docker is accessible and base files are ready.
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
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                {prereqs.dockerAvailable ? (
                  <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                )}
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

          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                {prereqs.baseVolume.populated ? (
                  <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                ) : (
                  <Info className="w-5 h-5 text-blue-500 shrink-0" />
                )}
                <div>
                  <p className="font-medium">Shared Server Files</p>
                  <p className="text-sm text-muted-foreground">
                    {prereqs.baseVolume.populated
                      ? `Base volume is populated${prereqs.baseVolume.mountpoint ? ` at ${prereqs.baseVolume.mountpoint}` : ""}`
                      : "The shared server files (~3GB) need to be downloaded on first setup. This will be shared across all Docker servers."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="w-4 h-4 mr-2" />
          Choose Setup Type
        </Button>
        <Button onClick={onContinue} disabled={!prereqs?.dockerAvailable}>
          Continue
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
