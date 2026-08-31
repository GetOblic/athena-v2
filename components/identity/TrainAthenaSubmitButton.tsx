"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import {
  playCompletionSound,
  unlockCompletionSound,
} from "@/lib/completionSound/playCompletionSound";

/** Confirmed Train Athena success redirect from saveIdentity. */
export const TRAIN_ATHENA_SUCCESS_REDIRECT_PATH = "/identity";
export const TRAIN_ATHENA_SUCCESS_QUERY = "saved=true";

export function isTrainAthenaSuccessRedirect(
  url: string | null | undefined,
): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url, "http://athena.local");
    return (
      parsed.pathname === TRAIN_ATHENA_SUCCESS_REDIRECT_PATH &&
      parsed.searchParams.get("saved") === "true"
    );
  } catch {
    return false;
  }
}

export function getNextRedirectUrl(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("digest" in error)) {
    return null;
  }

  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT;")) {
    return null;
  }

  const parts = digest.split(";");
  const url = parts[2];
  return url ? url : null;
}

export function isNextRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT")
  );
}

/**
 * Confirmed-success boundary for Train Athena.
 * On success redirect: best-effort completion sound, then rethrow so redirect proceeds.
 */
export async function handleTrainAthenaServerActionResult(
  run: () => Promise<void>,
  play: () => void | Promise<void> = playCompletionSound,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (isNextRedirectError(error)) {
      if (isTrainAthenaSuccessRedirect(getNextRedirectUrl(error))) {
        try {
          void Promise.resolve(play()).catch(() => {
            // Sound failure must never block redirect.
          });
        } catch {
          // Sound failure must never block redirect.
        }
      }
      throw error;
    }
    throw error;
  }
}

type TrainAthenaFormProps = {
  action: (formData: FormData) => Promise<void>;
  children: ReactNode;
  className?: string;
};

/**
 * Client form wrapper: plays completion sound only after confirmed success redirect.
 */
export function TrainAthenaForm({
  action,
  children,
  className,
}: TrainAthenaFormProps) {
  async function clientAction(formData: FormData) {
    // Unlock audio during submit gesture; play only after confirmed success redirect.
    unlockCompletionSound();
    await handleTrainAthenaServerActionResult(() => action(formData));
  }

  return (
    <form action={clientAction} method="post" className={className}>
      {children}
    </form>
  );
}

export function TrainAthenaSubmitButton({
  label = "Train Athena",
  pendingLabel = "Training Athena...",
}: {
  label?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="w-fit rounded-full bg-[var(--athena-orange)] px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
