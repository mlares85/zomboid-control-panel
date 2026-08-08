import { Eye, EyeOff, Key, Loader2, Shield, User, XCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecoveryCodesCard } from "./RecoveryCodesCard";
import { LocalPasswordResetCard } from "./LocalPasswordResetCard";
import { useSecuritySettings } from "@/hooks/settings/useSecuritySettings";
import { useLocalPasswordReset } from "@/hooks/settings/useLocalPasswordReset";

interface AuthUser {
  username: string;
  role: string;
}

interface SecuritySettingsProps {
  authEnabled: boolean;
  user: AuthUser | null;
  logout: () => Promise<void>;
}

export function SecuritySettings({
  authEnabled,
  user,
  logout,
}: SecuritySettingsProps) {
  const security = useSecuritySettings();
  const clearChangePasswordFields = () => {
    security.setCurrentPassword("");
    security.setNewPassword("");
    security.setConfirmPassword("");
  };
  const localReset = useLocalPasswordReset(
    authEnabled,
    logout,
    clearChangePasswordFields,
  );

  const { newPassword, confirmPassword, currentPassword, changingPassword } =
    security;

  return (
    <Card id="settings-security">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          Security & Authentication
        </CardTitle>
        <CardDescription>
          Change your password and review access details.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {authEnabled && user && (
          <div className="p-4 rounded-xl bg-muted/50 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">{user.username}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {user.role}
                </p>
              </div>
            </div>
          </div>
        )}

        {authEnabled && (
          <div className="space-y-4">
            <p className="text-base font-medium">Change Password</p>
            <form
              className="max-w-sm space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (changingPassword) return;
                if (!currentPassword || !newPassword || !confirmPassword)
                  return;
                if (newPassword !== confirmPassword) return;
                if (newPassword.length < 6) return;
                security.handleChangePassword();
              }}
            >
              {/* Hidden username helps password managers associate creds */}
              <input
                type="text"
                name="username"
                value={user?.username || ""}
                autoComplete="username"
                readOnly
                hidden
              />
              <div className="relative">
                <Input
                  type={security.showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => security.setCurrentPassword(e.target.value)}
                  placeholder="Current password"
                  className="h-11 pr-10"
                  maxLength={128}
                  autoComplete="current-password"
                  aria-label="Current password"
                />
                <button
                  type="button"
                  onClick={() =>
                    security.setShowCurrentPassword(!security.showCurrentPassword)
                  }
                  className="absolute right-3 inset-y-0 flex items-center text-muted-foreground hover:text-foreground"
                  aria-label={
                    security.showCurrentPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {security.showCurrentPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <div className="relative">
                <Input
                  type={security.showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => security.setNewPassword(e.target.value)}
                  placeholder="New password"
                  className="h-11 pr-10"
                  maxLength={128}
                  autoComplete="new-password"
                  aria-label="New password"
                />
                <button
                  type="button"
                  onClick={() =>
                    security.setShowNewPassword(!security.showNewPassword)
                  }
                  className="absolute right-3 inset-y-0 flex items-center text-muted-foreground hover:text-foreground"
                  aria-label={
                    security.showNewPassword ? "Hide password" : "Show password"
                  }
                >
                  {security.showNewPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <Input
                type={security.showNewPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => security.setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="h-11"
                maxLength={128}
                autoComplete="new-password"
                aria-label="Confirm new password"
              />
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive flex items-center gap-1" role="alert">
                  <XCircle className="w-3 h-3" /> Passwords do not match
                </p>
              )}
              {newPassword && newPassword.length < 6 && (
                <p className="text-xs text-destructive flex items-center gap-1" role="alert">
                  <XCircle className="w-3 h-3" /> Password must be at least 6
                  characters
                </p>
              )}
              <Button
                type="submit"
                disabled={
                  changingPassword ||
                  !currentPassword ||
                  !newPassword ||
                  !confirmPassword ||
                  newPassword !== confirmPassword ||
                  newPassword.length < 6
                }
                className="gap-2"
              >
                {changingPassword ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Key className="w-4 h-4" />
                )}
                {changingPassword ? "Changing..." : "Change Password"}
              </Button>
            </form>

            <RecoveryCodesCard
              recoveryCodeStatus={security.recoveryCodeStatus}
              generatedRecoveryCodes={security.generatedRecoveryCodes}
              setGeneratedRecoveryCodes={security.setGeneratedRecoveryCodes}
              generatingRecoveryCodes={security.generatingRecoveryCodes}
              handleGenerateRecoveryCodes={security.handleGenerateRecoveryCodes}
            />

            <LocalPasswordResetCard
              localPasswordResetSupported={localReset.localPasswordResetSupported}
              showLocalPasswordReset={localReset.showLocalPasswordReset}
              setShowLocalPasswordReset={localReset.setShowLocalPasswordReset}
              setLocalPasswordResetToken={localReset.setLocalPasswordResetToken}
              localPasswordResetPassword={localReset.localPasswordResetPassword}
              setLocalPasswordResetPassword={localReset.setLocalPasswordResetPassword}
              localPasswordResetConfirm={localReset.localPasswordResetConfirm}
              setLocalPasswordResetConfirm={localReset.setLocalPasswordResetConfirm}
              preparingLocalPasswordReset={localReset.preparingLocalPasswordReset}
              handlePrepareLocalPasswordReset={localReset.handlePrepareLocalPasswordReset}
              resettingLocalPassword={localReset.resettingLocalPassword}
              handleResetLostPassword={localReset.handleResetLostPassword}
              showLocalResetPassword={localReset.showLocalResetPassword}
              setShowLocalResetPassword={localReset.setShowLocalResetPassword}
            />
          </div>
        )}

        <div className="space-y-3 text-sm text-muted-foreground pt-2 border-t">
          <p>
            <strong className="text-foreground">RCON Security:</strong> Your
            RCON password is stored locally and is never transmitted outside
            of the RCON connection to your server.
          </p>
          <p>
            <strong className="text-foreground">Admin Commands:</strong> Be
            careful with admin commands. Some actions like banning or
            kicking players cannot be easily undone.
          </p>
          {!authEnabled && (
            <p>
              <strong className="text-foreground">Authentication:</strong>{" "}
              Authentication is not configured. Create an account via the
              setup wizard on first launch to protect access to this panel.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
