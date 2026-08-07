"use client";

import { LogoutCta } from "@/components/auth/LogoutCta";
import { BackToMasterCta } from "@/components/licensee/BackToMasterCta";

/**
 * Shared Athena header action group — right-aligned, wrap-safe.
 * Back to Master renders only when Master-origin session is active.
 */
export function AthenaHeaderActions() {
  return (
    <div
      role="group"
      aria-label="Session actions"
      className="flex w-full max-w-full flex-wrap items-center justify-end gap-2.5"
    >
      <BackToMasterCta />
      <LogoutCta />
    </div>
  );
}
