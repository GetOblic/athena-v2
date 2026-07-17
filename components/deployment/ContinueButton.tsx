"use client";

import { useEffect, useRef, useState } from "react";
import { continueInExternalWorkspace } from "@/services/assetContinuation/continueInExternalWorkspace";
import type { AiWorkspacePreferences } from "@/services/assetContinuation/destinationRegistry";

type ContinueButtonProps = {
  text: string;
  assetType?: string | null;
  preferences?: AiWorkspacePreferences | null;
};

const TOAST_MS = 3200;

export function ContinueButton({
  text,
  assetType = null,
  preferences = null,
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
        aria-label="Continue in external workspace"
        className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/[0.08]"
        style={{ minWidth: "5.5rem" }}
      >
        Continue
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
