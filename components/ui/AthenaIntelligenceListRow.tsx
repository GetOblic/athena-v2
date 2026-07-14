"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import {
  ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS,
  isInteractiveListRowTarget,
} from "@/components/ui/athenaIntelligenceRow";

type AthenaIntelligenceListRowProps = {
  href: string;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
};

/**
 * Whole-row navigation for intelligence lists.
 * Keeps nested action links/buttons clickable without duplicate navigation.
 */
export function AthenaIntelligenceListRow({
  href,
  ariaLabel,
  className = "",
  children,
}: AthenaIntelligenceListRowProps) {
  const router = useRouter();

  function navigate() {
    router.push(href);
  }

  function onClick(event: MouseEvent<HTMLDivElement>) {
    if (isInteractiveListRowTarget(event.target)) return;
    navigate();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      navigate();
    }
  }

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={ariaLabel}
      className={`${ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS} cursor-pointer ${className}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}
