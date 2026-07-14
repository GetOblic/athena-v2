"use client";

import { useEffect, useRef, useState } from "react";

type CopyButtonProps = {
  text: string;
};

const ACK_MS = 2000;

async function writeClipboardText(value: string): Promise<void> {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through to legacy path (permissions / insecure context).
    }
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard unavailable");
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  const succeeded = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!succeeded) {
    throw new Error("Clipboard unavailable");
  }
}

export function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  function acknowledgeCopied() {
    setCopied(true);
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      resetTimerRef.current = null;
    }, ACK_MS);
  }

  async function handleCopy() {
    const value = text ?? "";
    if (!value.trim()) {
      return;
    }

    try {
      await writeClipboardText(value);
      acknowledgeCopied();
    } catch {
      // Clipboard unavailable — keep label as Copy; no modal/toast.
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-live="polite"
      aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
      className="shrink-0 rounded-xl border border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 px-4 py-2 text-sm font-medium text-[var(--athena-orange)] transition hover:bg-[var(--athena-orange)]/20"
      style={{ minWidth: "5.5rem" }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
