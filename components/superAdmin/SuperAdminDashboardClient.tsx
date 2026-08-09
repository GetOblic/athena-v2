"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS } from "@/services/estimate/athenaEstimateTypes";
import type { ManageableAccount } from "@/services/superAdmin/superAdminAccounts";

type GovernedInstructionState = {
  instructionText: string;
  revisionId: string | null;
  updatedAt: string | null;
  configured: boolean;
};

type SuperAdminDashboardClientProps = {
  initialAccounts: ManageableAccount[];
  initialTrendSocialPromptInstruction: GovernedInstructionState;
  initialEstimatePricingMethodologyInstruction: GovernedInstructionState;
  notice?: string | null;
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

export function SuperAdminDashboardClient({
  initialAccounts,
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
      });
      setAthenaEmail("");
      setAthenaOrgName("");
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
