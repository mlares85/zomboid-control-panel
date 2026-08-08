import { Eye, EyeOff, Info, Key, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LocalPasswordResetCardProps {
  localPasswordResetSupported: boolean;
  showLocalPasswordReset: boolean;
  setShowLocalPasswordReset: (value: boolean) => void;
  setLocalPasswordResetToken: (value: string) => void;
  localPasswordResetPassword: string;
  setLocalPasswordResetPassword: (value: string) => void;
  localPasswordResetConfirm: string;
  setLocalPasswordResetConfirm: (value: string) => void;
  preparingLocalPasswordReset: boolean;
  handlePrepareLocalPasswordReset: () => Promise<void>;
  resettingLocalPassword: boolean;
  handleResetLostPassword: () => Promise<void>;
  showLocalResetPassword: boolean;
  setShowLocalResetPassword: (value: boolean) => void;
}

export function LocalPasswordResetCard({
  localPasswordResetSupported,
  showLocalPasswordReset,
  setShowLocalPasswordReset,
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
}: LocalPasswordResetCardProps) {
  return (
    <div className="max-w-2xl rounded-xl border border-border/70 bg-muted/35 p-4 text-sm text-muted-foreground">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-4 w-4 text-primary" />
        <div className="space-y-1.5 leading-6">
          <p className="font-medium text-foreground">
            Recovery when the current password is lost
          </p>
          {localPasswordResetSupported ? (
            <>
              <p>
                This panel session is running from the server itself, so you
                can reset the password here without typing the current one.
              </p>
              <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="sm:w-auto"
                  onClick={() => void handlePrepareLocalPasswordReset()}
                  disabled={preparingLocalPasswordReset || resettingLocalPassword}
                >
                  {preparingLocalPasswordReset ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Key className="mr-2 h-4 w-4" />
                  )}
                  {showLocalPasswordReset
                    ? "Refresh Local Recovery"
                    : "Reset Password On This Server"}
                </Button>
                {showLocalPasswordReset && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="sm:w-auto"
                    onClick={() => {
                      setShowLocalPasswordReset(false);
                      setLocalPasswordResetToken("");
                      setLocalPasswordResetPassword("");
                      setLocalPasswordResetConfirm("");
                    }}
                    disabled={preparingLocalPasswordReset || resettingLocalPassword}
                  >
                    Hide
                  </Button>
                )}
              </div>
              {showLocalPasswordReset && (
                <form
                  className="max-w-sm space-y-3 pt-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (resettingLocalPassword) return;
                    void handleResetLostPassword();
                  }}
                >
                  <div className="relative">
                    <Input
                      type={showLocalResetPassword ? "text" : "password"}
                      value={localPasswordResetPassword}
                      onChange={(e) =>
                        setLocalPasswordResetPassword(e.target.value)
                      }
                      placeholder="New password"
                      className="h-11 pr-10"
                      maxLength={128}
                      autoComplete="new-password"
                      aria-label="New password for local reset"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowLocalResetPassword(!showLocalResetPassword)
                      }
                      className="absolute right-3 inset-y-0 flex items-center text-muted-foreground hover:text-foreground"
                      aria-label={
                        showLocalResetPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showLocalResetPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <Input
                    type={showLocalResetPassword ? "text" : "password"}
                    value={localPasswordResetConfirm}
                    onChange={(e) =>
                      setLocalPasswordResetConfirm(e.target.value)
                    }
                    placeholder="Confirm new password"
                    className="h-11"
                    maxLength={128}
                    autoComplete="new-password"
                    aria-label="Confirm new password for local reset"
                  />
                  {localPasswordResetPassword &&
                    localPasswordResetConfirm &&
                    localPasswordResetPassword !== localPasswordResetConfirm && (
                      <p
                        className="text-xs text-destructive flex items-center gap-1"
                        role="alert"
                      >
                        <XCircle className="w-3 h-3" /> Passwords do not
                        match
                      </p>
                    )}
                  {localPasswordResetPassword &&
                    localPasswordResetPassword.length < 6 && (
                      <p
                        className="text-xs text-destructive flex items-center gap-1"
                        role="alert"
                      >
                        <XCircle className="w-3 h-3" /> Password must be at
                        least 6 characters
                      </p>
                    )}
                  <Button
                    type="submit"
                    className="gap-2"
                    disabled={
                      resettingLocalPassword ||
                      preparingLocalPasswordReset ||
                      !localPasswordResetPassword ||
                      !localPasswordResetConfirm ||
                      localPasswordResetPassword !== localPasswordResetConfirm ||
                      localPasswordResetPassword.length < 6
                    }
                  >
                    {resettingLocalPassword ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Key className="w-4 h-4" />
                    )}
                    {resettingLocalPassword
                      ? "Resetting..."
                      : "Reset Password and Sign Out"}
                  </Button>
                </form>
              )}
            </>
          ) : (
            <>
              <p>
                The panel cannot show existing passwords. If you still have
                filesystem access to the panel host, sign out and either
                create{" "}
                <span className="font-mono text-foreground/85">
                  data/reset-token.txt
                </span>{" "}
                or start the panel with{" "}
                <span className="font-mono text-foreground/85">
                  --reset-password
                </span>
                .
              </p>
              <p>
                Once the token file exists, the login screen will show a
                recovery option so you can set a new admin password without
                knowing the old one.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
