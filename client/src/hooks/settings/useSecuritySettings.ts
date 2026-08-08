import { useCallback, useEffect, useState } from "react";
import { authApi } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";

// Change-password form and recovery-code generation, shared account
// security state for the Security tab.
export function useSecuritySettings() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [recoveryCodeStatus, setRecoveryCodeStatus] = useState<{
    configured: boolean;
    remaining: number;
    total: number;
  } | null>(null);
  const [generatedRecoveryCodes, setGeneratedRecoveryCodes] = useState<
    string[]
  >([]);
  const [generatingRecoveryCodes, setGeneratingRecoveryCodes] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const fetchRecoveryCodeStatus = useCallback(async () => {
    try {
      const status = await authApi.getRecoveryCodes();
      setRecoveryCodeStatus(status);
    } catch {
      setRecoveryCodeStatus(null);
    }
  }, []);

  useEffect(() => {
    void fetchRecoveryCodeStatus();
  }, [fetchRecoveryCodeStatus]);

  const handleGenerateRecoveryCodes = async () => {
    setGeneratingRecoveryCodes(true);
    try {
      const result = await authApi.generateRecoveryCodes();
      setGeneratedRecoveryCodes(result.codes || []);
      await fetchRecoveryCodeStatus();
      toast({
        title: "Recovery codes generated",
        description: "Save them now — they cannot be shown again.",
        variant: "success" as const,
      });
    } catch (error) {
      toast({
        title: "Could not generate recovery codes",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setGeneratingRecoveryCodes(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) return;
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({
        title: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }
    setChangingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      toast({
        title: "Password Changed",
        description: "Your password has been updated.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast({
        title: "Change Password Failed",
        description:
          error instanceof Error
            ? error.message
            : "The panel could not change your password. Check your current password and try again.",
        variant: "destructive",
      });
    } finally {
      setChangingPassword(false);
    }
  };

  return {
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    changingPassword,
    handleChangePassword,
    recoveryCodeStatus,
    generatedRecoveryCodes,
    setGeneratedRecoveryCodes,
    generatingRecoveryCodes,
    handleGenerateRecoveryCodes,
    showCurrentPassword,
    setShowCurrentPassword,
    showNewPassword,
    setShowNewPassword,
  };
}
