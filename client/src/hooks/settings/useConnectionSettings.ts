import { useState } from "react";
import { configApi } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";

// RCON tab: the "Test Connection" button's loading/result state.
export function useConnectionSettings() {
  const { toast } = useToast();
  const [testingRcon, setTestingRcon] = useState(false);

  const handleTestRcon = async () => {
    setTestingRcon(true);
    try {
      await configApi.testRcon();
      toast({
        title: "RCON Connected",
        description: "The panel connected to your server over RCON.",
        variant: "success" as const,
      });
    } catch (error) {
      toast({
        title: "RCON Connection Failed",
        description:
          error instanceof Error
            ? error.message
            : "The panel could not connect to RCON. Verify host, port, password, and firewall rules.",
        variant: "destructive",
      });
    } finally {
      setTestingRcon(false);
    }
  };

  return { testingRcon, handleTestRcon };
}
