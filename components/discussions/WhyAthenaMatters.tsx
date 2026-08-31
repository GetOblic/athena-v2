"use client";

import { useState } from "react";

type WhyAthenaMattersProps = {
  bullets: string[];
  title?: string;
};

export function WhyAthenaMatters({
  bullets,
  title = "Why Athena thinks this matters",
}: WhyAthenaMattersProps) {
  const [open, setOpen] = useState(false);

  if (bullets.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="text-sm font-medium text-white/70">
          {title}
        </span>
        <span className="text-sm text-white/35">{open ? "−" : "+"}</span>
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
