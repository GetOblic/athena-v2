"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import {
  IDENTITY_FIELD_ANCHORS,
  IDENTITY_TEACH_ATHENA_HREF,
  isIdentityTeachAthenaHash,
  isIdentityTeachAthenaHref,
} from "@/components/identity/identityPagePresentation";

export function activateIdentityTeachAthenaDeepLink(): void {
  if (typeof window === "undefined") return;
  const hash = `#${IDENTITY_FIELD_ANCHORS.teach}`;
  if (window.location.hash !== hash) {
    window.location.hash = IDENTITY_FIELD_ANCHORS.teach;
  }
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function handleIdentityTeachAthenaDeepLinkClick(event: {
  preventDefault(): void;
}): void {
  if (typeof window === "undefined") return;
  if (window.location.pathname !== "/identity") return;
  event.preventDefault();
  activateIdentityTeachAthenaDeepLink();
}

export function IdentityTeachAthenaLink({
  href = IDENTITY_TEACH_ATHENA_HREF,
  className,
  children,
}: {
  href?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={className}
      onClick={(event) => {
        if (!isIdentityTeachAthenaHref(href)) return;
        handleIdentityTeachAthenaDeepLinkClick(event);
      }}
    >
      {children}
    </Link>
  );
}

type IdentityTeachAthenaDisclosureProps = {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  icon?: ReactNode;
  iconClassName?: string;
  className?: string;
  children: ReactNode;
};

export function IdentityTeachAthenaDisclosure({
  title,
  summary,
  defaultOpen = false,
  icon,
  iconClassName,
  className,
  children,
}: IdentityTeachAthenaDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [pendingReveal, setPendingReveal] = useState(false);

  useEffect(() => {
    function revealFromHash() {
      if (!isIdentityTeachAthenaHash(window.location.hash)) return;
      setOpen(true);
      setPendingReveal(true);
    }

    revealFromHash();
    window.addEventListener("hashchange", revealFromHash);
    return () => window.removeEventListener("hashchange", revealFromHash);
  }, []);

  useEffect(() => {
    if (!pendingReveal || !open) return;
    const section = document.getElementById(IDENTITY_FIELD_ANCHORS.teach);
    section?.scrollIntoView({ block: "start" });
    const trigger = section?.querySelector<HTMLButtonElement>(
      "button[aria-expanded]",
    );
    trigger?.focus({ preventScroll: true });
    setPendingReveal(false);
  }, [pendingReveal, open]);

  return (
    <AthenaCollapsibleSection
      id={IDENTITY_FIELD_ANCHORS.teach}
      title={title}
      summary={summary}
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={setOpen}
      tone="identity"
      icon={icon}
      iconClassName={iconClassName}
      className={className}
    >
      {children}
    </AthenaCollapsibleSection>
  );
}
