"use client";

import { useEffect, useRef, useState } from "react";
import { continueInExternalWorkspace } from "@/services/assetContinuation/continueInExternalWorkspace";
import type { AiWorkspacePreferences } from "@/services/assetContinuation/destinationRegistry";

type ContinueButtonProps = {
  text: string;
  assetType?: string | null;
  preferences?: AiWorkspacePreferences | null;
  label?: string;
  ariaLabel?: string;
};

const TOAST_MS = 3200;

export function ContinueButton({
  text,
  assetType = null,
  preferences = null,
  label,
  ariaLabel,
}: ContinueButtonProps) {
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  function showToast(message: string) {
    if (!message) return;
    setToast(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, TOAST_MS);
  }

  async function handleContinue() {
    const result = await continueInExternalWorkspace({
      text,
      assetType,
      preferences,
    });
    showToast(result.toast);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void handleContinue()}
        aria-label={ariaLabel ?? "Continue in external workspace"}
        className="rounded-xl border border-[var(--athena-success)]/30 bg-[var(--athena-success)]/15 px-4 py-2 text-sm font-medium text-[var(--athena-success)] transition hover:border-[var(--athena-success)]/45 hover:bg-[var(--athena-success)]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--athena-success)]/50"
        style={{ minWidth: "5.5rem" }}
      >
        {label ?? "Continue"}
      </button>
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-2xl border border-emerald-400/25 bg-[#12121a] px-5 py-3 text-sm text-emerald-100 shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
        >
          {toast}
        </div>
      ) : null}
    </>
  );
}
