"use client";

import { useFormStatus } from "react-dom";

type OtpSubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
};

/**
 * Shared OTP form submit presentation for /login and /licensee/login.
 * Uses useFormStatus so server-action submits show immediate loading feedback.
 * Does not alter auth semantics.
 */
export function OtpSubmitButton({
  idleLabel,
  pendingLabel,
}: OtpSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-[var(--athena-orange)] px-6 py-4 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? (
        <>
          <span
            className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
            aria-hidden="true"
          />
          <span>{pendingLabel}</span>
        </>
      ) : (
        <span>{idleLabel}</span>
      )}
    </button>
  );
}
