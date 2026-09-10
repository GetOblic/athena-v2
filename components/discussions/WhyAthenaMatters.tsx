"use client";

import { useState } from "react";
import { ChevronDown, Lightbulb } from "lucide-react";
import {
  PERSONA_DETAIL_ICON,
  PERSONA_NESTED_CARD_CLASS,
} from "@/lib/personas/personaPagePresentation";

type WhyAthenaMattersProps = {
  bullets: string[];
  title?: string;
  /** Persona-only opt-in. Default keeps Discussions chrome. */
  presentation?: "default" | "persona";
};

export function WhyAthenaMatters({
  bullets,
  title = "Why Athena thinks this matters",
  presentation = "default",
}: WhyAthenaMattersProps) {
  const [open, setOpen] = useState(false);

  if (bullets.length === 0) {
    return null;
  }

  const personaSurface = presentation === "persona";

  return (
    <div
      className={
        personaSurface
          ? PERSONA_NESTED_CARD_CLASS
          : "rounded-2xl border border-white/10 bg-black/20"
      }
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="flex min-w-0 items-center gap-3">
          {personaSurface ? (
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-xl ${PERSONA_DETAIL_ICON.blue}`}
              aria-hidden="true"
            >
              <Lightbulb className="size-4" />
            </span>
          ) : null}
          <span
            className={
              personaSurface
                ? "text-sm font-semibold tracking-tight text-white"
                : "text-sm font-medium text-white/70"
            }
          >
            {title}
          </span>
        </span>
        {personaSurface ? (
          <ChevronDown
            className={`size-5 shrink-0 text-white/45 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        ) : (
          <span className="text-sm text-white/35">{open ? "−" : "+"}</span>
        )}
      </button>

      {open && (
        <ul className="space-y-3 border-t border-white/10 px-5 pb-5 pt-4">
          {bullets.map((bullet) => (
            <li
              key={bullet}
              className="flex gap-3 text-sm leading-6 text-white/65"
            >
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--athena-orange)]" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
