"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { parseJsonResponse } from "@/lib/safeJsonResponse";

type PreviewRow = {
  rowNumber: number;
  personaName: string | null;
  displayLabel: string;
  referenceWebsiteInput: string | null;
  normalizedReferenceWebsite: string | null;
  city: string | null;
  category: string | null;
  status: "ready" | "duplicate" | "warning" | "invalid";
  warnings: string[];
  reason: string | null;
};

type PreviewPayload = {
  totalRows: number;
  importableRows: number;
  duplicateRows: number;
  invalidRows: number;
  warningRows: number;
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

const STATUS_LABELS: Record<PreviewRow["status"], string> = {
  ready: "Ready",
  duplicate: "Duplicate",
  warning: "Warning",
  invalid: "Invalid",
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

function previewRowWarningText(row: PreviewRow): string {
  if (row.warnings.length > 0) return row.warnings[0];
  if (row.reason) return row.reason;
  return "—";
}

export function PersonaCsvImport() {
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
      const response = await fetch("/api/personas/import/preview", {
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
        setCsvError(extractErrorMessage(payload, "CSV preview failed."));
        return;
      }

      setPreview(payload.preview);
    } catch (error) {
      setCsvError(
        error instanceof Error ? error.message : "CSV preview failed.",
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
      const response = await fetch("/api/personas/import", {
        method: "POST",
        body: form,
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        message?: string;
        error?: string | { message?: string };
      }>(response);

      const message = extractErrorMessage(payload, "CSV import finished.");
      setImportMessage(message);
      setImportSucceeded(Boolean(payload.ok));
    } catch (error) {
      setImportSucceeded(false);
      setImportMessage(
        error instanceof Error ? error.message : "CSV import failed.",
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
      <h2 className="text-2xl font-semibold">CSV Import</h2>
      <p className="mt-3 text-sm leading-6 text-white/45">
        Upload a CSV to preview how Athena interprets each row. No Persona
        records are created until you review and confirm the import.
      </p>

      <div className="mt-6">
        <a
          href="/templates/athena-persona-import-template.csv"
          download="Athena_Persona_Import_Template.csv"
          className="inline-flex rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-[var(--athena-orange)]/50 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
        >
          Download CSV Template
        </a>
      </div>

      <div className="mt-6 space-y-3 text-sm leading-6 text-white/40">
        <p className="font-medium text-white/55">Import guide</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>One Persona per row.</li>
          <li>All content columns are optional.</li>
          <li>A completely blank row is invalid.</li>
          <li>Common column names are recognized automatically.</li>
          <li>Unknown columns are ignored and reported in preview.</li>
          <li>Duplicates are skipped.</li>
          <li>Maximum 500 Personas per CSV.</li>
        </ul>
      </div>

      {!preview ? (
        <form onSubmit={reviewCsv} className="mt-8 space-y-4">
          <label htmlFor={csvInputId} className="block text-sm text-white/50">
            CSV file
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
            {previewing ? "Reviewing…" : "Review CSV"}
          </button>
        </form>
      ) : (
        <div className="mt-8 space-y-6">
          <div
            className="rounded-2xl border border-white/10 bg-black/20 p-5"
            aria-live="polite"
          >
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/45">
              Preview summary
            </h3>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-white/40">Rows detected</dt>
                <dd className="mt-1 text-lg font-semibold text-white">
                  {preview.totalRows}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-white/40">Ready to import</dt>
                <dd className="mt-1 text-lg font-semibold text-emerald-300/90">
                  {preview.importableRows}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-white/40">Duplicates skipped</dt>
                <dd className="mt-1 text-lg font-semibold text-amber-200/80">
                  {preview.duplicateRows}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-white/40">Invalid rows</dt>
                <dd className="mt-1 text-lg font-semibold text-rose-300/90">
                  {preview.invalidRows}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-white/40">Warnings</dt>
                <dd className="mt-1 text-lg font-semibold text-orange-300/90">
                  {preview.warningRows}
                </dd>
              </div>
            </dl>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-white/55">
              Recognized: {preview.recognizedColumns.length} columns
              {preview.ignoredColumns.length > 0
                ? ` · Ignored: ${preview.ignoredColumns.length} columns`
                : " · Ignored: 0 columns"}
            </p>
            <details className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-white/40">
              <summary className="cursor-pointer text-white/55">
                Column details
              </summary>
              <div className="mt-3 space-y-2 leading-6">
                <p>
                  <span className="text-white/50">Recognized: </span>
                  {preview.recognizedColumns.length > 0
                    ? preview.recognizedColumns.join(", ")
                    : "—"}
                </p>
                <p>
                  <span className="text-white/50">Ignored: </span>
                  {preview.ignoredColumns.length > 0
                    ? preview.ignoredColumns.join(", ")
                    : "—"}
                </p>
              </div>
            </details>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-black/30 text-xs uppercase tracking-[0.12em] text-white/40">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Row
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Persona
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Reference Website
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Category
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    City
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Warnings
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
                      {row.displayLabel}
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      {row.normalizedReferenceWebsite ??
                        row.referenceWebsiteInput ??
                        "—"}
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      {row.category ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      {row.city ?? "—"}
                    </td>
                    <td
                      className={`px-4 py-3 font-medium ${STATUS_STYLES[row.status]}`}
                    >
                      {STATUS_LABELS[row.status]}
                    </td>
                    <td className="px-4 py-3 text-xs leading-5 text-white/45">
                      {previewRowWarningText(row)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.showingSubset && (
            <p className="text-xs text-white/35">
              Showing the first {preview.displayedRows} of{" "}
              {preview.totalPreparedRows} rows.
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={chooseAnotherFile}
              disabled={importing}
              className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              Choose Another File
            </button>
            <button
              type="button"
              onClick={confirmImport}
              disabled={confirmDisabled}
              aria-busy={importing}
              className="rounded-full bg-[var(--athena-orange)] px-7 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {importing ? "Importing…" : "Confirm Import"}
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
                href="/personas"
                className="inline-flex rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
              >
                Open Persona Library
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
