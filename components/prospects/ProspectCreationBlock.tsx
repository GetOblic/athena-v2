"use client";

import { useState, type ReactNode } from "react";

type ProspectCreationBlockProps = {
  title: string;
  summary: string;
  children: ReactNode;
  panelId: string;
  defaultOpen?: boolean;
  className?: string;
  /** Applied only while the block is expanded (desktop density, not default chrome). */
  expandedClassName?: string;
};

/**
 * Accessible disclosure wrapper for Prospect creation blocks.
 * Keeps children mounted while collapsed so form state is preserved.
 */
export function ProspectCreationBlock({
  title,
  summary,
  children,
  panelId,
  defaultOpen = false,
  className = "",
  expandedClassName = "",
}: ProspectCreationBlockProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className={`rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8 ${className} ${open ? expandedClassName : ""}`.trim()}
    >
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className="flex w-full items-center justify-between gap-3 text-left transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
        aria-expanded={open}
        aria-controls={panelId}
      >
        <h2 className="text-2xl font-semibold text-white">{title}</h2>
        <span className="shrink-0 text-xs text-white/35" aria-hidden="true">
          {open ? "▲" : "▼"}
        </span>
      </button>

      <div id={panelId} hidden={!open}>
        <p className="mt-3 text-sm leading-6 text-white/45">{summary}</p>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}
