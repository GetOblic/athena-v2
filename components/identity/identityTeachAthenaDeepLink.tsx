"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import {
  IDENTITY_FIELD_ANCHORS,
  IDENTITY_TEACH_ATHENA_HREF,
  isIdentityTeachAthenaHash,
  isIdentityTeachAthenaHref,
  resolveIdentityFieldHash,
} from "@/components/identity/identityPagePresentation";

/** Sets a same-page hash and notifies listeners even when the hash is unchanged. */
export function activateIdentityLocationHash(hash: string): void {
  if (typeof window === "undefined") return;
  const bare = hash.startsWith("#") ? hash.slice(1) : hash;
  const next = `#${bare}`;
  if (window.location.hash !== next) {
    window.location.hash = bare;
  }
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function activateIdentityTeachAthenaDeepLink(): void {
  activateIdentityLocationHash(IDENTITY_FIELD_ANCHORS.teach);
}

export function handleIdentityFieldDeepLinkClick(
  event: { preventDefault(): void },
  href: string,
): void {
  if (typeof window === "undefined") return;
  if (window.location.pathname !== "/identity") return;
  event.preventDefault();
  activateIdentityLocationHash(href);
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

export function IdentityFieldDeepLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        handleIdentityFieldDeepLinkClick(event, href);
      }}
    >
      {children}
    </a>
  );
}

function editableIdentityControl(target: HTMLElement): HTMLElement | null {
  const candidate = target.matches("textarea, input")
    ? target
    : target.querySelector("textarea, input");
  if (!candidate) return null;
  const tag = candidate.tagName;
  if (tag !== "INPUT" && tag !== "TEXTAREA") return null;
  const control = candidate as HTMLInputElement;
  if (control.disabled || control.readOnly) return null;
  if (tag === "INPUT" && control.type === "hidden") return null;
  return control;
}

function revealOpenedTeachAthenaTarget(targetId: string): void {
  const target = document.getElementById(targetId);
  if (!target) {
    document
      .getElementById(IDENTITY_FIELD_ANCHORS.teach)
      ?.scrollIntoView({ block: "start" });
    return;
  }

  target.scrollIntoView({ block: "start" });
  if (targetId === IDENTITY_FIELD_ANCHORS.teach) {
    target
      .querySelector<HTMLButtonElement>("button[aria-expanded]")
      ?.focus({ preventScroll: true });
    return;
  }

  editableIdentityControl(target)?.focus({ preventScroll: true });
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
  const [pendingReveal, setPendingReveal] = useState<{
    targetId: string;
    token: number;
  } | null>(null);

  useEffect(() => {
    function revealFromHash() {
      const resolution = resolveIdentityFieldHash(window.location.hash);
      if (resolution?.disclosure !== "teach") return;
      setOpen(true);
      setPendingReveal((current) => ({
        targetId: resolution.targetId,
        token: (current?.token ?? 0) + 1,
      }));
    }

    revealFromHash();
    window.addEventListener("hashchange", revealFromHash);
    return () => window.removeEventListener("hashchange", revealFromHash);
  }, []);

  useEffect(() => {
    if (!pendingReveal || !open) return;
    revealOpenedTeachAthenaTarget(pendingReveal.targetId);
    setPendingReveal(null);
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
