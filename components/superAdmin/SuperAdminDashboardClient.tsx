"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS } from "@/services/estimate/athenaEstimateTypes";
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

type GovernedInstructionState = {
  instructionText: string;
  revisionId: string | null;
  updatedAt: string | null;
  configured: boolean;
};

type SuperAdminDashboardClientProps = {
  initialAccounts: ManageableAccount[];
  initialDirectoryAllocations: SuperAdminGetOblicDirectoryAllocationModel;
  initialTrendSocialPromptInstruction: GovernedInstructionState;
  initialEstimatePricingMethodologyInstruction: GovernedInstructionState;
  notice?: string | null;
};

type AllocationSaveApiBody = ApiErrorBody & {
  allocation?: SuperAdminGetOblicDirectoryAllocationRow;
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
  const payload = (await response.json().catch(() => ({}))) as AllocationSaveApiBody;
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
  initialTrendSocialPromptInstruction,
  initialEstimatePricingMethodologyInstruction,
  notice,
}: SuperAdminDashboardClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [localNotice, setLocalNotice] = useState<string | null>(notice ?? null);

  const [athenaEmail, setAthenaEmail] = useState("");
  const [athenaOrgName, setAthenaOrgName] = useState("");
  const [athenaLanguage, setAthenaLanguage] = useState<OrganizationLanguage>(
    DEFAULT_ORGANIZATION_LANGUAGE,
  );
  const [licenseeEmail, setLicenseeEmail] = useState("");
  const [licenseeName, setLicenseeName] = useState("");
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
  const [expandedLicensees, setExpandedLicensees] = useState<
    Record<string, boolean>
  >(() => {
    const first = initialDirectoryAllocations.groups[0]?.licenseeAccountId;
    return first ? { [first]: true } : {};
  });
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
  const [accountPasswordDrafts, setAccountPasswordDrafts] = useState<
    Record<string, string>
  >({});
  const [accountWordpressUserIdDrafts, setAccountWordpressUserIdDrafts] =
    useState<Record<string, string>>(() =>
      buildWordpressUserIdDrafts(initialDirectoryAllocations),
    );

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
      });
      setLicenseeEmail("");
      setLicenseeName("");
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

  function toggleLicenseeGroup(licenseeAccountId: string) {
    setExpandedLicensees((current) => ({
      ...current,
      [licenseeAccountId]: !current[licenseeAccountId],
    }));
  }

  function allocationKey(row: SuperAdminGetOblicDirectoryAllocationRow) {
    return `${row.licenseeAccountId}:${row.organizationId}`;
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

  function updateAccountPasswordDraft(
    row: SuperAdminGetOblicDirectoryAllocationRow,
    value: string,
  ) {
    setAccountPasswordDrafts((current) => ({
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
    const monthlyAllowance = raw === "" ? null : Number(raw);

    setError(null);
    setLocalNotice(null);
    setSavingAllocationKey(key);
    try {
      const payload = (await putJson(
        "/api/super/getoblic-directory/settings",
        {
          licenseeAccountId: row.licenseeAccountId,
          organizationId: row.organizationId,
          monthlyAllowance,
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
          ? String(next.monthlyAllowance ?? "")
          : "",
      }));
      setLocalNotice("GetOblic listing allowance saved.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Save GetOblic listing allowance failed.",
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
    const password = accountPasswordDrafts[key] ?? "";
    const rawWordpressUserId = (
      accountWordpressUserIdDrafts[key] ?? ""
    ).trim();
    const wordpressUserId =
      rawWordpressUserId === "" ? null : Number(rawWordpressUserId);

    setAccountError(null);
    setAccountNotice(null);
    setSavingAccountKey(key);
    try {
      if (!row.hasGetOblicPassword && password.length === 0) {
        throw new Error(
          "Password is required the first time a GetOblic.com account is saved.",
        );
      }
      const payload = await patchJson(
        "/api/super/getoblic-directory/account",
        {
          licenseeAccountId: row.licenseeAccountId,
          organizationId: row.organizationId,
          email,
          password,
          wordpressUserId,
        },
      );
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
      setAccountPasswordDrafts((current) => ({
        ...current,
        [allocationKey(next)]: "",
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

  return (
    <div className="space-y-10">
      {localNotice ? (
        <div className="rounded-2xl border border-[var(--athena-orange)]/40 bg-[var(--athena-orange)]/10 px-5 py-4 text-sm text-white/80">
          {localNotice}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {accountNotice ? (
        <div className="rounded-2xl border border-[var(--athena-orange)]/40 bg-[var(--athena-orange)]/10 px-5 py-4 text-sm text-white/80">
          {accountNotice}
        </div>
      ) : null}

      {accountError ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-sm text-red-100">
          {accountError}
        </div>
      ) : null}

      <AthenaCollapsibleSection
        eyebrow="Strategic Asset Blueprints"
        title="Centrally governed blueprint instructions"
        summary="Configure GetOblic instructions that Athena injects during future Strategic Asset Blueprint generation. Previously generated outputs are not rewritten."
        defaultOpen={false}
        showToggleLabel
      >
        <form onSubmit={saveTrendSocialPrompt} className="space-y-4">
          <div>
            <label
              htmlFor="trend-social-prompt-instruction"
              className="text-sm font-medium text-white/80"
            >
              Trend Social Prompt
            </label>
            <p className="mt-1 text-sm leading-6 text-white/45">
              Active instruction for the Trend Social Prompt field. Distinct
              from Athena&apos;s existing Social Prompt.
            </p>
          </div>
          <textarea
            id="trend-social-prompt-instruction"
            value={trendSocialPromptText}
            onChange={(event) => setTrendSocialPromptText(event.target.value)}
            rows={14}
            spellCheck={false}
            placeholder="Enter the current GetOblic Trend Social Prompt instruction…"
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sm leading-6 text-white outline-none placeholder:text-white/25 focus:border-[var(--athena-orange)]"
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs leading-5 text-white/40">
              {trendSocialPromptMeta.configured
                ? `Configured · revision ${trendSocialPromptMeta.revisionId ?? "—"}`
                : "Not configured — generations will mark Trend Social Prompt unavailable."}
              {trendSocialPromptMeta.updatedAt
                ? ` · updated ${new Date(trendSocialPromptMeta.updatedAt).toLocaleString()}`
                : ""}
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-xl bg-[var(--athena-orange)] px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
            >
              Save Trend Social Prompt
            </button>
          </div>
        </form>
      </AthenaCollapsibleSection>

      <AthenaCollapsibleSection
        eyebrow="Athena Estimate"
        title="Athena Estimate Pricing Methodology"
        summary="Controls the commercial pricing methodology used by future Athena Estimate generations. Historical Ready Estimates are not rewritten."
        defaultOpen={false}
        showToggleLabel
      >
        <form onSubmit={saveEstimatePricingMethodology} className="space-y-4">
          <div>
            <label
              htmlFor="estimate-pricing-methodology-instruction"
              className="text-sm font-medium text-white/80"
            >
              Pricing methodology instruction
            </label>
            <p className="mt-1 text-sm leading-6 text-white/45">
              Commercial guidance for future Estimate generations only. Does
              not override code-level evidence, authorization, or grounding
              rules. Maximum {ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS} characters.
            </p>
          </div>
          <textarea
            id="estimate-pricing-methodology-instruction"
            value={estimateMethodologyText}
            onChange={(event) => setEstimateMethodologyText(event.target.value)}
            rows={14}
            spellCheck={false}
            maxLength={ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS}
            placeholder="Enter the GetOblic Athena Estimate pricing methodology…"
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sm leading-6 text-white outline-none placeholder:text-white/25 focus:border-[var(--athena-orange)]"
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs leading-5 text-white/40">
              {estimateMethodologyMeta.configured
                ? `Configured · revision ${estimateMethodologyMeta.revisionId ?? "—"}`
                : "Not configured — future Estimate generations will fail until a methodology is saved."}
              {estimateMethodologyMeta.updatedAt
                ? ` · updated ${new Date(estimateMethodologyMeta.updatedAt).toLocaleString()}`
                : ""}
              {` · ${estimateMethodologyText.length}/${ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS}`}
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-xl bg-[var(--athena-orange)] px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
            >
              Save Estimate Pricing Methodology
            </button>
          </div>
        </form>
      </AthenaCollapsibleSection>

      <section className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={createAthena}
          className="space-y-4 rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6"
        >
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--athena-orange)]">
            Create Athena account
          </div>
          <p className="text-sm leading-6 text-white/50">
            Provisions a normal Athena organization with an owner membership.
            Does not create a Licensee relationship.
          </p>
          <input
            type="email"
            required
            value={athenaEmail}
            onChange={(event) => setAthenaEmail(event.target.value)}
            placeholder="owner@example.com"
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[var(--athena-orange)]"
          />
          <input
            type="text"
            required
            value={athenaOrgName}
            onChange={(event) => setAthenaOrgName(event.target.value)}
            placeholder="Organization / business name"
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[var(--athena-orange)]"
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
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-[var(--athena-orange)]"
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
          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-[var(--athena-orange)] px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
          >
            Create Athena account
          </button>
        </form>

        <form
          onSubmit={createLicensee}
          className="space-y-4 rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6"
        >
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--athena-orange)]">
            Create Licensee Master
          </div>
          <p className="text-sm leading-6 text-white/50">
            Creates a Business Licensee Master identity only. Never creates an
            Athena organization for the Master.
          </p>
          <input
            type="email"
            required
            value={licenseeEmail}
            onChange={(event) => setLicenseeEmail(event.target.value)}
            placeholder="master@example.com"
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[var(--athena-orange)]"
          />
          <input
            type="text"
            value={licenseeName}
            onChange={(event) => setLicenseeName(event.target.value)}
            placeholder="Licensee / business name (optional)"
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[var(--athena-orange)]"
          />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-[var(--athena-orange)] px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
          >
            Create Licensee Master
          </button>
        </form>
      </section>

      <section className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6">
        <div className="mb-5">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--athena-orange)]">
            GetOblic Listing Allocation
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            Monthly listing allowance
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/50">
            Monthly listing allowance per Licensee sub-account. Licensee Masters
            and tenant users cannot change this.
          </p>
        </div>

        {directoryAllocations.groups.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-8 text-sm text-white/50">
            No Licensee Masters yet. Create a Licensee Master and link
            sub-accounts before setting an allowance.
          </div>
        ) : (
          <div className="space-y-4">
            {directoryAllocations.groups.map((group) => {
              const expanded = Boolean(expandedLicensees[group.licenseeAccountId]);
              return (
                <div
                  key={group.licenseeAccountId}
                  className="rounded-2xl border border-white/10 bg-black/20"
                >
                  <button
                    type="button"
                    onClick={() => toggleLicenseeGroup(group.licenseeAccountId)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                    aria-expanded={expanded}
                  >
                    <div>
                      <div className="text-sm font-medium text-white/90">
                        {group.masterEmail}
                      </div>
                      <div className="mt-1 text-xs text-white/40">
                        {group.subAccounts.length === 1
                          ? "1 sub-account"
                          : `${group.subAccounts.length} sub-accounts`}
                      </div>
                    </div>
                    <span className="text-xs text-white/45">
                      {expanded ? "▲ Collapse" : "▼ Expand"}
                    </span>
                  </button>

                  {expanded ? (
                    <div className="space-y-4 border-t border-white/10 px-5 py-5">
                      {group.subAccounts.length === 0 ? (
                        <div className="text-sm text-white/45">
                          No sub-accounts linked to this Licensee Master.
                        </div>
                      ) : (
                        group.subAccounts.map((row) => {
                          const key = allocationKey(row);
                          const draft = allowanceDrafts[key] ?? "";
                          const saving = savingAllocationKey === key;
                          const savingAccount = savingAccountKey === key;
                          const emailDraft = accountEmailDrafts[key] ?? "";
                          const passwordDraft = accountPasswordDrafts[key] ?? "";
                          const wordpressUserIdDraft =
                            accountWordpressUserIdDrafts[key] ?? "";
                          const accountDisabled = !row.configured;
                          return (
                            <div
                              key={key}
                              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="text-sm font-medium text-white">
                                      {row.organizationName}
                                    </div>
                                    {row.isOwnCompany ? (
                                      <span className="rounded-full border border-sky-300/30 bg-sky-300/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-sky-200">
                                        Own company
                                      </span>
                                    ) : null}
                                  </div>
                                  {row.displayAlias ? (
                                    <div className="mt-1 text-xs text-white/45">
                                      {row.displayAlias}
                                    </div>
                                  ) : null}
                                  <div className="mt-2 text-sm text-white/70">
                                    {row.configured
                                      ? "Configured"
                                      : "Not configured"}
                                  </div>
                                  <div className="mt-1 text-xs leading-5 text-white/40">
                                    {allocationSecondaryCopy(row)}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
                                <div className="text-sm font-medium text-white/80">
                                  GetOblic.com account
                                </div>
                                <label className="block space-y-2">
                                  <span className="text-sm text-white/70">
                                    Email
                                  </span>
                                  <input
                                    type="email"
                                    value={emailDraft}
                                    onChange={(event) =>
                                      updateAccountEmailDraft(
                                        row,
                                        event.target.value,
                                      )
                                    }
                                    disabled={accountDisabled}
                                    placeholder=""
                                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[var(--athena-orange)] disabled:opacity-50"
                                  />
                                </label>
                                <label className="block space-y-2">
                                  <span className="text-sm text-white/70">
                                    Password
                                  </span>
                                  <input
                                    type="password"
                                    value={passwordDraft}
                                    onChange={(event) =>
                                      updateAccountPasswordDraft(
                                        row,
                                        event.target.value,
                                      )
                                    }
                                    disabled={accountDisabled}
                                    placeholder={
                                      row.hasGetOblicPassword
                                        ? "Leave blank to keep current password"
                                        : ""
                                    }
                                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[var(--athena-orange)] disabled:opacity-50"
                                  />
                                  {row.hasGetOblicPassword ? (
                                    <span className="block text-xs text-white/40">
                                      Leave blank to keep current password
                                    </span>
                                  ) : null}
                                </label>
                                <label className="block space-y-2">
                                  <span className="text-sm text-white/70">
                                    WordPress User ID
                                  </span>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={wordpressUserIdDraft}
                                    onChange={(event) =>
                                      updateAccountWordpressUserIdDraft(
                                        row,
                                        event.target.value,
                                      )
                                    }
                                    disabled={accountDisabled}
                                    placeholder=""
                                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[var(--athena-orange)] disabled:opacity-50"
                                  />
                                </label>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                  <button
                                    type="button"
                                    disabled={
                                      isPending ||
                                      savingAccount ||
                                      accountDisabled
                                    }
                                    onClick={() => saveDirectoryAccount(row)}
                                    className="rounded-xl bg-[var(--athena-orange)] px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
                                  >
                                    Save Account
                                  </button>
                                  {accountDisabled ? (
                                    <span className="text-xs text-white/40">
                                      Monthly listing allowance must be
                                      configured first.
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                                <label className="min-w-0 flex-1 space-y-2">
                                  <span className="text-sm text-white/70">
                                    Monthly GetOblic listings
                                  </span>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={draft}
                                    onChange={(event) =>
                                      updateAllocationDraft(
                                        row,
                                        event.target.value,
                                      )
                                    }
                                    placeholder=""
                                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[var(--athena-orange)]"
                                  />
                                </label>
                                <button
                                  type="button"
                                  disabled={isPending || saving}
                                  onClick={() => saveDirectoryAllowance(row)}
                                  className="rounded-xl bg-[var(--athena-orange)] px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--athena-orange)]">
              Manageable accounts
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              Athena and Licensee access
            </h2>
            <p className="mt-2 text-sm text-white/50">
              Deactivation retains identity, organization, membership, Licensee
              relationships, and tenant data. No deletion. No impersonation.
            </p>
          </div>
          <div className="text-sm text-white/40">{initialAccounts.length} accounts</div>
        </div>

        {initialAccounts.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-8 text-sm text-white/50">
            No manageable Athena or Licensee Master accounts yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.2em] text-white/40">
                <tr>
                  <th className="px-3 py-3 font-medium">Type</th>
                  <th className="px-3 py-3 font-medium">Account</th>
                  <th className="px-3 py-3 font-medium">Email</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {initialAccounts.map((account) => (
                  <tr
                    key={`${account.accountType}:${account.userId}`}
                    className="border-t border-white/10"
                  >
                    <td className="px-3 py-4">
                      <span
                        className={
                          account.accountType === "athena"
                            ? "text-[var(--athena-orange)]"
                            : "text-sky-300"
                        }
                      >
                        {account.accountType === "athena"
                          ? "Athena"
                          : "Licensee"}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-white/90">
                      {account.displayName}
                    </td>
                    <td className="px-3 py-4 text-white/60">{account.email}</td>
                    <td className="px-3 py-4">
                      <span
                        className={
                          account.status === "active"
                            ? "text-emerald-300"
                            : "text-amber-300"
                        }
                      >
                        {account.status === "active" ? "Active" : "Deactivated"}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      {account.status === "active" ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setAccess(account.userId, "deactivate")}
                          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/5 disabled:opacity-60"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setAccess(account.userId, "reactivate")}
                          className="rounded-lg border border-[var(--athena-orange)]/40 px-3 py-1.5 text-xs font-medium text-[var(--athena-orange)] transition hover:bg-[var(--athena-orange)]/10 disabled:opacity-60"
                        >
                          Reactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function buildAllowanceDrafts(
  model: SuperAdminGetOblicDirectoryAllocationModel,
): Record<string, string> {
  const drafts: Record<string, string> = {};
  for (const group of model.groups) {
    for (const row of group.subAccounts) {
      drafts[`${row.licenseeAccountId}:${row.organizationId}`] = row.configured
        ? String(row.monthlyAllowance ?? "")
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

function allocationSecondaryCopy(
  row: SuperAdminGetOblicDirectoryAllocationRow,
): string {
  if (!row.configured) {
    return "Conversions are blocked until an allowance is set.";
  }
  if (row.monthlyAllowance === 0) {
    return "New GetOblic conversions are blocked.";
  }
  const used = row.usedThisMonth ?? 0;
  const allowance = row.monthlyAllowance ?? 0;
  const remaining = row.remainingThisMonth;
  const usage = `${used} of ${allowance} used this month`;
  return remaining == null ? usage : `${usage} · ${remaining} remaining`;
}
