export const dynamic = "force-dynamic";
export const revalidate = 0;

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OtpSubmitButton } from "@/components/auth/OtpSubmitButton";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SuperAdminAuthorityLookupError,
  getSuperAdminByUserId,
  isGetOblicSuperAdminUser,
} from "@/services/superAdmin/superAdminIdentity";
import { licenseeMasterMarkerCookieClearOptions } from "@/services/licensee/licenseeMasterMarkerCookie";
import { superAdminMarkerCookieWriteOptions } from "@/services/superAdmin/superAdminMarkerCookie";

/**
 * GetOblic Super Admin OTP login.
 * Same Supabase Auth project + OTP primitives as /login and /licensee/login.
 * shouldCreateUser remains false — Super Admins are bootstrapped operationally.
 * Never auto-provisions an Athena organization for Super Admin sessions.
 */
export default async function SuperAdminLoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ message?: string; email?: string; step?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.id) {
    try {
      const superAdmin = await getSuperAdminByUserId(user.id);
      if (superAdmin) {
        redirect("/super");
      }
    } catch (error) {
      // Authority lookup failure denies /super access (fail closed).
      if (!(error instanceof SuperAdminAuthorityLookupError)) {
        throw error;
      }
    }
  }

  async function sendCode(formData: FormData) {
    "use server";

    const email = String(formData.get("email") || "").trim().toLowerCase();

    if (!email) {
      redirect("/super/login?message=Email is required");
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
        `/super/login?message=${encodeURIComponent(
          "Access has not yet been granted for this email.",
        )}`,
      );
    }

    redirect(
      `/super/login?step=code&email=${encodeURIComponent(email)}&message=Check your inbox for your Super Admin access code.`,
    );
  }

  async function verifyCode(formData: FormData) {
    "use server";

    const email = String(formData.get("email") || "").trim().toLowerCase();
    const token = String(formData.get("token") || "").trim();

    if (!email || !token) {
      redirect("/super/login?message=Email and code are required");
    }

    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });

    if (error) {
      redirect(
        `/super/login?step=code&email=${encodeURIComponent(email)}&message=${encodeURIComponent(
          "Invalid or expired code. Please request a new one.",
        )}`,
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let authorized = false;
    try {
      authorized = Boolean(
        user?.id && (await isGetOblicSuperAdminUser(user.id)),
      );
    } catch (error) {
      // Unexpected authority lookup failure: deny /super (fail closed).
      if (!(error instanceof SuperAdminAuthorityLookupError)) {
        throw error;
      }
      authorized = false;
    }

    if (!user?.id || !authorized) {
      await supabase.auth.signOut();
      redirect(
        `/super/login?message=${encodeURIComponent(
          "This email is not authorized as a GetOblic Super Admin.",
        )}`,
      );
    }

    const cookieStore = await cookies();
    const marker = superAdminMarkerCookieWriteOptions();
    cookieStore.set(marker.name, marker.value, {
      httpOnly: marker.httpOnly,
      sameSite: marker.sameSite,
      secure: marker.secure,
      path: marker.path,
      maxAge: marker.maxAge,
    });
    const staleLicensee = licenseeMasterMarkerCookieClearOptions();
    cookieStore.set(staleLicensee.name, staleLicensee.value, {
      httpOnly: staleLicensee.httpOnly,
      sameSite: staleLicensee.sameSite,
      secure: staleLicensee.secure,
      path: staleLicensee.path,
      maxAge: staleLicensee.maxAge,
    });

    redirect("/super");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--athena-bg)] px-6 py-10 text-white">
      <AthenaBrandLink className="mb-10" />

      <div className="w-full max-w-md rounded-[32px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-10 shadow-2xl">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          GetOblic Super Admin
        </div>

        <h1 className="mt-5 text-4xl font-semibold tracking-tight">
          Super Admin sign in
        </h1>

        <p className="mt-4 text-sm leading-7 text-white/50">
          Enter your authorized GetOblic administrator email. Athena will send a
          one-time access code.
        </p>

        <SuperAdminLoginForm
          searchParams={searchParams}
          sendCode={sendCode}
          verifyCode={verifyCode}
        />
      </div>
    </main>
  );
}

async function SuperAdminLoginForm({
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
            placeholder="admin@getoblic.com"
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-white outline-none placeholder:text-white/25 focus:border-[var(--athena-orange)]"
          />

          <OtpSubmitButton
            idleLabel="Email my access code"
            pendingLabel="Sending access code…"
          />
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

          <OtpSubmitButton
            idleLabel="Verify code and enter Super Admin"
            pendingLabel="Verifying code…"
          />
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
