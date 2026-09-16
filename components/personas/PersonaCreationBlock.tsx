"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  PERSONA_IMPORT_CSV_ICON,
  PERSONA_IMPORT_CSV_SURFACE,
  PERSONA_IMPORT_GENERATE_ICON,
  PERSONA_IMPORT_GENERATE_SURFACE,
  PERSONA_IMPORT_MANUAL_ICON,
  PERSONA_IMPORT_MANUAL_SURFACE,
} from "@/lib/personas/personaImportPresentation";

type PersonaCreationAccent = "orange" | "violet" | "cyan";

type PersonaCreationBlockProps = {
  title: string;
  summary: string;
  children: ReactNode;
  /** Stable panel id for aria-controls. */
  panelId: string;
  defaultOpen?: boolean;
  className?: string;
  /** Applied only while the block is expanded (desktop density, not default chrome). */
  expandedClassName?: string;
  /** Semantic accent for the accepted V2 surface / icon well. */
  accent?: PersonaCreationAccent;
  /** Optional Lucide (or other) mark rendered in the tinted icon well. */
  icon?: ReactNode;
};

const ACCENT_SURFACE: Record<PersonaCreationAccent, string> = {
  orange: PERSONA_IMPORT_GENERATE_SURFACE,
  violet: PERSONA_IMPORT_MANUAL_SURFACE,
  cyan: PERSONA_IMPORT_CSV_SURFACE,
};

const ACCENT_ICON: Record<PersonaCreationAccent, string> = {
  orange: PERSONA_IMPORT_GENERATE_ICON,
  violet: PERSONA_IMPORT_MANUAL_ICON,
  cyan: PERSONA_IMPORT_CSV_ICON,
};

/**
 * Accessible disclosure wrapper for Persona creation blocks.
 * Keeps children mounted while collapsed so form state is preserved.
 */
export function PersonaCreationBlock({
  title,
  summary,
  children,
  panelId,
  defaultOpen = false,
  className = "",
  expandedClassName = "",
  accent,
  icon,
}: PersonaCreationBlockProps) {
  const [open, setOpen] = useState(defaultOpen);
  const surfaceClassName = accent ? ACCENT_SURFACE[accent] : "";
  const iconClassName = accent ? ACCENT_ICON[accent] : "";

  return (
    <section
      className={`relative overflow-hidden rounded-[28px] border border-white/10 bg-[var(--athena-card)] ${surfaceClassName} ${className} ${open ? expandedClassName : ""}`.trim()}
    >
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className="flex min-h-[72px] w-full items-center gap-4 px-5 py-4 text-left transition-colors duration-200 hover:bg-white/[0.025] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)] sm:min-h-[76px] sm:px-7"
        aria-expanded={open}
        aria-controls={panelId}
      >
        {icon ? (
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-2xl ${iconClassName}`}
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
            {title}
          </h2>
          <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-white/45 sm:line-clamp-1 sm:text-sm">
            {summary}
          </p>
        </div>
        <ChevronDown
          className={`size-5 shrink-0 text-white/50 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      <div id={panelId} hidden={!open}>
        <div className="border-t border-white/10 px-6 pb-8 pt-6 sm:px-8">
          {children}
        </div>
      </div>
    </section>
  );
}
