"use client";

import { useEffect, useMemo, useState } from "react";

import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { presentElapsed } from "@/lib/monitor/monitorWorkspaceModel";
import type { MonitorCustomerCategory, MonitorHistoricalChange, MonitorProgressView, MonitorResultCard } from "@/lib/monitor/monitorWorkspaceModel";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { MonitorComparison } from "@/services/monitor/monitorComparison";
import { getMonitorSource } from "@/services/monitor/monitorSources";
import type { MonitorConfiguration, MonitorJobStatus } from "@/services/monitor/monitorTypes";

type Section = "monitors" | "results" | "history" | "active";

type WebsiteState =
  | "available"
  | "discovering"
  | "access_unavailable"
  | "unsupported"
  | "temporary_error";

type WebsiteDraft = {
  websiteUrl: string;
  sourceId: string | null;
  displayName: string | null;
  state: WebsiteState | null;
  selectable: boolean;
  categories: MonitorCustomerCategory[];
  mode: "categories" | "whole_catalog";
  selectedKeys: string[];
  includeUnavailable: boolean;
};

type MonitorSummary = {
  id: string;
  name: string;
  configuration: MonitorConfiguration;
  lastSuccessfulJobId: string | null;
  updatedAt: string;
};

type JobSummary = {
  id: string;
  monitorId: string;
  status: MonitorJobStatus;
  configurationSnapshot: MonitorConfiguration;
  progress: MonitorProgressView;
  createdAt: string;
  completedAt: string | null;
  forceFresh: boolean;
};

const fieldClass =
  "w-full rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/35";
const primaryClass =
  "inline-flex h-11 items-center justify-center rounded-full bg-[var(--athena-orange)] px-5 text-sm font-semibold text-white disabled:opacity-40";
const secondaryClass =
  "inline-flex h-11 items-center justify-center rounded-full border border-white/15 px-5 text-sm font-semibold text-white/80 disabled:opacity-40";

function emptyWebsite(): WebsiteDraft {
  return {
    websiteUrl: "",
    sourceId: null,
    displayName: null,
    state: null,
    selectable: false,
    categories: [],
    mode: "categories",
    selectedKeys: [],
    includeUnavailable: false,
  };
}

function statusLabel(copy: TenantMessages["monitor"], status: string): string {
  return copy.jobStatus[status as keyof typeof copy.jobStatus] ?? status;
}

function sourceStatusLabel(copy: TenantMessages["monitor"], status: string): string {
  return copy.sourceStatus[status as keyof typeof copy.sourceStatus] ?? status;
}

function websiteStateLabel(copy: TenantMessages["monitor"], state: WebsiteState): string {
  const labels = {
    available: copy.states.available,
    discovering: copy.states.discovering,
    access_unavailable: copy.states.accessUnavailable,
    unsupported: copy.states.unsupported,
    temporary_error: copy.states.temporaryError,
  };
  return labels[state];
}

function errorLabel(copy: TenantMessages["monitor"], code: string): string {
  if (code === "ENTITLEMENT_REQUIRED") return copy.errors.entitlement;
  if (code === "ACTIVE_JOB_EXISTS") return copy.errors.activeJob;
  if (code === "UNSUPPORTED_SOURCE") return copy.errors.unsupported;
  if (code === "NOT_FOUND") return copy.errors.notFound;
  if (code === "INVALID_CONFIGURATION") return copy.errors.emptyCategories;
  return copy.errors.generic;
}

async function readPayload(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

export function MonitorWorkspace({
  messages,
  locale,
}: {
  messages: TenantMessages;
  locale: string;
}) {
  const copy = messages.monitor;
  const [section, setSection] = useState<Section>("monitors");
  const [monitors, setMonitors] = useState<MonitorSummary[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selectedMonitorId, setSelectedMonitorId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [baselineJobId, setBaselineJobId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    id: null as string | null,
    name: "",
    objective: "",
    minimum: 4,
    websites: [emptyWebsite()] as WebsiteDraft[],
  });
  const [categoryQuery, setCategoryQuery] = useState("");
  const [results, setResults] = useState<MonitorResultCard[]>([]);
  const [missing, setMissing] = useState<Array<{ sourceId: string; retailer: string; familyId: string }>>([]);
  const [comparison, setComparison] = useState<MonitorComparison | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [sort, setSort] = useState("observed");
  const [websiteFilter, setWebsiteFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [minVariations, setMinVariations] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [changeFilter, setChangeFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activeJobs = useMemo(
    () => jobs.filter((job) => job.status === "queued" || job.status === "processing"),
    [jobs],
  );
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;

  async function loadMonitors() {
    const response = await fetch("/api/monitor", { cache: "no-store" });
    const payload = await readPayload(response);
    if (!response.ok || payload.ok !== true) {
      setError(errorLabel(copy, String((payload.error as { code?: string } | undefined)?.code ?? "")));
      return;
    }
    setMonitors((payload.monitors as MonitorSummary[]) ?? []);
  }

  async function loadJobs(monitorId: string | null) {
    const path = monitorId ? `/api/monitor/${monitorId}/jobs` : "/api/monitor/jobs";
    const response = await fetch(path, { cache: "no-store" });
    const payload = await readPayload(response);
    if (!response.ok || payload.ok !== true) return;
    setJobs((payload.jobs as JobSummary[]) ?? []);
  }

  useEffect(() => {
    void loadMonitors();
    void loadJobs(null);
    // Initial workspace load. Later actions refresh explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeJobs.length === 0) return;
    let stopped = false;
    const poll = async () => {
      const response = await fetch("/api/monitor/jobs", { cache: "no-store" });
      const payload = await readPayload(response);
      if (stopped || !response.ok || payload.ok !== true) return;
      const next = (payload.jobs as JobSummary[]) ?? [];
      setJobs(next);
      if (next.every((job) => job.status !== "queued" && job.status !== "processing")) {
        stopped = true;
      }
    };
    const timer = window.setInterval(() => {
      void poll();
    }, 5_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activeJobs.map((job) => job.id).join("|")]);

  function updateWebsite(index: number, patch: Partial<WebsiteDraft>) {
    setDraft((current) => ({
      ...current,
      websites: current.websites.map((website, websiteIndex) =>
        websiteIndex === index ? { ...website, ...patch } : website,
      ),
    }));
  }

  async function checkWebsite(index: number, refresh: boolean) {
    const website = draft.websites[index];
    const response = await fetch("/api/monitor/websites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ websiteUrl: website.websiteUrl, refresh }),
    });
    const payload = await readPayload(response);
    if (!response.ok || payload.ok !== true) {
      setError(errorLabel(copy, String((payload.error as { code?: string } | undefined)?.code ?? "")));
      return;
    }
    const resolved = payload.website as WebsiteDraft;
    updateWebsite(index, {
      sourceId: resolved.sourceId,
      displayName: resolved.displayName,
      state: resolved.state,
      selectable: resolved.selectable,
      categories: resolved.categories,
      mode: resolved.selectable ? "categories" : "whole_catalog",
      selectedKeys: [],
      includeUnavailable: false,
    });
  }

  function configuration(): MonitorConfiguration | null {
    if (!draft.name.trim() || !draft.objective.trim() || draft.websites.length === 0) return null;
    const sources = [];
    for (const website of draft.websites) {
      if (!website.sourceId || !website.websiteUrl.trim()) return null;
      if (website.state === "access_unavailable") {
        if (!website.includeUnavailable) return null;
        sources.push({
          sourceId: website.sourceId,
          websiteUrl: website.websiteUrl.trim(),
          selection: { mode: "whole_catalog" as const },
        });
        continue;
      }
      if (website.mode === "whole_catalog") {
        sources.push({
          sourceId: website.sourceId,
          websiteUrl: website.websiteUrl.trim(),
          selection: { mode: "whole_catalog" as const },
        });
        continue;
      }
      const selected = website.categories.filter((category) =>
        website.selectedKeys.includes(category.categoryKey),
      );
      if (selected.length === 0) return null;
      sources.push({
        sourceId: website.sourceId,
        websiteUrl: website.websiteUrl.trim(),
        selection: {
          mode: "categories" as const,
          categoryUrls: selected.map((category) => category.canonicalUrl),
          categoryIds: selected.map((category) => category.categoryKey),
        },
      });
    }
    return {
      version: 1,
      name: draft.name.trim(),
      objective: draft.objective.trim(),
      sources,
      criterion: {
        id: "distinctColorPatternCount",
        operator: "gte",
        minimum: draft.minimum,
      },
    };
  }

  async function save() {
    const next = configuration();
    if (!next) {
      setError(copy.errors.emptyCategories);
      return;
    }
    setSaving(true);
    setError(null);
    const response = await fetch(draft.id ? `/api/monitor/${draft.id}` : "/api/monitor", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ configuration: next }),
    });
    const payload = await readPayload(response);
    setSaving(false);
    if (!response.ok || payload.ok !== true) {
      setError(errorLabel(copy, String((payload.error as { code?: string } | undefined)?.code ?? "")));
      return;
    }
    const monitor = payload.monitor as MonitorSummary;
    setDraft((current) => ({ ...current, id: monitor.id }));
    setSelectedMonitorId(monitor.id);
    await loadMonitors();
  }

  async function launch(forceFresh: boolean) {
    if (!draft.id && !selectedMonitorId) {
      await save();
    }
    const monitorId = draft.id ?? selectedMonitorId;
    if (!monitorId) return;
    const response = await fetch(`/api/monitor/${monitorId}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forceFresh }),
    });
    const payload = await readPayload(response);
    if (!response.ok || payload.ok !== true) {
      setError(errorLabel(copy, String((payload.error as { code?: string } | undefined)?.code ?? "")));
      return;
    }
    setSection("active");
    await loadJobs(null);
  }

  async function openResults(jobId: string, nextPage = page) {
    const params = new URLSearchParams({ page: String(nextPage), sort });
    if (websiteFilter) params.set("website", websiteFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    if (minVariations) params.set("minVariations", minVariations);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (changeFilter) params.set("change", changeFilter);
    if (baselineJobId) params.set("baselineJobId", baselineJobId);
    const response = await fetch(`/api/monitor/jobs/${jobId}/results?${params.toString()}`, {
      cache: "no-store",
    });
    const payload = await readPayload(response);
    if (!response.ok || payload.ok !== true) {
      setError(errorLabel(copy, String((payload.error as { code?: string } | undefined)?.code ?? "")));
      return;
    }
    setSelectedJobId(jobId);
    setResults((payload.results as MonitorResultCard[]) ?? []);
    setMissing((payload.missing as typeof missing) ?? []);
    setComparison((payload.comparison as MonitorComparison | null) ?? null);
    setPage(Number(payload.page ?? 1));
    setPageCount(Number(payload.pageCount ?? 1));
    setSection("results");
  }

  async function refilter() {
    if (!selectedJobId) return;
    const response = await fetch(`/api/monitor/jobs/${selectedJobId}/refilter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minimum: draft.minimum }),
    });
    const payload = await readPayload(response);
    if (!response.ok || payload.ok !== true || payload.networkRequests !== 0) {
      setError(copy.errors.generic);
      return;
    }
    setResults((payload.results as MonitorResultCard[]) ?? []);
    setSection("results");
  }

  async function cancelActive(jobId: string) {
    const response = await fetch(`/api/monitor/jobs/${jobId}/cancel`, { method: "POST" });
    const payload = await readPayload(response);
    if (!response.ok || payload.ok !== true) {
      setError(errorLabel(copy, String((payload.error as { code?: string } | undefined)?.code ?? "")));
      return;
    }
    await loadJobs(null);
  }

  function editMonitor(monitor: MonitorSummary) {
    setSelectedMonitorId(monitor.id);
    setDraft({
      id: monitor.id,
      name: monitor.configuration.name,
      objective: monitor.configuration.objective,
      minimum: monitor.configuration.criterion.minimum,
      websites: monitor.configuration.sources.map((source) => {
        const blocked = getMonitorSource(source.sourceId)?.productionAccess === "blocked";
        const categories =
          source.selection.mode === "categories"
            ? source.selection.categoryUrls.map((url, index) => ({
                categoryKey: source.selection.mode === "categories" ? (source.selection.categoryIds?.[index] ?? url) : url,
                displayName:
                  source.selection.mode === "categories" ? (source.selection.categoryIds?.[index] ?? url) : url,
                canonicalUrl: url,
                parentCategoryKey: null,
                productFamilyCount: null,
              }))
            : [];
        return {
          ...emptyWebsite(),
          websiteUrl: source.websiteUrl,
          sourceId: source.sourceId,
          displayName: getMonitorSource(source.sourceId)?.displayName ?? source.sourceId,
          state: blocked ? ("access_unavailable" as const) : categories.length > 0 || source.selection.mode === "whole_catalog" ? ("available" as const) : null,
          selectable: !blocked && (categories.length > 0 || source.selection.mode === "whole_catalog"),
          categories,
          mode: source.selection.mode,
          selectedKeys: source.selection.mode === "categories" ? (source.selection.categoryIds ?? []) : [],
          includeUnavailable: blocked,
        };
      }),
    });
    setSection("monitors");
  }

  const ready = configuration() != null;
  const partial = selectedJob != null && !selectedJob.progress.catalogComplete && selectedJob.progress.terminal;

  return (
    <div data-monitor-workspace data-monitor-layout="responsive" className="min-w-0">
      <div role="tablist" aria-label={copy.title} className="mb-6 flex flex-wrap gap-2">
        {(
          [
            ["monitors", copy.tabs.monitors],
            ["results", copy.tabs.results],
            ["history", copy.tabs.history],
            ["active", copy.tabs.active],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={section === key}
            className={section === key ? primaryClass : secondaryClass}
            onClick={() => setSection(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? (
        <p className="mb-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </p>
      ) : null}

      {section === "monitors" ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
          <section className="rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{copy.tabs.monitors}</h2>
              <button
                type="button"
                className={secondaryClass}
                onClick={() =>
                  setDraft({ id: null, name: "", objective: "", minimum: 4, websites: [emptyWebsite()] })
                }
              >
                {copy.actions.create}
              </button>
            </div>
            {monitors.length === 0 ? (
              <div>
                <p className="font-medium">{copy.states.emptyMonitorsTitle}</p>
                <p className="mt-2 text-sm text-white/55">{copy.states.emptyMonitorsBody}</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {monitors.map((monitor) => (
                  <li key={monitor.id}>
                    <button type="button" className="w-full rounded-2xl px-3 py-2 text-left hover:bg-white/5" onClick={() => editMonitor(monitor)}>
                      <span className="block font-medium">{monitor.name}</span>
                      <span className="text-xs text-white/45">{monitor.updatedAt}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <form
            className="space-y-5 rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="block text-sm">
              <span className="mb-1 block text-white/70">{copy.fields.name}</span>
              <input className={fieldClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-white/70">{copy.fields.objective}</span>
              <textarea className={fieldClass} rows={3} value={draft.objective} onChange={(event) => setDraft({ ...draft, objective: event.target.value })} />
              <span className="mt-1 block text-xs text-white/45">{copy.fields.objectiveHelp}</span>
            </label>
            <fieldset className="rounded-2xl border border-white/10 p-4">
              <legend className="px-1 text-sm font-medium">{copy.fields.criterionTitle}</legend>
              <p className="mt-2 text-sm text-white/60">{copy.fields.criterionHelp}</p>
              <label className="mt-3 block text-sm">
                <span className="mb-1 block text-white/70">{copy.fields.minimum}</span>
                <input
                  className={fieldClass}
                  type="number"
                  min={1}
                  max={100}
                  value={draft.minimum}
                  onChange={(event) => setDraft({ ...draft, minimum: Number(event.target.value) })}
                />
              </label>
            </fieldset>
            {draft.websites.map((website, index) => {
              const visible = website.categories.filter((category) =>
                category.displayName.toLocaleLowerCase(locale).includes(categoryQuery.toLocaleLowerCase(locale)),
              );
              return (
                <fieldset key={`${website.sourceId ?? "new"}-${index}`} className="rounded-2xl border border-white/10 p-4">
                  <label className="block text-sm">
                    <span className="mb-1 block text-white/70">{copy.fields.websiteUrl}</span>
                    <input className={fieldClass} value={website.websiteUrl} onChange={(event) => updateWebsite(index, { websiteUrl: event.target.value, state: null })} />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className={secondaryClass} onClick={() => void checkWebsite(index, false)}>
                      {copy.actions.resolve}
                    </button>
                    <button type="button" className={secondaryClass} onClick={() => void checkWebsite(index, true)}>
                      {copy.actions.refreshCategories}
                    </button>
                    {draft.websites.length > 1 ? (
                      <button type="button" className={secondaryClass} onClick={() => setDraft({ ...draft, websites: draft.websites.filter((_, item) => item !== index) })}>
                        {copy.actions.removeWebsite}
                      </button>
                    ) : null}
                  </div>
                  {website.state ? (
                    <p className="mt-3 text-sm text-white/70">
                      {website.displayName ? `${website.displayName} · ` : ""}
                      {websiteStateLabel(copy, website.state)}
                    </p>
                  ) : null}
                  {website.state === "access_unavailable" ? (
                    <label className="mt-3 flex items-start gap-2 text-sm text-white/70">
                      <input
                        type="checkbox"
                        checked={website.includeUnavailable}
                        onChange={(event) => updateWebsite(index, { includeUnavailable: event.target.checked, mode: "whole_catalog" })}
                      />
                      {copy.fields.includeUnavailable}
                    </label>
                  ) : null}
                  {website.selectable ? (
                    <div className="mt-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name={`scope-${index}`}
                          checked={website.mode === "categories"}
                          onChange={() => updateWebsite(index, { mode: "categories" })}
                        />
                        {copy.fields.selectedCategories}
                      </label>
                      <label className="mt-2 flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name={`scope-${index}`}
                          checked={website.mode === "whole_catalog"}
                          onChange={() => updateWebsite(index, { mode: "whole_catalog", selectedKeys: [] })}
                        />
                        {copy.fields.wholeCatalog}
                      </label>
                      {website.mode === "categories" ? (
                        <div className="mt-3">
                          <input
                            className={fieldClass}
                            value={categoryQuery}
                            placeholder={copy.fields.categorySearch}
                            onChange={(event) => setCategoryQuery(event.target.value)}
                          />
                          {visible.length === 0 ? (
                            <p className="mt-2 text-sm text-white/50">{copy.states.emptyCategories}</p>
                          ) : (
                            <ul className="mt-2 max-h-64 space-y-1 overflow-auto">
                              {visible.map((category) => (
                                <li key={category.categoryKey} className={category.parentCategoryKey ? "pl-4" : undefined}>
                                  <label className="flex items-start gap-2 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={website.selectedKeys.includes(category.categoryKey)}
                                      onChange={(event) => {
                                        const selectedKeys = event.target.checked
                                          ? [...website.selectedKeys, category.categoryKey]
                                          : website.selectedKeys.filter((key) => key !== category.categoryKey);
                                        updateWebsite(index, { selectedKeys, mode: "categories" });
                                      }}
                                    />
                                    <span>
                                      {category.displayName}
                                      {category.productFamilyCount != null
                                        ? ` · ${interpolateTenantMessage(copy.results.familyCount, { count: String(category.productFamilyCount) })}`
                                        : ""}
                                    </span>
                                  </label>
                                </li>
                              ))}
                            </ul>
                          )}
                          {website.selectedKeys.length === 0 ? (
                            <p className="mt-2 text-xs text-white/45">{copy.states.emptySelection}</p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </fieldset>
              );
            })}
            <button type="button" className={secondaryClass} onClick={() => setDraft({ ...draft, websites: [...draft.websites, emptyWebsite()] })}>
              {copy.actions.addWebsite}
            </button>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={primaryClass} disabled={!ready || saving}>
                {saving ? copy.actions.saving : copy.actions.save}
              </button>
              <button type="button" className={primaryClass} disabled={!ready} onClick={() => void launch(false)}>
                {copy.actions.run}
              </button>
              <button type="button" className={secondaryClass} disabled={!ready} onClick={() => void launch(true)}>
                {copy.actions.forceFresh}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {section === "active" ? (
        <section className="space-y-4">
          <p className="text-sm text-white/55">{copy.states.continuesInBackground}</p>
          {activeJobs.length === 0 ? (
            <div className="rounded-[24px] border border-white/10 p-6">
              <h2 className="text-lg font-semibold">{copy.states.emptyActiveTitle}</h2>
              <p className="mt-2 text-sm text-white/55">{copy.states.emptyActiveBody}</p>
            </div>
          ) : (
            activeJobs.map((job) => <ProgressCard key={job.id} copy={copy} progress={job.progress} onCancel={() => void cancelActive(job.id)} />)
          )}
        </section>
      ) : null}

      {section === "history" ? (
        <section>
          {jobs.length === 0 ? (
            <div className="rounded-[24px] border border-white/10 p-6">
              <h2 className="text-lg font-semibold">{copy.states.emptyHistoryTitle}</h2>
              <p className="mt-2 text-sm text-white/55">{copy.states.emptyHistoryBody}</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {jobs.map((job) => (
                <li key={job.id} className="rounded-[24px] border border-white/10 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-white/50">{copy.history.executedAt}</p>
                      <p className="font-medium">{new Date(job.createdAt).toLocaleString(locale)}</p>
                    </div>
                    <p>{statusLabel(copy, job.progress.status)}</p>
                  </div>
                  <p className="mt-3 text-sm text-white/70">
                    {copy.history.snapshot}: {job.configurationSnapshot.name}
                  </p>
                  <p className="text-sm text-white/60">
                    {copy.history.coverage}: {job.progress.sources.map((source) => source.retailer).join(", ")}
                    {job.progress.wholeCatalog ? ` · ${copy.progress.wholeCatalog}` : ""}
                    {job.progress.categories.length > 0 ? ` · ${job.progress.categories.join(", ")}` : ""}
                  </p>
                  <p className="mt-2 text-sm text-white/60">
                    {copy.history.analyzed}: {job.progress.familiesAnalyzed} · {copy.history.matching}: {job.progress.familiesMatching} · {copy.history.fresh}: {job.progress.familiesExtracted} · {copy.history.reused}: {job.progress.familiesReused}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className={secondaryClass} onClick={() => void openResults(job.id, 1)}>
                      {copy.actions.openHistory}
                    </button>
                    <button type="button" className={secondaryClass} onClick={() => setBaselineJobId(job.id)}>
                      {copy.history.baseline}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {section === "results" ? (
        <section>
          {partial ? <p className="mb-4 text-sm text-amber-100">{copy.states.partialBanner} {copy.states.notCompleteCatalog}</p> : null}
          {selectedJob?.progress.sources.some((source) => source.status === "blocked" || source.status === "failed") ? (
            <p className="mb-4 text-sm text-white/70">{copy.states.blockedBanner}</p>
          ) : null}
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <label className="text-sm">
              {copy.results.filterWebsite}
              <input className={fieldClass} value={websiteFilter} onChange={(event) => setWebsiteFilter(event.target.value)} />
            </label>
            <label className="text-sm">
              {copy.results.filterCategory}
              <input className={fieldClass} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} />
            </label>
            <label className="text-sm">
              {copy.results.filterVariations}
              <input className={fieldClass} value={minVariations} onChange={(event) => setMinVariations(event.target.value)} />
            </label>
            <label className="text-sm">
              {copy.results.filterPrice}
              <input className={fieldClass} value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} />
            </label>
            <label className="text-sm">
              {copy.results.sort}
              <select className={fieldClass} value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="observed">{copy.results.sortObserved}</option>
                <option value="website">{copy.results.sortWebsite}</option>
                <option value="category">{copy.results.sortCategory}</option>
                <option value="variations">{copy.results.sortVariations}</option>
                <option value="price">{copy.results.sortPrice}</option>
                <option value="change">{copy.results.sortChange}</option>
              </select>
            </label>
            <label className="text-sm">
              {copy.results.filterChange}
              <select className={fieldClass} value={changeFilter} onChange={(event) => setChangeFilter(event.target.value)}>
                <option value="">{copy.results.anyChange}</option>
                {(Object.keys(copy.changes) as MonitorHistoricalChange[]).map((key) => (
                  <option key={key} value={key}>{copy.changes[key]}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <button type="button" className={secondaryClass} disabled={!selectedJobId} onClick={() => selectedJobId && void openResults(selectedJobId, 1)}>
              {copy.actions.latest}
            </button>
            <button type="button" className={secondaryClass} disabled={!selectedJobId} onClick={() => void refilter()}>
              {copy.actions.refilter}
            </button>
            <button
              type="button"
              className={secondaryClass}
              disabled={!baselineJobId || !selectedJobId}
              onClick={() => selectedJobId && void openResults(selectedJobId, 1)}
            >
              {copy.actions.compare}
            </button>
          </div>
          {comparison && !comparison.compatible ? (
            <p className="mb-4 text-sm text-white/70">{copy.comparison.incompatible} {copy.comparison.incompleteDiscovery}</p>
          ) : null}
          {results.length === 0 ? (
            <div className="rounded-[24px] border border-white/10 p-6">
              <h2 className="text-lg font-semibold">{copy.states.emptyResultsTitle}</h2>
              <p className="mt-2 text-sm text-white/55">{copy.states.emptyResultsBody}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((card) => (
                <article key={card.observationId} className="overflow-hidden rounded-[24px] border border-white/10 bg-[var(--athena-card)]">
                  {card.imageUrl ? (
                    // Product images are published retailer assets.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.imageUrl} alt={card.productName} className="h-48 w-full object-cover" />
                  ) : (
                    <div className="flex h-48 items-center justify-center bg-white/5 text-sm text-white/50">
                      {copy.states.imageUnavailable}
                    </div>
                  )}
                  <div className="space-y-2 p-4 text-sm">
                    <h3 className="text-base font-semibold">{card.productName}</h3>
                    <p>{copy.results.retailer}: {card.retailer}</p>
                    <p>{copy.results.category}: {card.category ?? "—"}</p>
                    <p>{copy.results.price}: {card.priceAmount ?? "—"} {card.currency ?? ""}</p>
                    <p>{copy.results.variationCount}: {card.distinctVariationCount ?? "—"}</p>
                    <p className="text-white/70">{copy.states.potentialSignal}</p>
                    <p className="text-white/55">{copy.states.assortmentSignal}</p>
                    {card.colorPatternNames.length > 0 ? (
                      <p>{copy.results.variations}: {card.colorPatternNames.join(", ")}</p>
                    ) : null}
                    <p className="text-xs text-white/45">{copy.states.noSwatches}</p>
                    <p>{copy.results.observedAt}: {new Date(card.observedAt).toLocaleString(locale)}</p>
                    <p>{card.reused ? copy.states.reusedObservation : copy.states.freshObservation}</p>
                    {card.reused ? <p className="text-xs text-white/45">{copy.comparison.reusedNotFresh}</p> : null}
                    {card.changes.map((change) => (
                      <p key={change}>{copy.changes[change]}</p>
                    ))}
                    {card.productUrl ? (
                      <a className="inline-flex text-[var(--athena-orange)]" href={card.productUrl} target="_blank" rel="noreferrer">
                        {copy.results.openProduct}
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
          {missing.length > 0 ? (
            <div className="mt-6">
              <h3 className="font-medium">{copy.comparison.notFound}</h3>
              <p className="text-sm text-white/55">{copy.comparison.notFoundHelp}</p>
              <ul className="mt-2 text-sm">
                {missing.map((item) => (
                  <li key={`${item.sourceId}-${item.familyId}`}>{item.retailer} · {item.familyId}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-4 flex items-center gap-3 text-sm">
            <button type="button" className={secondaryClass} disabled={page <= 1 || !selectedJobId} onClick={() => selectedJobId && void openResults(selectedJobId, page - 1)}>
              {copy.results.previous}
            </button>
            <span>{interpolateTenantMessage(copy.results.page, { page: String(page), pages: String(pageCount) })}</span>
            <button type="button" className={secondaryClass} disabled={page >= pageCount || !selectedJobId} onClick={() => selectedJobId && void openResults(selectedJobId, page + 1)}>
              {copy.results.next}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ProgressCard({
  copy,
  progress,
  onCancel,
}: {
  copy: TenantMessages["monitor"];
  progress: MonitorProgressView;
  onCancel: () => void;
}) {
  const elapsed = presentElapsed(progress.elapsedSeconds);
  return (
    <article className="rounded-[24px] border border-white/10 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{statusLabel(copy, progress.status)}</h2>
        {!progress.terminal ? (
          <button type="button" className={secondaryClass} onClick={onCancel}>
            {copy.actions.cancel}
          </button>
        ) : null}
      </div>
      {!progress.catalogComplete && progress.terminal ? (
        <p className="mt-2 text-sm text-amber-100">{copy.states.notCompleteCatalog}</p>
      ) : null}
      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-white/45">{copy.progress.currentSource}</dt><dd>{progress.currentRetailer ?? "—"}</dd></div>
        <div><dt className="text-white/45">{copy.progress.phase}</dt><dd>{progress.phase === "discover" ? copy.progress.discover : progress.phase === "extract" ? copy.progress.extract : copy.progress.waiting}</dd></div>
        <div><dt className="text-white/45">{copy.progress.categories}</dt><dd>{progress.wholeCatalog ? copy.progress.wholeCatalog : progress.categories.join(", ") || "—"}</dd></div>
        <div><dt className="text-white/45">{copy.progress.familiesDiscovered}</dt><dd>{progress.familiesDiscovered}</dd></div>
        <div><dt className="text-white/45">{copy.progress.familiesAnalyzed}</dt><dd>{progress.familiesAnalyzed}</dd></div>
        <div><dt className="text-white/45">{copy.progress.matching}</dt><dd>{progress.familiesMatching}</dd></div>
        <div><dt className="text-white/45">{copy.progress.freshlyExtracted}</dt><dd>{progress.familiesExtracted}</dd></div>
        <div><dt className="text-white/45">{copy.progress.reused}</dt><dd>{progress.familiesReused}</dd></div>
        <div><dt className="text-white/45">{copy.progress.failed}</dt><dd>{progress.familiesFailed}</dd></div>
        <div>
          <dt className="text-white/45">{copy.progress.elapsed}</dt>
          <dd>{elapsed ? interpolateTenantMessage(copy.progress.elapsedValue, { minutes: String(elapsed.minutes), seconds: String(elapsed.remainder) }) : "—"}</dd>
        </div>
      </dl>
      <h3 className="mt-4 text-sm font-medium">{copy.progress.sourceStatus}</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {progress.sources.map((source) => (
          <li key={source.sourceId}>
            {source.retailer}: {sourceStatusLabel(copy, source.status)}
          </li>
        ))}
      </ul>
    </article>
  );
}
