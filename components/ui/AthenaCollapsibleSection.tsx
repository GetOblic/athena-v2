"use client";

import { useId, useState, type ReactNode } from "react";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";

type AthenaCollapsibleSectionProps = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Optional controlled open state (e.g. open from Discuss with Athena). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional eyebrow above the title */
  eyebrow?: string;
  className?: string;
  contentClassName?: string;
  /** Keep a live processing / status badge visible in the header */
  headerAside?: ReactNode;
};

/**
 * Accessible disclosure for large Prospect/Discussion workspace blocks.
 * Uses a real button header — never nests interactive controls inside another button.
 */
export function AthenaCollapsibleSection({
  title,
  children,
  defaultOpen = false,
  open: openControlled,
  onOpenChange,
  eyebrow,
  className = "",
  contentClassName = "",
  headerAside,
}: AthenaCollapsibleSectionProps) {
  const [openUncontrolled, setOpenUncontrolled] = useState(defaultOpen);
  const isControlled = openControlled !== undefined;
  const open = isControlled ? openControlled : openUncontrolled;
  const panelId = useId();

  function setOpen(next: boolean) {
    if (!isControlled) {
      setOpenUncontrolled(next);
    }
    onOpenChange?.(next);
  }

  return (
    <section
      className={`rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] ${className}`}
    >
      <div className="flex items-start justify-between gap-4 px-6 py-5 sm:px-8">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
          aria-expanded={open}
          aria-controls={panelId}
        >
          <div className="min-w-0 flex-1">
            {eyebrow ? (
              <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
                {eyebrow}
              </div>
            ) : null}
            <h2
              className={`text-xl font-semibold text-white ${eyebrow ? "mt-2" : ""}`}
            >
              {title}
            </h2>
          </div>
          <span className="shrink-0 text-xs text-white/35" aria-hidden="true">
            {open ? "▲" : "▼"}
          </span>
        </button>
        {headerAside ? (
          <div className="shrink-0 pt-1">{headerAside}</div>
        ) : null}
      </div>

      {open ? (
        <div
          id={panelId}
          className={`border-t border-white/10 px-6 pb-8 pt-6 sm:px-8 ${contentClassName}`}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
