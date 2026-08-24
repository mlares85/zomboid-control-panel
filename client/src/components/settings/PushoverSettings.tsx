import { usePushoverSettings } from "@/hooks/settings/usePushoverSettings";
import { usePushoverConditions } from "@/hooks/settings/usePushoverConditions";
import { PushoverConfigCard } from "./PushoverConfigCard";
import { PushoverConditionsCard } from "./PushoverConditionsCard";

/** Pushover notification settings: User Key / API Token, plus the alert conditions that trigger them. */
export function PushoverSettings() {
  const config = usePushoverSettings();
  const conditions = usePushoverConditions();

  return (
    <div className="space-y-5">
      <PushoverConfigCard {...config} />
      <PushoverConditionsCard {...conditions} />
    </div>
  );
}
