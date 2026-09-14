"use client";

import type { ReactNode } from "react";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import {
  HELP_COLLAPSIBLE_TONE,
  HELP_ICON_WELL,
  type HelpAccent,
} from "@/lib/gettingStarted/helpCenterPresentation";

type HelpTopicSectionProps = {
  id: string;
  title: string;
  summary?: string;
  eyebrow?: string;
  accent?: HelpAccent;
  icon?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
};

export function HelpTopicSection({
  id,
  title,
  summary,
  eyebrow,
  accent = "muted",
  icon,
  defaultOpen = false,
  open,
  onOpenChange,
  children,
}: HelpTopicSectionProps) {
  return (
    <AthenaCollapsibleSection
      id={id}
      title={title}
      summary={summary}
      eyebrow={eyebrow}
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={onOpenChange}
      tone={HELP_COLLAPSIBLE_TONE}
      icon={icon}
      iconClassName={HELP_ICON_WELL[accent]}
    >
      {children}
    </AthenaCollapsibleSection>
  );
}
