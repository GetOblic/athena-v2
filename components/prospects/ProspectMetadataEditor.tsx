"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDiscussionRegeneration } from "@/components/discussions/DiscussionRegenerationProvider";
import {
  emptyRegenerationSnapshot,
  fetchRegenerationStatus,
} from "@/lib/discussionRegenerationStatus";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { PROSPECT_GETOBLIC_TYPES } from "@/services/prospects/prospectGetOblicType";
import { normalizeWebsiteUrl } from "@/services/prospects/prospectUtils";
import { buildWhatsAppMeUrl } from "@/services/prospects/prospectWhatsApp";
import type { Prospect } from "@/services/prospects/prospectService";

const fieldClassName =
  "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none";

type ProspectMetadataEditorProps = {
  prospect: Prospect;
  discussionId?: string | null;
};

const TEXT_FIELDS = [
  ["business_name", "Business Name"],
  ["website", "Website"],
  ["decision_maker", "Decision Maker / Contact Name"],
  ["first_name", "First Name"],
  ["last_name", "Last Name"],
  ["external_contact_id", "External Contact ID"],
  ["timezone", "Timezone"],
  ["job_title", "Job Title"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["whatsapp_number", "WhatsApp Number"],
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

/** Hide empty CRM/contact split fields in read-only view. */
const OPTIONAL_DISPLAY_FIELDS = new Set([
  "first_name",
  "last_name",
  "external_contact_id",
  "timezone",
  "whatsapp_number",
]);

type FormState = {
  business_name: string;
  website: string;
  decision_maker: string;
  first_name: string;
  last_name: string;
  external_contact_id: string;
  timezone: string;
  job_title: string;
  industry: string;
  category: string;
  country: string;
  state: string;
  city: string;
  address: string;
  company_size: string;
  revenue: string;
  employee_count: string;
  technologies: string;
  pain_points: string;
  email: string;
  phone: string;
  whatsapp_number: string;
  getoblic_type: string;
  linkedin: string;
  facebook: string;
  instagram: string;
  google_business_url: string;
  notes: string;
  additional_context: string;
  ads_content: string;
};

const URL_FIELDS = new Set([
  "website",
  "linkedin",
  "facebook",
  "instagram",
  "google_business_url",
]);

function formFromProspect(prospect: Prospect): FormState {
  return {
    business_name: prospect.business_name ?? "",
    website: prospect.website ?? "",
    decision_maker: prospect.decision_maker ?? "",
    first_name: prospect.first_name ?? "",
    last_name: prospect.last_name ?? "",
    external_contact_id: prospect.external_contact_id ?? "",
    timezone: prospect.timezone ?? "",
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
    whatsapp_number: prospect.whatsapp_number ?? "",
    getoblic_type: prospect.getoblic_type ?? "",
    linkedin: prospect.linkedin ?? "",
    facebook: prospect.facebook ?? "",
    instagram: prospect.instagram ?? "",
    google_business_url: prospect.google_business_url ?? "",
    notes: prospect.notes ?? "",
    additional_context: prospect.additional_context ?? "",
    ads_content: prospect.ads_content ?? "",
  };
}

function ExternalValueLink({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const href = normalizeWebsiteUrl(value);
  if (!href) {
    return <span className="text-white/75">{value || "—"}</span>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--athena-orange)] underline underline-offset-2"
    >
      {label || href}
    </a>
  );
}

function WhatsAppDisplayValue({ value }: { value: string }) {
  const href = buildWhatsAppMeUrl(value);
  return (
    <div className="space-y-2">
      <span className="text-white/75">{value}</span>
      {href ? (
        <div>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-[var(--athena-orange)] underline underline-offset-2"
          >
            Open WhatsApp
          </a>
        </div>
      ) : null}
    </div>
  );
}

export function ProspectMetadataEditor({
  prospect,
  discussionId,
}: ProspectMetadataEditorProps) {
  const router = useRouter();
  const { trackQueuedGeneration } = useDiscussionRegeneration();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(() => formFromProspect(prospect));
  const [savedForm, setSavedForm] = useState(() => formFromProspect(prospect));
  const [saving, setSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function beginEdit() {
    setForm(savedForm);
    setIsEditing(true);
    setShowDeleteConfirm(false);
    setMessage(null);
    setError(null);
  }

  function cancelEdit() {
    setForm(savedForm);
    setIsEditing(false);
    setMessage(null);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const baseline =
        discussionId
          ? ((await fetchRegenerationStatus(discussionId)) ??
            emptyRegenerationSnapshot())
          : emptyRegenerationSnapshot();

      const response = await fetch(`/api/prospects/${prospect.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        regenerationQueued?: boolean;
        error?: string | { message?: string };
        message?: string;
      }>(response);
      const errorMessage =
        typeof payload.error === "string"
          ? payload.error
          : payload.error?.message;

      if (!response.ok || !payload.ok) {
        setError(errorMessage || "Save failed.");
        return;
      }

      const nextSaved = { ...form };
      setSavedForm(nextSaved);
      setForm(nextSaved);
      setIsEditing(false);
      setMessage(payload.message || "Prospect metadata saved.");

      if (payload.regenerationQueued) {
        trackQueuedGeneration(baseline);
      }

      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/prospects/${prospect.id}`, {
        method: "DELETE",
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        success?: boolean;
        error?: string | { message?: string };
      }>(response);
      const errorMessage =
        typeof payload.error === "string"
          ? payload.error
          : payload.error?.message;

      if (!response.ok || !payload.ok) {
        throw new Error(errorMessage || "Failed to delete prospect.");
      }

      router.push("/prospects");
      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete prospect.",
      );
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  const display = isEditing ? form : savedForm;

  return (
    <AthenaCollapsibleSection
      title={isEditing ? "Edit profile" : "Prospect Details"}
      eyebrow="Prospect Details"
      defaultOpen={false}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="max-w-2xl text-sm text-white/40">
            {isEditing
              ? "Save meaningful source changes to queue asynchronous regeneration. Historical Executive Versions remain immutable."
              : "Review prospect fields in read-only mode. Edit to update source data. Use Generate Intelligence in the page header to regenerate."}
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <div className="flex flex-wrap justify-end gap-3">
            {!isEditing ? (
              <button
                type="button"
                onClick={beginEdit}
                className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white/80 transition hover:border-[var(--athena-orange)]/40 hover:text-white"
              >
                Edit
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white/80 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                setShowDeleteConfirm(true);
                setError(null);
              }}
              className="rounded-full border border-red-500/30 px-5 py-3 text-sm font-semibold text-red-300 transition hover:border-red-400/50 hover:text-red-200"
            >
              Delete
            </button>
          </div>

          {showDeleteConfirm && (
            <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-black/30 p-5 sm:text-right">
              <p className="text-sm leading-6 text-white/70">
                Delete this Prospect permanently? The Prospect record will be
                removed. This cannot be undone.
              </p>
              <div className="mt-4 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="rounded-full border border-white/15 px-5 py-2 text-sm text-white/70"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={isDeleting}
                  className="rounded-full bg-red-500/20 px-5 py-2 text-sm font-semibold text-red-200 disabled:opacity-50"
                >
                  {isDeleting ? "Deleting..." : "Confirm Delete"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {isEditing ? (
        <>
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
            <label className="block text-sm text-white/45">
              GetOblic Type
              <select
                value={form.getoblic_type}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    getoblic_type: event.target.value,
                  }))
                }
                className={`mt-2 ${fieldClassName}`}
              >
                <option value="">Not set</option>
                {PROSPECT_GETOBLIC_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-4 block text-sm text-white/45">
            Notes
            <textarea
              value={form.notes}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  notes: event.target.value,
                }))
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

          <label className="mt-4 block text-sm text-white/45">
            Ads Content
            <textarea
              value={form.ads_content}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  ads_content: event.target.value,
                }))
              }
              rows={5}
              placeholder="Paste Google Ads, Meta Ads, or other observed advertising copy."
              className={`mt-2 ${fieldClassName}`}
            />
          </label>
        </>
      ) : (
        <>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {TEXT_FIELDS.filter(
              ([key]) =>
                !OPTIONAL_DISPLAY_FIELDS.has(key) || Boolean(display[key]),
            ).map(([key, label]) => (
              <div key={key}>
                <div className="text-sm text-white/40">{label}</div>
                <div className="mt-2 text-sm">
                  {key === "whatsapp_number" ? (
                    <WhatsAppDisplayValue value={display[key]} />
                  ) : URL_FIELDS.has(key) ? (
                    <ExternalValueLink label={display[key]} value={display[key]} />
                  ) : (
                    <span className="text-white/75">
                      {display[key] || "—"}
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div>
              <div className="text-sm text-white/40">GetOblic Type</div>
              <div className="mt-2 text-sm text-white/75">
                {display.getoblic_type || "—"}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-sm text-white/40">Notes</div>
            <div className="mt-2 whitespace-pre-wrap text-sm text-white/75">
              {display.notes || "—"}
            </div>
          </div>

          <div className="mt-6">
            <div className="text-sm text-white/40">Additional Context</div>
            <div className="mt-2 whitespace-pre-wrap text-sm text-white/75">
              {display.additional_context || "—"}
            </div>
          </div>

          <div className="mt-6">
            <div className="text-sm text-white/40">Ads Content</div>
            <div className="mt-2 whitespace-pre-wrap text-sm text-white/75">
              {display.ads_content || "—"}
            </div>
          </div>
        </>
      )}

      {message && (
        <p className="mt-4 text-sm text-white/60 whitespace-pre-wrap">
          {message}
        </p>
      )}
      {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
    </AthenaCollapsibleSection>
  );
}
