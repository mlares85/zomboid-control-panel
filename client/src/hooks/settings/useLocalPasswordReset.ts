import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/use-toast";

// "Forgot my password" recovery for panel sessions running on the server
// host itself — lets the admin reset without knowing the old password by
// proving filesystem access via a token file.
export function useLocalPasswordReset(
  authEnabled: boolean,
  logout: () => Promise<void>,
  clearChangePasswordFields: () => void,
) {
  const { toast } = useToast();
  const [localPasswordResetSupported, setLocalPasswordResetSupported] =
    useState(false);
  const [showLocalPasswordReset, setShowLocalPasswordReset] = useState(false);
  const [localPasswordResetToken, setLocalPasswordResetToken] = useState("");
  const [localPasswordResetPassword, setLocalPasswordResetPassword] =
    useState("");
  const [localPasswordResetConfirm, setLocalPasswordResetConfirm] =
    useState("");
  const [preparingLocalPasswordReset, setPreparingLocalPasswordReset] =
    useState(false);
  const [resettingLocalPassword, setResettingLocalPassword] = useState(false);
  const [showLocalResetPassword, setShowLocalResetPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!authEnabled) {
      setLocalPasswordResetSupported(false);
      setShowLocalPasswordReset(false);
      return () => {
        cancelled = true;
      };
    }

    fetch("/api/auth/reset-status")
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        setLocalPasswordResetSupported(data.localResetSupported === true);
      })
      .catch(() => {
        if (cancelled) return;
        setLocalPasswordResetSupported(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authEnabled]);

  const handlePrepareLocalPasswordReset = async () => {
    setPreparingLocalPasswordReset(true);
    try {
      const response = await fetch("/api/auth/reset-token/local", {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.error ||
            "The panel could not prepare password recovery on this server.",
        );
      }

      setLocalPasswordResetSupported(true);
      setShowLocalPasswordReset(true);
      setLocalPasswordResetToken("");
      toast({
        title: "Recovery Ready",
        description:
          typeof data.message === "string"
            ? data.message
            : "Recovery token created at data/reset-token.txt. Paste it below to continue.",
      });
    } catch (error) {
      toast({
        title: "Recovery Unavailable",
        description:
          error instanceof Error
            ? error.message
            : "The panel could not prepare password recovery on this server.",
        variant: "destructive",
      });
    } finally {
      setPreparingLocalPasswordReset(false);
    }
  };

  const handleResetLostPassword = async () => {
    if (!localPasswordResetToken) {
      toast({ title: "Recovery token missing", variant: "destructive" });
      return;
    }
    if (!localPasswordResetPassword || !localPasswordResetConfirm) return;
    if (localPasswordResetPassword !== localPasswordResetConfirm) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (localPasswordResetPassword.length < 6) {
      toast({
        title: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }

    setResettingLocalPassword(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: localPasswordResetToken,
          newPassword: localPasswordResetPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.error ||
            "The panel could not reset your password from this server.",
        );
      }

      clearChangePasswordFields();
      setShowLocalPasswordReset(false);
      setLocalPasswordResetToken("");
      setLocalPasswordResetPassword("");
      setLocalPasswordResetConfirm("");
      toast({
        title: "Password Reset",
        description:
          "Your password has been reset. Sign in again with the new password.",
      });
      await logout();
    } catch (error) {
      toast({
        title: "Password Reset Failed",
        description:
          error instanceof Error
            ? error.message
            : "The panel could not reset your password from this server.",
        variant: "destructive",
      });
    } finally {
      setResettingLocalPassword(false);
    }
  };

  return {
    localPasswordResetSupported,
    showLocalPasswordReset,
    setShowLocalPasswordReset,
    localPasswordResetToken,
    setLocalPasswordResetToken,
    localPasswordResetPassword,
    setLocalPasswordResetPassword,
    localPasswordResetConfirm,
    setLocalPasswordResetConfirm,
    preparingLocalPasswordReset,
    handlePrepareLocalPasswordReset,
    resettingLocalPassword,
    handleResetLostPassword,
    showLocalResetPassword,
    setShowLocalResetPassword,
  };
}
