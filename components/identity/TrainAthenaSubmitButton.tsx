"use client";

import { useFormStatus } from "react-dom";

export function TrainAthenaSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="w-fit rounded-full bg-[var(--athena-orange)] px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? "Training Athena..." : "Train Athena"}
    </button>
  );
}
