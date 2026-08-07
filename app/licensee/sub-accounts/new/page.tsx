export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLicenseeAccountByUserId } from "@/services/licensee/licenseeIdentity";
import {
  LicenseeSubAccountCreateError,
  createLicenseeSubAccount,
} from "@/services/licensee/licenseeSubAccounts";

export default async function CreateLicenseeSubAccountPage({
  searchParams,
}: {
  searchParams?: Promise<{
    message?: string;
    email?: string;
    businessName?: string;
    confirm?: string;
  }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    redirect("/licensee/login");
  }

  const licenseeAccount = await getLicenseeAccountByUserId(user.id);
  if (!licenseeAccount) {
    redirect("/");
  }

  async function createSubAccount(formData: FormData) {
    "use server";

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      redirect("/licensee/login");
    }

    const businessName = String(formData.get("businessName") || "");
    const accountEmail = String(formData.get("accountEmail") || "");
    const confirmLinkExisting = formData.get("confirmLinkExisting") === "1";

    try {
      const result = await createLicenseeSubAccount({
        masterUserId: user.id,
        businessName,
        accountEmail,
        confirmLinkExisting,
      });

      if (result.linkedExisting) {
        redirect("/licensee?linked=1");
      }
      redirect("/licensee?created=1");
    } catch (error) {
      // redirect() throws; must not be converted into an error message.
      if (
        typeof error === "object" &&
        error &&
        "digest" in error &&
        typeof (error as { digest?: unknown }).digest === "string" &&
        String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT")
      ) {
        throw error;
      }

      if (
        error instanceof LicenseeSubAccountCreateError &&
        error.code === "EXISTING_ACCOUNT_REQUIRES_CONFIRMATION"
      ) {
        redirect(
          `/licensee/sub-accounts/new?confirm=1&email=${encodeURIComponent(
            accountEmail.trim().toLowerCase(),
          )}&businessName=${encodeURIComponent(businessName.trim())}&message=${encodeURIComponent(
            error.message,
          )}`,
        );
      }

      const message =
        error instanceof Error
          ? error.message
          : "Could not create sub-account.";
      redirect(
        `/licensee/sub-accounts/new?email=${encodeURIComponent(
          accountEmail.trim().toLowerCase(),
        )}&businessName=${encodeURIComponent(businessName.trim())}&message=${encodeURIComponent(
          message,
        )}`,
      );
    }
  }

  const params = searchParams ? await searchParams : {};
  const needsConfirm = params.confirm === "1";

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] px-6 py-10 text-white">
      <div className="mx-auto max-w-xl">
        <AthenaBrandLink className="mb-8" />

        <Link
          href="/licensee"
          className="text-sm text-[var(--athena-orange)]"
        >
          ← Back to Master dashboard
        </Link>

        <div className="mt-10">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            Business Licensee
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">
            Create Sub-account
          </h1>
          <p className="mt-4 text-sm leading-7 text-white/50">
            Creates or links a normal Athena account. The sub-account keeps its
            own login, organization, and Brain.
          </p>
        </div>

        <form action={createSubAccount} className="mt-8 space-y-5">
          <label className="block space-y-2">
            <span className="text-sm text-white/70">Business Name</span>
            <input
              name="businessName"
              type="text"
              required
              defaultValue={params.businessName || ""}
              placeholder="Acme Studio"
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-white outline-none placeholder:text-white/25 focus:border-[var(--athena-orange)]"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-white/70">Account Email</span>
            <input
              name="accountEmail"
              type="email"
              required
              defaultValue={params.email || ""}
              placeholder="client@example.com"
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-white outline-none placeholder:text-white/25 focus:border-[var(--athena-orange)]"
            />
            <span className="block text-sm leading-6 text-white/40">
              This is the email associated with this Athena sub-account and usable for direct Athena access.
            </span>
          </label>

          {needsConfirm ? (
            <label className="flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 text-sm leading-6 text-amber-50">
              <input
                type="checkbox"
                name="confirmLinkExisting"
                value="1"
                required
                className="mt-1"
              />
              <span>
                I confirm this existing Athena account should be linked to my
                Master dashboard. No second organization will be created.
              </span>
            </label>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-full bg-[var(--athena-orange)] px-6 py-4 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90"
          >
            {needsConfirm ? "Confirm and link sub-account" : "Create Sub-account"}
          </button>
        </form>

        {params.message ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/70">
            {params.message}
          </div>
        ) : null}
      </div>
    </main>
  );
}
