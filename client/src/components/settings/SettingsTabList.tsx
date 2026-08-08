import React from "react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SETTINGS_GROUPS } from "@/lib/settingsSections";

// The left-hand (desktop) / top scroll-strip (mobile) tab navigation,
// grouped by Panel / Game server / Automation / System.
export function SettingsTabList() {
  return (
    <TabsList
      aria-label="Settings sections"
      className="mb-4 flex h-auto w-full max-w-full justify-start gap-1 overflow-x-auto rounded-md border border-border/50 bg-muted/30 p-1 lg:sticky lg:top-4 lg:mb-0 lg:flex-col lg:items-stretch lg:gap-px lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0"
    >
      {SETTINGS_GROUPS.map((group) => (
        <React.Fragment key={group.name}>
          <p
            role="presentation"
            className="hidden lg:block px-2 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60 lg:first:pt-0"
          >
            {group.name}
          </p>
          {group.sections.map((section) => {
            const Icon = section.icon;
            return (
              <Tooltip key={section.id}>
                <TooltipTrigger asChild>
                  <TabsTrigger
                    value={section.id}
                    className="settings-tab-trigger shrink-0 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground/70 hover:bg-muted/50 hover:text-foreground data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none lg:w-full lg:justify-start lg:px-2.5"
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{section.label}</span>
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[220px]">
                  <p className="text-xs">{section.tip}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </React.Fragment>
      ))}
    </TabsList>
  );
}
