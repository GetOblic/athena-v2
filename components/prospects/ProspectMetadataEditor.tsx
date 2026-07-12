"use client";

import { useState } from "react";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { Prospect } from "@/services/prospects/prospectService";

const fieldClassName =
  "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none";

type ProspectMetadataEditorProps = {
  prospect: Prospect;
};

const TEXT_FIELDS = [
  ["business_name", "Business Name"],
  ["website", "Website"],
  ["decision_maker", "Decision Maker / Contact Name"],
  ["job_title", "Job Title"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["industry", "Industry"],
  ["category", "Category"],
  ["country", "Country"],
  ["state", "State"],
  ["city", "City"],
  ["address", "Address"],
  ["company_size", "Company Size"],
  ["revenue", "Revenue"],
  ["employee_count", "Employee Count"],
  ["technologies", "Technologies"],
  ["pain_points", "Pain Points"],
  ["linkedin", "LinkedIn"],
  ["facebook", "Facebook"],
  ["instagram", "Instagram"],
  ["google_business_url", "Google Business URL"],
] as const;

export function ProspectMetadataEditor({
  prospect,
}: ProspectMetadataEditorProps) {
  const [form, setForm] = useState({
    business_name: prospect.business_name ?? "",
    website: prospect.website ?? "",
    decision_maker: prospect.decision_maker ?? "",
    job_title: prospect.job_title ?? "",
    industry: prospect.industry ?? "",
    category: prospect.category ?? "",
    country: prospect.country ?? "",
    state: prospect.state ?? "",
    city: prospect.city ?? "",
    address: prospect.address ?? "",
    company_size: prospect.company_size ?? "",
    revenue: prospect.revenue ?? "",
    employee_count: prospect.employee_count ?? "",
    technologies: prospect.technologies ?? "",
    pain_points: prospect.pain_points ?? "",
    email: prospect.email ?? "",
    phone: prospect.phone ?? "",
    linkedin: prospect.linkedin ?? "",
    facebook: prospect.facebook ?? "",
    instagram: prospect.instagram ?? "",
    google_business_url: prospect.google_business_url ?? "",
    notes: prospect.notes ?? "",
    additional_context: prospect.additional_context ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/prospects/${prospect.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        error?: string | { message?: string };
        message?: string;
      }>(response);
      const errorMessage =
        typeof payload.error === "string"
          ? payload.error
          : payload.error?.message;
      setMessage(
        payload.message ||
          (payload.ok ? "Prospect metadata saved." : errorMessage || "Save failed."),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function refreshIntelligence() {
    setRefreshing(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/prospects/${prospect.id}/refresh`, {
        method: "POST",
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        message?: string;
        error?: string | { message?: string };
      }>(response);
      const errorMessage =
        typeof payload.error === "string"
          ? payload.error
          : payload.error?.message;
      setMessage(
        payload.message || errorMessage || "Refresh request completed.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Refresh failed.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            Prospect Details
          </div>
          <h2 className="mt-3 text-2xl font-semibold">Editable profile</h2>
          <p className="mt-2 text-sm text-white/40">
            Meaningful edits queue asynchronous regeneration. Historical
            Executive Versions remain immutable.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => void refreshIntelligence()}
            disabled={refreshing}
            className="rounded-full bg-[var(--athena-orange)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {refreshing ? "Queuing…" : "Refresh Intelligence"}
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {TEXT_FIELDS.map(([key, label]) => (
          <label key={key} className="block text-sm text-white/45">
            {label}
            <input
              value={form[key]}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  [key]: event.target.value,
                }))
              }
              className={`mt-2 ${fieldClassName}`}
            />
          </label>
        ))}
      </div>

      <label className="mt-4 block text-sm text-white/45">
        Notes
        <textarea
          value={form.notes}
          onChange={(event) =>
            setForm((previous) => ({ ...previous, notes: event.target.value }))
          }
          rows={4}
          className={`mt-2 ${fieldClassName}`}
        />
      </label>

      <label className="mt-4 block text-sm text-white/45">
        Additional Context
        <textarea
          value={form.additional_context}
          onChange={(event) =>
            setForm((previous) => ({
              ...previous,
              additional_context: event.target.value,
            }))
          }
          rows={4}
          className={`mt-2 ${fieldClassName}`}
        />
      </label>

      {message && (
        <p className="mt-4 text-sm text-white/60 whitespace-pre-wrap">{message}</p>
      )}
    </section>
  );
}
