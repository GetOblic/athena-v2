"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { getLocalizedImportPreviewStatus } from "@/lib/tenantI18n/importPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import { parseJsonResponse } from "@/lib/safeJsonResponse";

type PreviewRow = {
  rowNumber: number;
  businessName: string | null;
  websiteInput: string | null;
  normalizedWebsite: string | null;
  decisionMaker: string | null;
  industry: string | null;
  city: string | null;
  email: string | null;
  status: "ready" | "duplicate" | "warning" | "invalid";
  warnings: string[];
  reason: string | null;
};

type PreviewPayload = {
  totalRows: number;
  importableRows: number;
  duplicateRows: number;
  invalidRows: number;
  invalidWebsiteRows: number;
  withoutWebsiteRows: number;
  recognizedColumns: string[];
  ignoredColumns: string[];
  displayedRows: number;
  totalPreparedRows: number;
  showingSubset: boolean;
  rows: PreviewRow[];
};

const STATUS_STYLES: Record<PreviewRow["status"], string> = {
  ready: "text-emerald-300/90",
  duplicate: "text-amber-200/80",
  warning: "text-orange-300/90",
  invalid: "text-rose-300/90",
};

function extractErrorMessage(
  payload: { error?: string | { message?: string }; message?: string },
  fallback: string,
): string {
  if (typeof payload.error === "string") return payload.error;
  if (payload.error?.message) return payload.error.message;
  if (payload.message) return payload.message;
  return fallback;
}

function previewRowWarningText(
  row: PreviewRow,
  emptyValue: string,
): string {
  if (row.warnings.length > 0) return row.warnings[0];
  if (row.reason) return row.reason;
  return emptyValue;
}

type ProspectCsvImportProps = {
  messages: TenantMessages;
};

export function ProspectCsvImport({ messages }: ProspectCsvImportProps) {
  const copy = messages.prospects.import;
  const list = messages.prospects.list;
  const meta = messages.prospects.metadata;
  const emptyValue = messages.prospects.emptyValue;
  const statusLabels = {
    ready: copy.statusReady,
    duplicate: copy.statusDuplicate,
    warning: copy.statusWarning,
    invalid: copy.statusInvalid,
  };
  const csvInputId = useId();
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importSucceeded, setImportSucceeded] = useState(false);

  function clearCsvReviewState() {
    setPreview(null);
    setCsvError(null);
    setImportMessage(null);
    setImportSucceeded(false);
  }

  function onCsvFileChange(file: File | null) {
    setCsvFile(file);
    clearCsvReviewState();
  }

  function chooseAnotherFile() {
    clearCsvReviewState();
    setCsvFile(null);
    if (csvFileInputRef.current) {
      csvFileInputRef.current.value = "";
      csvFileInputRef.current.focus();
    }
  }

  async function reviewCsv(event: React.FormEvent) {
    event.preventDefault();
    if (!csvFile || previewing || importing) return;

    setPreviewing(true);
    setCsvError(null);
    setImportMessage(null);
    setImportSucceeded(false);
    setPreview(null);

    try {
      const form = new FormData();
      form.append("file", csvFile);
      const response = await fetch("/api/prospects/import/preview", {
        method: "POST",
        body: form,
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        success?: boolean;
        preview?: PreviewPayload;
        message?: string;
        error?: string | { message?: string };
      }>(response);

      if (!response.ok || !payload.ok || !payload.preview) {
        setCsvError(extractErrorMessage(payload, copy.previewFailed));
        return;
      }

      setPreview(payload.preview);
    } catch (error) {
      setCsvError(
        error instanceof Error ? error.message : copy.previewFailed,
      );
    } finally {
      setPreviewing(false);
    }
  }

  async function confirmImport() {
    if (!csvFile || !preview || importing || previewing) return;
    if (preview.importableRows <= 0) return;

    setImporting(true);
    setCsvError(null);
    setImportMessage(null);
    setImportSucceeded(false);

    try {
      const form = new FormData();
      form.append("file", csvFile);
      const response = await fetch("/api/prospects/import", {
        method: "POST",
        body: form,
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        message?: string;
        error?: string | { message?: string };
      }>(response);

      const message = extractErrorMessage(payload, copy.importCsvFinished);
      setImportMessage(message);
      setImportSucceeded(Boolean(payload.ok));
    } catch (error) {
      setImportSucceeded(false);
      setImportMessage(
        error instanceof Error ? error.message : copy.importCsvFailed,
      );
    } finally {
      setImporting(false);
    }
  }

  const confirmDisabled =
    !csvFile ||
    !preview ||
    preview.importableRows <= 0 ||
    importing ||
    previewing ||
    Boolean(csvError);

  return (
    <section className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
      <h2 className="text-2xl font-semibold">{copy.csvTitle}</h2>
      <p className="mt-3 text-sm leading-6 text-white/45">{copy.csvSummary}</p>

      <div className="mt-6">
        <a
          href="/templates/athena-prospect-import-template.csv"
          download="Athena_Prospect_Import_Template.csv"
          className="inline-flex rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-[var(--athena-orange)]/50 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
        >
          {copy.downloadTemplate}
        </a>
      </div>

      <div className="mt-6 space-y-3 text-sm leading-6 text-white/40">
        <p className="font-medium text-white/55">{copy.guideTitle}</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>{copy.guideOnePerRow}</li>
          <li>{copy.guideBusinessName}</li>
          <li>{copy.guideWebsite}</li>
          <li>{copy.guideRecognized}</li>
          <li>{copy.guideUnknownIgnored}</li>
          <li>{copy.guideDuplicates}</li>
          <li>{copy.guideMaxRows}</li>
          <li>{copy.guideBackground}</li>
        </ul>

        <div className="grid gap-4 pt-2 sm:grid-cols-2">
          <div>
            <p className="font-medium text-white/55">{copy.requiredTitle}</p>
            <p className="mt-1 text-white/35">{copy.requiredFields}</p>
          </div>
          <div>
            <p className="font-medium text-white/55">{copy.optionalTitle}</p>
            <p className="mt-1 text-white/35">{copy.optionalFields}</p>
          </div>
        </div>
      </div>

      {!preview ? (
        <form onSubmit={reviewCsv} className="mt-8 space-y-4">
          <label htmlFor={csvInputId} className="block text-sm text-white/50">
            {copy.csvFile}
            <input
              id={csvInputId}
              ref={csvFileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) =>
                onCsvFileChange(event.target.files?.[0] ?? null)
              }
              className="mt-2 block w-full text-sm text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
            />
          </label>

          <button
            type="submit"
            disabled={!csvFile || previewing}
            aria-busy={previewing}
            className="rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            {previewing ? copy.reviewing : copy.reviewCta}
          </button>
        </form>
      ) : (
        <div className="mt-8 space-y-6">
          <div
            className="rounded-2xl border border-white/10 bg-black/20 p-5"
            aria-live="polite"
          >
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/45">
              {copy.previewSummary}
            </h3>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-white/40">{copy.rowsDetected}</dt>
                <dd className="mt-1 text-lg font-semibold text-white">
                  {preview.totalRows}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-white/40">{copy.readyToImport}</dt>
                <dd className="mt-1 text-lg font-semibold text-emerald-300/90">
                  {preview.importableRows}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-white/40">
                  {copy.duplicatesSkipped}
                </dt>
                <dd className="mt-1 text-lg font-semibold text-amber-200/80">
                  {preview.duplicateRows}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-white/40">{copy.invalidRows}</dt>
                <dd className="mt-1 text-lg font-semibold text-rose-300/90">
                  {preview.invalidRows}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-white/40">{copy.invalidWebsites}</dt>
                <dd className="mt-1 text-lg font-semibold text-orange-300/90">
                  {preview.invalidWebsiteRows}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-white/40">{copy.withoutWebsite}</dt>
                <dd className="mt-1 text-lg font-semibold text-white/80">
                  {preview.withoutWebsiteRows}
                </dd>
              </div>
            </dl>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-white/55">
              {interpolateTenantMessage(copy.recognizedCount, {
                count: preview.recognizedColumns.length,
              })}
              {" · "}
              {interpolateTenantMessage(copy.ignoredCount, {
                count: preview.ignoredColumns.length,
              })}
            </p>
            <details className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-white/40">
              <summary className="cursor-pointer text-white/55">
                {copy.columnDetails}
              </summary>
              <div className="mt-3 space-y-2 leading-6">
                <p>
                  <span className="text-white/50">{copy.recognizedLabel} </span>
                  {preview.recognizedColumns.length > 0
                    ? preview.recognizedColumns.join(", ")
                    : emptyValue}
                </p>
                <p>
                  <span className="text-white/50">{copy.ignoredLabel} </span>
                  {preview.ignoredColumns.length > 0
                    ? preview.ignoredColumns.join(", ")
                    : emptyValue}
                </p>
              </div>
            </details>
            {preview.ignoredColumns.length > 0 && (
              <div
                className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100/80"
                role="status"
              >
                {interpolateTenantMessage(
                  preview.ignoredColumns.length === 1
                    ? copy.ignoredWarningOne
                    : copy.ignoredWarningMany,
                  {
                    count: preview.ignoredColumns.length,
                    columns: preview.ignoredColumns.join(", "),
                  },
                )}
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-black/30 text-xs uppercase tracking-[0.12em] text-white/40">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {copy.colRow}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {list.colBusinessName}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {list.colWebsite}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {list.colDecisionMaker}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {meta.industry}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {meta.city}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {list.colStatus}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {copy.warnings}
                  </th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr
                    key={row.rowNumber}
                    className="border-t border-white/8 align-top"
                  >
                    <td className="px-4 py-3 text-white/50">{row.rowNumber}</td>
                    <td className="px-4 py-3 text-white/80">
                      {row.businessName ?? emptyValue}
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      {row.normalizedWebsite ?? row.websiteInput ?? emptyValue}
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      {row.decisionMaker ?? emptyValue}
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      {row.industry ?? emptyValue}
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      {row.city ?? emptyValue}
                    </td>
                    <td
                      className={`px-4 py-3 font-medium ${STATUS_STYLES[row.status]}`}
                    >
                      {getLocalizedImportPreviewStatus(
                        statusLabels,
                        row.status,
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs leading-5 text-white/45">
                      {previewRowWarningText(row, emptyValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.showingSubset && (
            <p className="text-xs text-white/35">
              {interpolateTenantMessage(copy.showingSubset, {
                displayed: preview.displayedRows,
                total: preview.totalPreparedRows,
              })}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={chooseAnotherFile}
              disabled={importing}
              className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {copy.chooseAnotherFile}
            </button>
            <button
              type="button"
              onClick={confirmImport}
              disabled={confirmDisabled}
              aria-busy={importing}
              className="rounded-full bg-[var(--athena-orange)] px-7 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {importing ? copy.importing : copy.confirmImport}
            </button>
          </div>
        </div>
      )}

      {csvError && (
        <div
          className="mt-6 rounded-2xl border border-rose-400/25 bg-rose-400/5 p-4 text-sm text-rose-100/90"
          role="alert"
        >
          {csvError}
        </div>
      )}

      {importMessage && (
        <div
          className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70 whitespace-pre-wrap"
          aria-live="polite"
        >
          {importMessage}
          {importSucceeded && (
            <div className="mt-4">
              <Link
                href="/prospects"
                className="inline-flex rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
              >
                {copy.openLibrary}
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
