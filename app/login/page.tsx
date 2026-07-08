export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ message?: string; email?: string; step?: string }>;
}) {
  async function sendCode(formData: FormData) {
    "use server";

    const email = String(formData.get("email") || "").trim().toLowerCase();

    if (!email) {
      redirect("/login?message=Email is required");
    }

    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      },
    });

    if (error) {
      redirect(
        `/login?message=${encodeURIComponent(
          "Access has not yet been granted for this email.",
        )}`,
      );
    }

    redirect(`/login?step=code&email=${encodeURIComponent(email)}&message=Check your inbox for your Athena access code.`);
  }

  async function verifyCode(formData: FormData) {
    "use server";

    const email = String(formData.get("email") || "").trim().toLowerCase();
    const token = String(formData.get("token") || "").trim();

    if (!email || !token) {
      redirect("/login?message=Email and code are required");
    }

    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });

    if (error) {
      redirect(
        `/login?step=code&email=${encodeURIComponent(email)}&message=${encodeURIComponent(
          "Invalid or expired code. Please request a new one.",
        )}`,
      );
    }

    redirect("/");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--athena-bg)] px-6 py-10 text-white">
      <AthenaBrandLink className="mb-10" />

      <div className="w-full max-w-md rounded-[32px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-10 shadow-2xl">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Athena Access
        </div>

        <h1 className="mt-5 text-4xl font-semibold tracking-tight">
          Sign in to Athena
        </h1>

        <p className="mt-4 text-sm leading-7 text-white/50">
          Enter your authorized email address. Athena will send you a secure one-time access code.
        </p>

        <LoginForm searchParams={searchParams} sendCode={sendCode} verifyCode={verifyCode} />
      </div>
    </main>
  );
}

async function LoginForm({
  searchParams,
  sendCode,
  verifyCode,
}: {
  searchParams?: Promise<{ message?: string; email?: string; step?: string }>;
  sendCode: (formData: FormData) => Promise<void>;
  verifyCode: (formData: FormData) => Promise<void>;
}) {
  const params = searchParams ? await searchParams : {};
  const isCodeStep = params?.step === "code";
  const email = params?.email || "";
  const message = params?.message;

  return (
    <>
      {!isCodeStep ? (
        <form action={sendCode} className="mt-8 space-y-5">
          <input
            name="email"
            type="email"
            required
            placeholder="you@getoblic.com"
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-white outline-none placeholder:text-white/25 focus:border-[var(--athena-orange)]"
          />

          <button
            type="submit"
            className="w-full rounded-full bg-[var(--athena-orange)] px-6 py-4 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90"
          >
            Email my access code
          </button>
        </form>
      ) : (
        <form action={verifyCode} className="mt-8 space-y-5">
          <input type="hidden" name="email" value={email} />

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
            Code sent to <span className="text-white">{email}</span>
          </div>

          <input
            name="token"
            type="text"
            required
            inputMode="numeric"
            placeholder="Enter access code"
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-white outline-none placeholder:text-white/25 focus:border-[var(--athena-orange)]"
          />

          <button
            type="submit"
            className="w-full rounded-full bg-[var(--athena-orange)] px-6 py-4 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90"
          >
            Verify code and enter Athena
          </button>
        </form>
      )}

      {message ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/70">
          {message}
        </div>
      ) : null}
    </>
  );
}
