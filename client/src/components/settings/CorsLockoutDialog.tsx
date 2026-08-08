import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CorsLockoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmDisable: () => void;
}

// Confirms before disabling "Allow Private/LAN Origins" when no fallback
// origin is configured — that combination locks every browser out of the
// panel, including the one used to make the change.
export function CorsLockoutDialog({
  open,
  onOpenChange,
  onConfirmDisable,
}: CorsLockoutDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Lock yourself out of the panel?</AlertDialogTitle>
          <AlertDialogDescription>
            Disabling <strong>Allow Private/LAN Origins</strong> with no
            explicit origins listed and <strong>Allow All Origins</strong>{" "}
            off will block every browser connection — including the one
            you&apos;re using right now — after the next CORS reload.
            <br />
            <br />
            To recover, you would need to restart the panel with the
            <code className="mx-1">CORS_ORIGINS</code> environment variable
            set to a valid origin (e.g.{" "}
            <code>CORS_ORIGINS=https://panel.example.com</code>).
            <br />
            <br />
            Add at least one origin in the box above first, then disable LAN
            access.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep LAN access on</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirmDisable}
          >
            Disable anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
