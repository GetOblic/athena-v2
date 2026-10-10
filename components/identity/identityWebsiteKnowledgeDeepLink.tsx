"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import {
  IDENTITY_FIELD_ANCHORS,
  resolveIdentityFieldHash,
} from "@/components/identity/identityPagePresentation";

type IdentityWebsiteKnowledgeDisclosureProps = {
  id?: string;
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  icon?: ReactNode;
  iconClassName?: string;
  className?: string;
  headerActions?: ReactNode;
  children: ReactNode;
};

export function IdentityWebsiteKnowledgeDisclosure({
  id = IDENTITY_FIELD_ANCHORS.websiteKnowledge,
  title,
  summary,
  defaultOpen = false,
  icon,
  iconClassName,
  className,
  headerActions,
  children,
}: IdentityWebsiteKnowledgeDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [pendingReveal, setPendingReveal] = useState<{ token: number } | null>(
    null,
  );

  useEffect(() => {
    function revealFromHash() {
      const resolution = resolveIdentityFieldHash(window.location.hash);
      if (resolution?.disclosure !== "websiteKnowledge") return;
      setOpen(true);
      setPendingReveal((current) => ({
        token: (current?.token ?? 0) + 1,
      }));
    }

    revealFromHash();
    window.addEventListener("hashchange", revealFromHash);
    return () => window.removeEventListener("hashchange", revealFromHash);
  }, []);

  useEffect(() => {
    if (!pendingReveal || !open) return;
    const section = document.getElementById(id);
    section?.scrollIntoView({ block: "start" });
    section
      ?.querySelector<HTMLButtonElement>("button[aria-expanded]")
      ?.focus({ preventScroll: true });
    setPendingReveal(null);
  }, [pendingReveal, open, id]);

  return (
    <AthenaCollapsibleSection
      id={id}
      title={title}
      summary={summary}
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={setOpen}
      tone="identity"
      icon={icon}
      iconClassName={iconClassName}
      className={className}
      headerActions={headerActions}
    >
      {children}
    </AthenaCollapsibleSection>
  );
}
