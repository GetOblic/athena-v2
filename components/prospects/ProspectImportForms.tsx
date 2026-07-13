"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProspectCsvImport } from "@/components/prospects/ProspectCsvImport";
import { parseJsonResponse } from "@/lib/safeJsonResponse";

const fieldClassName =
  "rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25";

type ManualResult = {
  ok: boolean;
  message: string;
  prospectId?: string;
};

const MANUAL_FIELDS = [
  ["business_name", "Business Name"],
  ["website", "Website"],
  ["linkedin", "LinkedIn URL"],
  ["facebook", "Facebook URL"],
  ["instagram", "Instagram URL"],
  ["industry", "Industry"],
  ["category", "Category"],
  ["country", "Country"],
  ["state", "State"],
  ["city", "City"],
  ["address", "Address"],
  ["decision_maker", "Decision Maker / Contact Name"],
  ["first_name", "First Name"],
  ["last_name", "Last Name"],
  ["external_contact_id", "External Contact ID"],
  ["timezone", "Timezone"],
  ["job_title", "Job Title"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["google_business_url", "Google Business URL"],
  ["company_size", "Company Size"],
  ["revenue", "Revenue"],
  ["employee_count", "Employee Count"],
  ["technologies", "Technologies"],
  ["pain_points", "Pain Points"],
  ["source", "Source"],
] as const;

export function ProspectImportForms() {
  const router = useRouter();

  const [manual, setManual] = useState<Record<string, string>>(
    Object.fromEntries([
      ...MANUAL_FIELDS.map(([key]) => [key, ""]),
      ["notes", ""],
      ["additional_context", ""],
      ["ads_content", ""],
    ]),
  );
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualResult, setManualResult] = useState<ManualResult | null>(null);

  async function submitManual(event: React.FormEvent) {
    event.preventDefault();
    if (manualSubmitting) return;

    setManualSubmitting(true);
    setManualResult(null);

    try {
      const response = await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manual),
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        message?: string;
        prospectId?: string;
        error?: string | { message?: string };
      }>(response);

      const errorMessage =
        typeof payload.error === "string"
          ? payload.error
          : payload.error?.message;

      setManualResult({
        ok: Boolean(payload.ok),
        message: payload.message || errorMessage || "Import finished.",
        prospectId: payload.prospectId,
      });

      if (payload.ok && payload.prospectId) {
        router.push(`/prospects/${payload.prospectId}`);
      }
    } catch (error) {
      setManualResult({
        ok: false,
        message: error instanceof Error ? error.message : "Import failed.",
      });
    } finally {
      setManualSubmitting(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
        <h2 className="text-2xl font-semibold">Manual Import</h2>
        <p className="mt-3 text-sm leading-6 text-white/45">
          Create a single Prospect. Business Name is strongly recommended;
          incomplete Prospects remain analyzable.
        </p>

        <form onSubmit={submitManual} className="mt-8 space-y-4">
          {MANUAL_FIELDS.map(([key, label]) => (
            <label key={key} className="block text-sm text-white/50">
              {label}
              <input
                value={manual[key] ?? ""}
                onChange={(event) =>
                  setManual((previous) => ({
                    ...previous,
                    [key]: event.target.value,
                  }))
                }
                className={`mt-2 w-full ${fieldClassName}`}
              />
            </label>
          ))}

          <label className="block text-sm text-white/50">
            Notes
            <textarea
              value={manual.notes ?? ""}
              onChange={(event) =>
                setManual((previous) => ({
                  ...previous,
                  notes: event.target.value,
                }))
              }
              rows={3}
              className={`mt-2 w-full ${fieldClassName}`}
            />
          </label>

          <label className="block text-sm text-white/50">
            Additional Context
            <textarea
              value={manual.additional_context ?? ""}
              onChange={(event) =>
                setManual((previous) => ({
                  ...previous,
                  additional_context: event.target.value,
                }))
              }
              rows={3}
              className={`mt-2 w-full ${fieldClassName}`}
            />
          </label>

          <label className="block text-sm text-white/50">
            Ads Content
            <textarea
              value={manual.ads_content ?? ""}
              onChange={(event) =>
                setManual((previous) => ({
                  ...previous,
                  ads_content: event.target.value,
                }))
              }
              rows={5}
              placeholder="Paste Google Ads, Meta Ads, or other observed advertising copy."
              className={`mt-2 w-full ${fieldClassName}`}
            />
          </label>

          <button
            type="submit"
            disabled={manualSubmitting}
            className="rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            {manualSubmitting ? "Importing…" : "Import Prospect"}
          </button>
        </form>

        {manualResult && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70 whitespace-pre-wrap">
            {manualResult.message}
            {manualResult.prospectId && (
              <div className="mt-3">
                <Link
                  href={`/prospects/${manualResult.prospectId}`}
                  className="text-[var(--athena-orange)] underline"
                >
                  Open Prospect
                </Link>
              </div>
            )}
          </div>
        )}
      </section>

      <ProspectCsvImport />
    </div>
  );
}
