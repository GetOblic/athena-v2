export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { getLicenseeLocalization } from "@/lib/licensee/getLicenseeLocalization";
import { licenseeErrorMessage } from "@/lib/licensee/licenseeErrorPresentation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLicenseeAccountByUserId } from "@/services/licensee/licenseeIdentity";
import {
  LicenseeSubAccountCreateError,
  createLicenseeSubAccount,
  getLicenseeOwnCompanySetupState,
} from "@/services/licensee/licenseeSubAccounts";
import {
  ORGANIZATION_LANGUAGES,
  ORGANIZATION_LANGUAGE_LABELS,
  isOrganizationLanguage,
  parseOrganizationLanguage,
  resolveOrganizationLanguageValue,
} from "@/services/organizationLanguage";
import { isAccountAccessActive } from "@/services/superAdmin/accountAccessStatus";

export default async function CreateLicenseeSubAccountPage({
  searchParams,
}: {
  searchParams?: Promise<{
    message?: string;
    error?: string;
    email?: string;
    businessName?: string;
    language?: string;
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

  if (!(await isAccountAccessActive(user.id))) {
    redirect(
      `/licensee/login?message=${encodeURIComponent(
        "This Master account has been deactivated.",
      )}`,
    );
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
    const accountLanguageRaw = String(formData.get("accountLanguage") || "");
    const confirmLinkExisting = formData.get("confirmLinkExisting") === "1";

    const formQuery = (errorCode: string) =>
      `/licensee/sub-accounts/new?email=${encodeURIComponent(
        accountEmail.trim().toLowerCase(),
      )}&businessName=${encodeURIComponent(
        businessName.trim(),
      )}&language=${encodeURIComponent(accountLanguageRaw)}&error=${encodeURIComponent(
        errorCode,
      )}`;

    let accountLanguage;
    try {
      accountLanguage = parseOrganizationLanguage(accountLanguageRaw);
    } catch {
      redirect(formQuery("INVALID_LANGUAGE"));
    }

    try {
      const result = await createLicenseeSubAccount({
        masterUserId: user.id,
        businessName,
        accountEmail,
        confirmLinkExisting,
        language: accountLanguage,
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
          )}&businessName=${encodeURIComponent(
            businessName.trim(),
          )}&language=${encodeURIComponent(
            accountLanguageRaw,
          )}&error=${encodeURIComponent(error.code)}`,
        );
      }

      const errorCode =
        error instanceof LicenseeSubAccountCreateError
          ? error.code
          : "CREATE_FAILED";
      redirect(formQuery(errorCode));
    }
  }

  const params = searchParams ? await searchParams : {};
  const needsConfirm = params.confirm === "1";
  const selectedLanguage = isOrganizationLanguage(params.language)
    ? params.language
    : resolveOrganizationLanguageValue(licenseeAccount.default_language);
  const setupState = await getLicenseeOwnCompanySetupState(user.id);
  const isFirstCompanySetup = setupState.isFirstCompanySetup;
  const { messages } = getLicenseeLocalization(
    licenseeAccount.default_language,
  );
  const create = messages.subAccountCreate;
  const displayedError = params.error
    ? licenseeErrorMessage(messages, params.error)
    : params.message
      ? needsConfirm
        ? messages.errors.existingRequiresConfirmation
        : messages.errors.generic
      : null;

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] px-6 py-10 text-white">
      <div className="mx-auto max-w-xl">
        <AthenaBrandLink className="mb-8" />

        <Link
          href="/licensee"
          className="text-sm text-[var(--athena-orange)]"
        >
          {messages.common.backToMasterDashboard}
        </Link>

        <div className="mt-10">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            {messages.brand.businessLicensee}
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">
            {isFirstCompanySetup
              ? create.createCompanyTitle
              : create.createSubAccountTitle}
          </h1>
          <p className="mt-4 text-sm leading-7 text-white/50">
            {isFirstCompanySetup
              ? create.createCompanyDescription
              : create.createSubAccountDescription}
          </p>
        </div>

        <form action={createSubAccount} className="mt-8 space-y-5">
          <label className="block space-y-2">
            <span className="text-sm text-white/70">{create.businessName}</span>
            <input
              name="businessName"
              type="text"
              required
              defaultValue={params.businessName || ""}
              placeholder={create.businessNamePlaceholder}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-white outline-none placeholder:text-white/25 focus:border-[var(--athena-orange)]"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-white/70">{create.accountEmail}</span>
            <input
              name="accountEmail"
              type="email"
              required
              defaultValue={params.email || ""}
              placeholder={create.accountEmailPlaceholder}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-white outline-none placeholder:text-white/25 focus:border-[var(--athena-orange)]"
            />
            <span className="block text-sm leading-6 text-white/40">
              {create.accountEmailHelp}
            </span>
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-white/70">
              {create.accountLanguage}
            </span>
            <select
              name="accountLanguage"
              required
              defaultValue={selectedLanguage}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-white outline-none focus:border-[var(--athena-orange)]"
            >
              {ORGANIZATION_LANGUAGES.map((code) => (
                <option key={code} value={code} className="bg-black text-white">
                  {ORGANIZATION_LANGUAGE_LABELS[code]}
                </option>
              ))}
            </select>
            <span className="block text-sm leading-6 text-white/40">
              {create.accountLanguageHelp}
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
              <span>{create.confirmLinkExisting}</span>
            </label>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-full bg-[var(--athena-orange)] px-6 py-4 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90"
          >
            {needsConfirm
              ? create.submitConfirmLink
              : isFirstCompanySetup
                ? create.submitCreateCompany
                : create.submitCreateSubAccount}
          </button>
        </form>

        {displayedError ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/70">
            {displayedError}
          </div>
        ) : null}
      </div>
    </main>
  );
}
