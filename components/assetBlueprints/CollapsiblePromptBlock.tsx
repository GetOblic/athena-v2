"use client";

import { useState } from "react";
import { CopyButton } from "@/components/deployment/CopyButton";

type CollapsiblePromptBlockProps = {
  label: string;
  text?: string | null;
  fullWidth?: boolean;
  defaultOpen?: boolean;
};

export function CollapsiblePromptBlock({
  label,
  text,
  fullWidth,
  defaultOpen = false,
}: CollapsiblePromptBlockProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const content = text?.trim();
  const hasContent = Boolean(content);

  return (
    <article
      className={`rounded-2xl border border-white/10 bg-black/25 ${
        fullWidth ? "lg:col-span-2" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full cursor-pointer items-center justify-between gap-4 p-5 text-left transition hover:bg-white/[0.02]"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-white/55">{label}</span>
          <span className="text-xs text-white/30">{isOpen ? "▲" : "▼"}</span>
        </div>
        {hasContent && content && isOpen && (
          <span onClick={(event) => event.stopPropagation()}>
            <CopyButton text={content} />
          </span>
        )}
      </button>

      {isOpen && (
        <div className="border-t border-white/10 px-5 pb-5 pt-4">
          <div className="rounded-xl border border-white/10 bg-[var(--athena-bg)]/70 p-4 shadow-inner shadow-black/20">
            <p
              className={`whitespace-pre-wrap text-sm leading-7 ${
                hasContent ? "text-white/85" : "text-white/30"
              }`}
            >
              {hasContent ? content : "No prompt generated yet."}
            </p>
          </div>
        </div>
      )}
    </article>
  );
}
