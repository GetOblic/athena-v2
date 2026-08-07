export const dynamic = "force-dynamic";
export const revalidate = 0;

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getLicenseeAccountByUserId,
  isLicenseeMasterUser,
} from "@/services/licensee/licenseeIdentity";
import { licenseeMasterMarkerCookieWriteOptions } from "@/services/licensee/licenseeMasterMarkerCookie";

/**
 * Business Licensee Master OTP login.
 * Same Supabase Auth project + OTP primitives as /login.
 * shouldCreateUser remains false — Masters are provisioned manually.
 * Never auto-provisions an Athena organization for Master sessions.
 */
export default async function LicenseeLoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ message?: string; email?: string; step?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.id) {
    const licenseeAccount = await getLicenseeAccountByUserId(user.id);
    if (licenseeAccount) {
      redirect("/licensee");
    }
  }

  async function sendCode(formData: FormData) {
    "use server";

    const email = String(formData.get("email") || "").trim().toLowerCase();

    if (!email) {
      redirect("/licensee/login?message=Email is required");
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
        `/licensee/login?message=${encodeURIComponent(
          "Access has not yet been granted for this email.",
        )}`,
      );
    }

    redirect(
      `/licensee/login?step=code&email=${encodeURIComponent(email)}&message=Check your inbox for your Master access code.`,
    );
  }

  async function verifyCode(formData: FormData) {
    "use server";

    const email = String(formData.get("email") || "").trim().toLowerCase();
    const token = String(formData.get("token") || "").trim();

    if (!email || !token) {
      redirect("/licensee/login?message=Email and code are required");
    }

    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });

    if (error) {
      redirect(
        `/licensee/login?step=code&email=${encodeURIComponent(email)}&message=${encodeURIComponent(
          "Invalid or expired code. Please request a new one.",
        )}`,
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id || !(await isLicenseeMasterUser(user.id))) {
      await supabase.auth.signOut();
      redirect(
        `/licensee/login?message=${encodeURIComponent(
          "This email is not authorized as a Business Licensee Master.",
        )}`,
      );
    }

    const cookieStore = await cookies();
    const marker = licenseeMasterMarkerCookieWriteOptions();
    cookieStore.set(marker.name, marker.value, {
      httpOnly: marker.httpOnly,
      sameSite: marker.sameSite,
      secure: marker.secure,
      path: marker.path,
      maxAge: marker.maxAge,
    });

    redirect("/licensee");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--athena-bg)] px-6 py-10 text-white">
      <AthenaBrandLink className="mb-10" />

      <div className="w-full max-w-md rounded-[32px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-10 shadow-2xl">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Business Licensee
        </div>

        <h1 className="mt-5 text-4xl font-semibold tracking-tight">
          Master sign in
        </h1>

        <p className="mt-4 text-sm leading-7 text-white/50">
          Enter your authorized Master email. Athena will send a one-time access code.
        </p>

        <LicenseeLoginForm
          searchParams={searchParams}
          sendCode={sendCode}
          verifyCode={verifyCode}
        />
      </div>
    </main>
  );
}

async function LicenseeLoginForm({
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
            placeholder="licensee@example.com"
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
            Verify code and enter Master dashboard
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
