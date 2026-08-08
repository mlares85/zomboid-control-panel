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

interface WorkshopPurgeDialogProps {
  purgeTarget: { workshopId: string; name: string | null } | null;
  setPurgeTarget: (target: { workshopId: string; name: string | null } | null) => void;
  runRowAction: (
    workshopId: string,
    action: "purge",
    name?: string | null,
  ) => Promise<void>;
}

export function WorkshopPurgeDialog({
  purgeTarget,
  setPurgeTarget,
  runRowAction,
}: WorkshopPurgeDialogProps) {
  return (
    <AlertDialog
      open={!!purgeTarget}
      onOpenChange={(open) => !open && setPurgeTarget(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Remove {purgeTarget?.name || purgeTarget?.workshopId} everywhere?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>This removes the mod from all four places at once:</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>the Steam collection</li>
                <li>
                  the server config (<code>WorkshopItems</code>,{" "}
                  <code>Mods</code>, <code>Map</code>)
                </li>
                <li>the downloaded files on disk</li>
                <li>the panel's tracked list</li>
              </ul>
              <p>
                It is then added to the ignore list so a later scan can't
                quietly bring it back. Restart the server to apply.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              const t = purgeTarget;
              setPurgeTarget(null);
              if (t) runRowAction(t.workshopId, "purge", t.name);
            }}
          >
            Remove everywhere
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
