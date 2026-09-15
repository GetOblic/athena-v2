"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SuperAdminAthenaAccountsSection } from "@/components/superAdmin/SuperAdminAthenaAccountsSection";
import { SuperAdminDomainNav } from "@/components/superAdmin/SuperAdminDomainNav";
import { SuperAdminFlashNotices } from "@/components/superAdmin/SuperAdminFlashNotices";
import { SuperAdminLicenseeDirectory } from "@/components/superAdmin/SuperAdminLicenseeDirectory";
import { SuperAdminOverviewSection } from "@/components/superAdmin/SuperAdminOverviewSection";
import { SuperAdminSystemConfiguration } from "@/components/superAdmin/SuperAdminSystemConfiguration";
import {
  buildSuperAdminDashboardView,
  DEFAULT_SUPER_ADMIN_DOMAIN,
  superAdminAllocationKey,
  type SuperAdminDomainId,
} from "@/lib/superAdmin/superAdminDashboardView";
import { SUPER_ADMIN_INPUT_CLASS } from "@/lib/superAdmin/superAdminPresentation";
import {
  DEFAULT_ORGANIZATION_LANGUAGE,
  ORGANIZATION_LANGUAGES,
  ORGANIZATION_LANGUAGE_LABELS,
  isOrganizationLanguage,
  type OrganizationLanguage,
} from "@/services/organizationLanguage";
import type { ManageableAccount } from "@/services/superAdmin/superAdminAccounts";
import type {
  SuperAdminGetOblicDirectoryAllocationModel,
  SuperAdminGetOblicDirectoryAllocationRow,
} from "@/services/superAdmin/superAdminGetOblicDirectory";
import {
  LICENSEE_MONTHLY_FEE_LABEL,
  SUB_ACCOUNT_MONTHLY_FEE_LABEL,
  type LicenseeCommercialFees,
} from "@/services/superAdmin/superAdminLicenseeCommercialFeeTypes";
import {
  LICENSEE_DEFAULT_LANGUAGE_LABEL,
  type LicenseeDefaultLanguageSetting,
} from "@/services/superAdmin/superAdminLicenseeDefaultLanguageTypes";

type GovernedInstructionState = {
  instructionText: string;
  revisionId: string | null;
  updatedAt: string | null;
  configured: boolean;
};

type SuperAdminDashboardClientProps = {
  initialAccounts: ManageableAccount[];
  initialDirectoryAllocations: SuperAdminGetOblicDirectoryAllocationModel;
  initialLicenseeCommercialFees: LicenseeCommercialFees[];
  initialLicenseeDefaultLanguages: LicenseeDefaultLanguageSetting[];
  initialTrendSocialPromptInstruction: GovernedInstructionState;
  initialEstimatePricingMethodologyInstruction: GovernedInstructionState;
  notice?: string | null;
};

type AllocationSaveApiBody = ApiErrorBody & {
  allocation?: SuperAdminGetOblicDirectoryAllocationRow;
};

type CommercialFeeSaveApiBody = ApiErrorBody & {
  fees?: LicenseeCommercialFees;
};

type DefaultLanguageSaveApiBody = ApiErrorBody & {
  setting?: LicenseeDefaultLanguageSetting;
};

type ApiErrorBody = {
  ok?: boolean;
  error?: { code?: string; message?: string };
};

type GovernedInstructionApiBody = ApiErrorBody & {
  instruction?: {
    instructionText?: string;
    revisionId?: string | null;
    updatedAt?: string | null;
    configured?: boolean;
  };
};

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as ApiErrorBody;
  if (!response.ok || payload.ok === false) {
    throw new Error(
      payload.error?.message || `Request failed (${response.status}).`,
    );
  }
  return payload;
}

async function putJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as GovernedInstructionApiBody;
  if (!response.ok || payload.ok === false) {
    throw new Error(
      payload.error?.message || `Request failed (${response.status}).`,
    );
  }
  return payload;
}

async function patchJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as ApiErrorBody;
  if (!response.ok || payload.ok === false) {
    throw new Error(
      payload.error?.message || `Request failed (${response.status}).`,
    );
  }
  return payload;
}

export function SuperAdminDashboardClient({
  initialAccounts,
  initialDirectoryAllocations,
  initialLicenseeCommercialFees,
  initialLicenseeDefaultLanguages,
  initialTrendSocialPromptInstruction,
  initialEstimatePricingMethodologyInstruction,
  notice,
}: SuperAdminDashboardClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [localNotice, setLocalNotice] = useState<string | null>(notice ?? null);
  const [domain, setDomain] = useState<SuperAdminDomainId>(
    DEFAULT_SUPER_ADMIN_DOMAIN,
  );

  const [athenaEmail, setAthenaEmail] = useState("");
  const [athenaOrgName, setAthenaOrgName] = useState("");
  const [athenaLanguage, setAthenaLanguage] = useState<OrganizationLanguage>(
    DEFAULT_ORGANIZATION_LANGUAGE,
  );
  const [licenseeEmail, setLicenseeEmail] = useState("");
  const [licenseeName, setLicenseeName] = useState("");
  const [licenseeDefaultLanguage, setLicenseeDefaultLanguage] =
    useState<OrganizationLanguage>(DEFAULT_ORGANIZATION_LANGUAGE);
  const [trendSocialPromptText, setTrendSocialPromptText] = useState(
    initialTrendSocialPromptInstruction.instructionText,
  );
  const [trendSocialPromptMeta, setTrendSocialPromptMeta] = useState({
    revisionId: initialTrendSocialPromptInstruction.revisionId,
    updatedAt: initialTrendSocialPromptInstruction.updatedAt,
    configured: initialTrendSocialPromptInstruction.configured,
  });
  const [estimateMethodologyText, setEstimateMethodologyText] = useState(
    initialEstimatePricingMethodologyInstruction.instructionText,
  );
  const [estimateMethodologyMeta, setEstimateMethodologyMeta] = useState({
    revisionId: initialEstimatePricingMethodologyInstruction.revisionId,
    updatedAt: initialEstimatePricingMethodologyInstruction.updatedAt,
    configured: initialEstimatePricingMethodologyInstruction.configured,
  });
  const [directoryAllocations, setDirectoryAllocations] = useState(
    initialDirectoryAllocations,
  );
  const [savingAllocationKey, setSavingAllocationKey] = useState<string | null>(
    null,
  );
  const [savingAccountKey, setSavingAccountKey] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
  const [allowanceDrafts, setAllowanceDrafts] = useState<
    Record<string, string>
  >(() => buildAllowanceDrafts(initialDirectoryAllocations));
  const [accountEmailDrafts, setAccountEmailDrafts] = useState<
    Record<string, string>
  >(() => buildAccountEmailDrafts(initialDirectoryAllocations));
  const [accountWordpressUserIdDrafts, setAccountWordpressUserIdDrafts] =
    useState<Record<string, string>>(() =>
      buildWordpressUserIdDrafts(initialDirectoryAllocations),
    );
  const [licenseeCommercialFees, setLicenseeCommercialFees] = useState(
    initialLicenseeCommercialFees,
  );
  const [feeDrafts, setFeeDrafts] = useState<Record<string, FeeDrafts>>(() =>
    buildFeeDrafts(initialLicenseeCommercialFees),
  );
  const [savingFeeKey, setSavingFeeKey] = useState<string | null>(null);
  const [licenseeDefaultLanguages, setLicenseeDefaultLanguages] = useState(
    initialLicenseeDefaultLanguages,
  );
  const [languageDrafts, setLanguageDrafts] = useState<
    Record<string, OrganizationLanguage>
  >(() => buildLanguageDrafts(initialLicenseeDefaultLanguages));
  const [savingLanguageKey, setSavingLanguageKey] = useState<string | null>(
    null,
  );

  const view = buildSuperAdminDashboardView({
    accounts: initialAccounts,
    directoryAllocations,
    licenseeCommercialFees,
    licenseeDefaultLanguages,
    trendSocialPromptConfigured: trendSocialPromptMeta.configured,
    estimateMethodologyConfigured: estimateMethodologyMeta.configured,
  });

  function refresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  async function createAthena(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLocalNotice(null);
    try {
      await postJson("/api/super/accounts/athena", {
        email: athenaEmail,
        organizationName: athenaOrgName,
        language: athenaLanguage,
      });
      setAthenaEmail("");
      setAthenaOrgName("");
      setAthenaLanguage(DEFAULT_ORGANIZATION_LANGUAGE);
      setLocalNotice("Normal Athena account created.");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create Athena failed.");
    }
  }

  async function createLicensee(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLocalNotice(null);
    try {
      await postJson("/api/super/accounts/licensee", {
        email: licenseeEmail,
        businessName: licenseeName || undefined,
        defaultLanguage: licenseeDefaultLanguage,
      });
      setLicenseeEmail("");
      setLicenseeName("");
      setLicenseeDefaultLanguage(DEFAULT_ORGANIZATION_LANGUAGE);
      setLocalNotice("Business Licensee Master created.");
      refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Create Licensee Master failed.",
      );
    }
  }

  async function setAccess(userId: string, action: "deactivate" | "reactivate") {
    setError(null);
    setLocalNotice(null);
    try {
      await postJson(`/api/super/accounts/${action}`, { userId });
      setLocalNotice(
        action === "deactivate"
          ? "Account deactivated. Identity and tenant data were retained."
          : "Account reactivated.",
      );
      refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : action === "deactivate"
            ? "Deactivate failed."
            : "Reactivate failed.",
      );
    }
  }

  async function saveTrendSocialPrompt(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLocalNotice(null);
    try {
      const payload = await putJson(
        "/api/super/strategic-blueprints/trend-social-prompt",
        { instructionText: trendSocialPromptText },
      );
      const next = payload.instruction;
      setTrendSocialPromptText(String(next?.instructionText ?? ""));
      setTrendSocialPromptMeta({
        revisionId: next?.revisionId ?? null,
        updatedAt: next?.updatedAt ?? null,
        configured: Boolean(next?.configured),
      });
      setLocalNotice(
        "Trend Social Prompt instruction saved. Future Strategic Asset Blueprint generations will use this instruction.",
      );
      refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Save Trend Social Prompt instruction failed.",
      );
    }
  }

  function allocationKey(row: SuperAdminGetOblicDirectoryAllocationRow) {
    return superAdminAllocationKey(row);
  }

  function updateAllocationDraft(
    row: SuperAdminGetOblicDirectoryAllocationRow,
    value: string,
  ) {
    setAllowanceDrafts((current) => ({
      ...current,
      [allocationKey(row)]: value,
    }));
  }

  function updateAccountEmailDraft(
    row: SuperAdminGetOblicDirectoryAllocationRow,
    value: string,
  ) {
    setAccountEmailDrafts((current) => ({
      ...current,
      [allocationKey(row)]: value,
    }));
  }

  function updateAccountWordpressUserIdDraft(
    row: SuperAdminGetOblicDirectoryAllocationRow,
    value: string,
  ) {
    setAccountWordpressUserIdDrafts((current) => ({
      ...current,
      [allocationKey(row)]: value,
    }));
  }

  async function saveDirectoryAllowance(
    row: SuperAdminGetOblicDirectoryAllocationRow,
  ) {
    const key = allocationKey(row);
    const raw = (allowanceDrafts[key] ?? "").trim();
    const listingCapacity = raw === "" ? null : Number(raw);

    setError(null);
    setLocalNotice(null);
    setSavingAllocationKey(key);
    try {
      const payload = (await putJson(
        "/api/super/getoblic-directory/settings",
        {
          licenseeAccountId: row.licenseeAccountId,
          organizationId: row.organizationId,
          listingCapacity,
        },
      )) as AllocationSaveApiBody;
      const next = payload.allocation;
      if (!next) {
        throw new Error("Save succeeded without a refreshed allocation.");
      }
      setDirectoryAllocations((current) => replaceAllocationRow(current, next));
      setAllowanceDrafts((current) => ({
        ...current,
        [allocationKey(next)]: next.configured
          ? String(next.listingCapacity ?? "")
          : "",
      }));
      setLocalNotice("GetOblic listing capacity saved.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Save GetOblic listing capacity failed.",
      );
    } finally {
      setSavingAllocationKey(null);
    }
  }

  async function saveDirectoryAccount(
    row: SuperAdminGetOblicDirectoryAllocationRow,
  ) {
    const key = allocationKey(row);
    const email = (accountEmailDrafts[key] ?? "").trim();
    const rawWordpressUserId = (
      accountWordpressUserIdDrafts[key] ?? ""
    ).trim();
    const wordpressUserId =
      rawWordpressUserId === "" ? null : Number(rawWordpressUserId);

    setAccountError(null);
    setAccountNotice(null);
    setSavingAccountKey(key);
    try {
      const payload = (await patchJson(
        "/api/super/getoblic-directory/account",
        {
          licenseeAccountId: row.licenseeAccountId,
          organizationId: row.organizationId,
          email,
          wordpressUserId,
        },
      )) as AllocationSaveApiBody;
      const next = payload.allocation;
      if (!next) {
        throw new Error("Save succeeded without a refreshed account.");
      }
      setDirectoryAllocations((current) => replaceAllocationRow(current, next));
      setAccountEmailDrafts((current) => ({
        ...current,
        [allocationKey(next)]: next.getoblicAccountEmail ?? "",
      }));
      setAccountWordpressUserIdDrafts((current) => ({
        ...current,
        [allocationKey(next)]:
          next.wordpressUserId == null ? "" : String(next.wordpressUserId),
      }));
      setAccountNotice("GetOblic.com account saved.");
    } catch (err) {
      setAccountError(
        err instanceof Error
          ? err.message
          : "Save GetOblic.com account failed.",
      );
    } finally {
      setSavingAccountKey(null);
    }
  }

  function feeDraftKey(licenseeAccountId: string) {
    return licenseeAccountId;
  }

  function feesForLicensee(licenseeAccountId: string): LicenseeCommercialFees {
    return (
      licenseeCommercialFees.find(
        (row) => row.licenseeAccountId === licenseeAccountId,
      ) ?? {
        licenseeAccountId,
        masterEmail: "",
        licenseeMonthlyFeeUsd: 0,
        subAccountMonthlyFeeUsd: 0,
      }
    );
  }

  function updateFeeDraft(
    licenseeAccountId: string,
    field: keyof FeeDrafts,
    value: string,
  ) {
    setFeeDrafts((current) => ({
      ...current,
      [feeDraftKey(licenseeAccountId)]: {
        ...(current[feeDraftKey(licenseeAccountId)] ?? {
          licenseeMonthlyFeeUsd: "0.00",
          subAccountMonthlyFeeUsd: "0.00",
        }),
        [field]: value,
      },
    }));
  }

  async function saveLicenseeCommercialFee(
    licenseeAccountId: string,
    field: keyof FeeDrafts,
  ) {
    const drafts =
      feeDrafts[feeDraftKey(licenseeAccountId)] ??
      defaultFeeDrafts(feesForLicensee(licenseeAccountId));
    const parsed = parseFeeDraft(drafts[field]);
    const key = `${licenseeAccountId}:${field}`;

    setError(null);
    setLocalNotice(null);
    if (parsed === null) {
      setError(
        `${
          field === "licenseeMonthlyFeeUsd"
            ? LICENSEE_MONTHLY_FEE_LABEL
            : SUB_ACCOUNT_MONTHLY_FEE_LABEL
        } must be a non-negative USD amount with at most two decimal places.`,
      );
      return;
    }

    setSavingFeeKey(key);
    try {
      const payload = (await patchJson(
        "/api/super/accounts/licensee/commercial-fees",
        {
          licenseeAccountId,
          [field]: parsed,
        },
      )) as CommercialFeeSaveApiBody;
      const next = payload.fees;
      if (!next) {
        throw new Error("Save succeeded without refreshed commercial fees.");
      }
      setLicenseeCommercialFees((current) => replaceFeeRow(current, next));
      setFeeDrafts((current) => ({
        ...current,
        [feeDraftKey(next.licenseeAccountId)]: defaultFeeDrafts(next),
      }));
      setLocalNotice(
        field === "licenseeMonthlyFeeUsd"
          ? "Licensee Monthly Fee saved."
          : "Sub-Account Monthly Fee saved.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Save Licensee commercial fee failed.",
      );
    } finally {
      setSavingFeeKey(null);
    }
  }

  function languageDraftFor(licenseeAccountId: string): OrganizationLanguage {
    return (
      languageDrafts[licenseeAccountId] ??
      licenseeDefaultLanguages.find(
        (row) => row.licenseeAccountId === licenseeAccountId,
      )?.defaultLanguage ??
      DEFAULT_ORGANIZATION_LANGUAGE
    );
  }

  function updateLanguageDraft(
    licenseeAccountId: string,
    value: OrganizationLanguage,
  ) {
    setLanguageDrafts((current) => ({
      ...current,
      [licenseeAccountId]: value,
    }));
  }

  async function saveLicenseeDefaultLanguage(licenseeAccountId: string) {
    const nextLanguage = languageDraftFor(licenseeAccountId);

    setError(null);
    setLocalNotice(null);
    setSavingLanguageKey(licenseeAccountId);
    try {
      const payload = (await patchJson(
        "/api/super/accounts/licensee/default-language",
        {
          licenseeAccountId,
          defaultLanguage: nextLanguage,
        },
      )) as DefaultLanguageSaveApiBody;
      const next = payload.setting;
      if (!next) {
        throw new Error("Save succeeded without a refreshed default language.");
      }
      setLicenseeDefaultLanguages((current) =>
        replaceLanguageRow(current, next),
      );
      setLanguageDrafts((current) => ({
        ...current,
        [next.licenseeAccountId]: next.defaultLanguage,
      }));
      setLocalNotice(`${LICENSEE_DEFAULT_LANGUAGE_LABEL} saved.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Save Licensee default language failed.",
      );
    } finally {
      setSavingLanguageKey(null);
    }
  }

  async function saveEstimatePricingMethodology(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLocalNotice(null);
    try {
      const payload = await putJson(
        "/api/super/estimate/pricing-methodology",
        { instructionText: estimateMethodologyText },
      );
      const next = payload.instruction;
      setEstimateMethodologyText(String(next?.instructionText ?? ""));
      setEstimateMethodologyMeta({
        revisionId: next?.revisionId ?? null,
        updatedAt: next?.updatedAt ?? null,
        configured: Boolean(next?.configured),
      });
      setLocalNotice(
        "Athena Estimate pricing methodology saved. Future Estimate generations will use this instruction. Historical Ready Estimates are unchanged.",
      );
      refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Save Estimate pricing methodology failed.",
      );
    }
  }

  const athenaCreateFields = (
    <>
      <input
        type="email"
        required
        value={athenaEmail}
        onChange={(event) => setAthenaEmail(event.target.value)}
        placeholder="owner@example.com"
        className={SUPER_ADMIN_INPUT_CLASS}
      />
      <input
        type="text"
        required
        value={athenaOrgName}
        onChange={(event) => setAthenaOrgName(event.target.value)}
        placeholder="Organization / business name"
        className={SUPER_ADMIN_INPUT_CLASS}
      />
      <label className="block space-y-2">
        <span className="text-sm text-white/70">Account Language</span>
        <select
          required
          value={athenaLanguage}
          onChange={(event) => {
            const next = event.target.value;
            if (isOrganizationLanguage(next)) {
              setAthenaLanguage(next);
            }
          }}
          className={SUPER_ADMIN_INPUT_CLASS}
        >
          {ORGANIZATION_LANGUAGES.map((code) => (
            <option key={code} value={code} className="bg-black text-white">
              {ORGANIZATION_LANGUAGE_LABELS[code]}
            </option>
          ))}
        </select>
        <span className="block text-sm leading-6 text-white/40">
          Sets the language Athena will use for this account.
        </span>
      </label>
    </>
  );

  const licenseeCreateFields = (
    <>
      <input
        type="email"
        required
        value={licenseeEmail}
        onChange={(event) => setLicenseeEmail(event.target.value)}
        placeholder="master@example.com"
        className={SUPER_ADMIN_INPUT_CLASS}
      />
      <input
        type="text"
        value={licenseeName}
        onChange={(event) => setLicenseeName(event.target.value)}
        placeholder="Licensee / business name (optional)"
        className={SUPER_ADMIN_INPUT_CLASS}
      />
      <label className="block space-y-2">
        <span className="text-sm text-white/70">
          {LICENSEE_DEFAULT_LANGUAGE_LABEL}
        </span>
        <select
          required
          value={licenseeDefaultLanguage}
          onChange={(event) => {
            const next = event.target.value;
            if (isOrganizationLanguage(next)) {
              setLicenseeDefaultLanguage(next);
            }
          }}
          className={SUPER_ADMIN_INPUT_CLASS}
        >
          {ORGANIZATION_LANGUAGES.map((code) => (
            <option key={code} value={code} className="bg-black text-white">
              {ORGANIZATION_LANGUAGE_LABELS[code]}
            </option>
          ))}
        </select>
        <span className="block text-sm leading-6 text-white/40">
          Initial Athena language for future sub-accounts created by this
          Licensee. Existing organizations are not changed.
        </span>
      </label>
    </>
  );

  return (
    <div className="space-y-8">
      <SuperAdminFlashNotices
        notices={[localNotice, accountNotice]}
        errors={[error, accountError]}
      />

      <SuperAdminDomainNav activeDomain={domain} onDomainChange={setDomain} />

      {domain === "overview" ? (
        <SuperAdminOverviewSection
          counts={view.overview}
          onNavigate={setDomain}
        />
      ) : null}

      {domain === "licensees" ? (
        <SuperAdminLicenseeDirectory
          licensees={view.licensees}
          pending={isPending}
          onCreateSubmit={createLicensee}
          createFields={licenseeCreateFields}
          feeDrafts={feeDrafts}
          savingFeeKey={savingFeeKey}
          onFeeDraftChange={updateFeeDraft}
          onSaveFee={saveLicenseeCommercialFee}
          languageDrafts={languageDrafts}
          savingLanguageKey={savingLanguageKey}
          onLanguageDraftChange={updateLanguageDraft}
          onSaveDefaultLanguage={saveLicenseeDefaultLanguage}
          onSetAccess={setAccess}
          allowanceDrafts={allowanceDrafts}
          accountEmailDrafts={accountEmailDrafts}
          accountWordpressUserIdDrafts={accountWordpressUserIdDrafts}
          savingAllocationKey={savingAllocationKey}
          savingAccountKey={savingAccountKey}
          allocationKeyFor={allocationKey}
          onCapacityDraftChange={updateAllocationDraft}
          onEmailDraftChange={updateAccountEmailDraft}
          onWordpressUserIdDraftChange={updateAccountWordpressUserIdDraft}
          onSaveCapacity={saveDirectoryAllowance}
          onSaveAccount={saveDirectoryAccount}
        />
      ) : null}

      {domain === "athena-accounts" ? (
        <SuperAdminAthenaAccountsSection
          accounts={view.athenaAccounts}
          pending={isPending}
          onCreateSubmit={createAthena}
          createFields={athenaCreateFields}
          onSetAccess={setAccess}
        />
      ) : null}

      {domain === "system-configuration" ? (
        <SuperAdminSystemConfiguration
          pending={isPending}
          trendSocialPromptText={trendSocialPromptText}
          trendSocialPromptMeta={trendSocialPromptMeta}
          onTrendSocialPromptTextChange={setTrendSocialPromptText}
          onSaveTrendSocialPrompt={saveTrendSocialPrompt}
          estimateMethodologyText={estimateMethodologyText}
          estimateMethodologyMeta={estimateMethodologyMeta}
          onEstimateMethodologyTextChange={setEstimateMethodologyText}
          onSaveEstimatePricingMethodology={saveEstimatePricingMethodology}
        />
      ) : null}
    </div>
  );
}

type FeeDrafts = {
  licenseeMonthlyFeeUsd: string;
  subAccountMonthlyFeeUsd: string;
};

function defaultFeeDrafts(fees: LicenseeCommercialFees): FeeDrafts {
  return {
    licenseeMonthlyFeeUsd: fees.licenseeMonthlyFeeUsd.toFixed(2),
    subAccountMonthlyFeeUsd: fees.subAccountMonthlyFeeUsd.toFixed(2),
  };
}

function buildFeeDrafts(
  rows: LicenseeCommercialFees[],
): Record<string, FeeDrafts> {
  const drafts: Record<string, FeeDrafts> = {};
  for (const row of rows) {
    drafts[row.licenseeAccountId] = defaultFeeDrafts(row);
  }
  return drafts;
}

function parseFeeDraft(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

function replaceFeeRow(
  rows: LicenseeCommercialFees[],
  next: LicenseeCommercialFees,
): LicenseeCommercialFees[] {
  let replaced = false;
  const updated = rows.map((row) => {
    if (row.licenseeAccountId !== next.licenseeAccountId) {
      return row;
    }
    replaced = true;
    return next;
  });
  return replaced ? updated : [...updated, next];
}

function buildLanguageDrafts(
  rows: LicenseeDefaultLanguageSetting[],
): Record<string, OrganizationLanguage> {
  const drafts: Record<string, OrganizationLanguage> = {};
  for (const row of rows) {
    drafts[row.licenseeAccountId] = row.defaultLanguage;
  }
  return drafts;
}

function replaceLanguageRow(
  rows: LicenseeDefaultLanguageSetting[],
  next: LicenseeDefaultLanguageSetting,
): LicenseeDefaultLanguageSetting[] {
  let replaced = false;
  const updated = rows.map((row) => {
    if (row.licenseeAccountId !== next.licenseeAccountId) {
      return row;
    }
    replaced = true;
    return next;
  });
  return replaced ? updated : [...updated, next];
}

function buildAllowanceDrafts(
  model: SuperAdminGetOblicDirectoryAllocationModel,
): Record<string, string> {
  const drafts: Record<string, string> = {};
  for (const group of model.groups) {
    for (const row of group.subAccounts) {
      drafts[`${row.licenseeAccountId}:${row.organizationId}`] = row.configured
        ? String(row.listingCapacity ?? "")
        : "";
    }
  }
  return drafts;
}

function buildAccountEmailDrafts(
  model: SuperAdminGetOblicDirectoryAllocationModel,
): Record<string, string> {
  const drafts: Record<string, string> = {};
  for (const group of model.groups) {
    for (const row of group.subAccounts) {
      drafts[`${row.licenseeAccountId}:${row.organizationId}`] =
        row.getoblicAccountEmail ?? "";
    }
  }
  return drafts;
}

function buildWordpressUserIdDrafts(
  model: SuperAdminGetOblicDirectoryAllocationModel,
): Record<string, string> {
  const drafts: Record<string, string> = {};
  for (const group of model.groups) {
    for (const row of group.subAccounts) {
      drafts[`${row.licenseeAccountId}:${row.organizationId}`] =
        row.wordpressUserId == null ? "" : String(row.wordpressUserId);
    }
  }
  return drafts;
}

function replaceAllocationRow(
  model: SuperAdminGetOblicDirectoryAllocationModel,
  next: SuperAdminGetOblicDirectoryAllocationRow,
): SuperAdminGetOblicDirectoryAllocationModel {
  return {
    groups: model.groups.map((group) => {
      if (group.licenseeAccountId !== next.licenseeAccountId) {
        return group;
      }
      return {
        ...group,
        subAccounts: group.subAccounts.map((row) =>
          row.organizationId === next.organizationId ? next : row,
        ),
      };
    }),
  };
}
