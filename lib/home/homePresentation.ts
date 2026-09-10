/**
 * Home presentation mapping. No I/O. Does not invent commercial outcomes.
 */

import type { HomePriorityAccent, HomePriorityId } from "@/lib/home/homeAttention";
import type {
  ConvertState,
  DefineState,
  TractionState,
  VisibilityState,
} from "@/lib/home/homeDomainState";
import { hasMissingCoreField } from "@/lib/home/homeDomainState";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { formatTenantDate } from "@/lib/tenantI18n/format";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { HomeDomainTone } from "@/components/home/HomeDomainCard";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

export const HOME_PRIORITY_SURFACE_CLASS =
  "rounded-[22px] border bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_58%)] p-5 shadow-[0_0_22px_rgba(0,0,0,0.18)]";

export const HOME_FEATURED_PRIORITY_SURFACE_CLASS =
  "rounded-[22px] border bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(255,102,0,0.08),transparent_58%)] p-5 shadow-[0_0_28px_rgba(255,102,0,0.08)]";

export const HOME_PANEL_SURFACE_CLASS =
  "rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6";

export const HOME_READINESS_SURFACE_CLASS =
  "rounded-[20px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-4 transition hover:border-white/15 hover:bg-white/[0.03]";

export const HOME_PRIORITY_ACCENT: Record<
  HomePriorityAccent,
  {
    border: string;
    featuredBorder: string;
    iconWell: string;
    icon: string;
  }
> = {
  blocker: {
    border: "border-[rgba(255,102,0,0.28)]",
    featuredBorder: "border-[rgba(255,102,0,0.42)]",
    iconWell:
      "border-[rgba(255,102,0,0.32)] bg-[rgba(255,102,0,0.13)] text-[var(--athena-orange)] shadow-[0_0_14px_rgba(255,102,0,0.16)]",
    icon: "text-[var(--athena-orange)]",
  },
  ready: {
    border: "border-[rgba(0,208,132,0.22)]",
    featuredBorder: "border-[rgba(0,208,132,0.38)]",
    iconWell:
      "border-[rgba(0,208,132,0.32)] bg-[rgba(0,208,132,0.12)] text-[var(--athena-success)] shadow-[0_0_14px_rgba(0,208,132,0.14)]",
    icon: "text-[var(--athena-success)]",
  },
  strong: {
    border: "border-[rgba(56,189,248,0.22)]",
    featuredBorder: "border-[rgba(56,189,248,0.38)]",
    iconWell:
      "border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.13)] text-sky-300 shadow-[0_0_14px_rgba(56,189,248,0.16)]",
    icon: "text-sky-300",
  },
  attention: {
    border: "border-[rgba(245,158,11,0.22)]",
    featuredBorder: "border-[rgba(245,158,11,0.38)]",
    iconWell:
      "border-[rgba(245,158,11,0.32)] bg-[rgba(245,158,11,0.12)] text-[var(--athena-warning)] shadow-[0_0_14px_rgba(245,158,11,0.14)]",
    icon: "text-[var(--athena-warning)]",
  },
  danger: {
    border: "border-[rgba(248,113,113,0.24)]",
    featuredBorder: "border-[rgba(248,113,113,0.4)]",
    iconWell:
      "border-[rgba(248,113,113,0.32)] bg-[rgba(248,113,113,0.12)] text-[var(--athena-danger)] shadow-[0_0_14px_rgba(248,113,113,0.14)]",
    icon: "text-[var(--athena-danger)]",
  },
  missing: {
    border: "border-white/10",
    featuredBorder: "border-white/18",
    iconWell:
      "border-white/12 bg-white/[0.05] text-white/70 shadow-[0_0_12px_rgba(255,255,255,0.04)]",
    icon: "text-white/70",
  },
  capacity: {
    border: "border-[rgba(56,189,248,0.22)]",
    featuredBorder: "border-[rgba(56,189,248,0.38)]",
    iconWell:
      "border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.13)] text-sky-300 shadow-[0_0_14px_rgba(56,189,248,0.16)]",
    icon: "text-sky-200",
  },
  define: {
    border: "border-[rgba(255,102,0,0.2)]",
    featuredBorder: "border-[rgba(255,102,0,0.36)]",
    iconWell:
      "border-[rgba(255,102,0,0.28)] bg-[rgba(255,102,0,0.1)] text-[var(--athena-orange)]",
    icon: "text-[var(--athena-orange)]",
  },
  visibility: {
    border: "border-[rgba(56,189,248,0.18)]",
    featuredBorder: "border-[rgba(56,189,248,0.32)]",
    iconWell:
      "border-[rgba(56,189,248,0.28)] bg-[rgba(56,189,248,0.1)] text-sky-300",
    icon: "text-sky-300",
  },
  traction: {
    border: "border-[rgba(167,139,250,0.2)]",
    featuredBorder: "border-[rgba(167,139,250,0.34)]",
    iconWell:
      "border-[rgba(167,139,250,0.28)] bg-[rgba(167,139,250,0.1)] text-violet-300",
    icon: "text-violet-300",
  },
};

export type HomeReadinessPresentation = {
  tone: HomeDomainTone;
  statusLabel: string;
  statusLine: string;
  details: string[];
  ctaLabel: string;
};

export function presentDefine(
  state: DefineState,
  dash: TenantMessages["dashboard"],
  language: OrganizationLanguage,
): HomeReadinessPresentation {
  const details: string[] = [];

  if (state.kind !== "unknown") {
    if (state.kind !== "ready" || hasMissingCoreField(state.missing)) {
      details.push(...missingFieldDetails(state.missing, dash));
    }
    if (state.kind === "ready" && state.lastTrained) {
      const date = formatTenantDate(state.lastTrained, language);
      if (date) {
        details.push(
          interpolateTenantMessage(dash.define.lastTrained, { date }),
        );
      }
    }
    if (state.lastDeepScrapeAt) {
      const date = formatTenantDate(state.lastDeepScrapeAt, language);
      if (date) {
        details.push(
          interpolateTenantMessage(dash.define.websiteLearning, { date }),
        );
      }
    }
  }

  if (state.kind === "unknown") {
    return {
      tone: "unknown",
      statusLabel: dash.define.statusUnknown,
      statusLine: dash.define.statusUnknown,
      details: [],
      ctaLabel: dash.define.ctaOpen,
    };
  }
  if (state.kind === "needs_setup") {
    return {
      tone: "attention",
      statusLabel: dash.define.labelNeedsSetup,
      statusLine: dash.define.statusNeedsSetup,
      details,
      ctaLabel: dash.define.ctaTrain,
    };
  }
  if (state.kind === "ready") {
    return {
      tone: "ready",
      statusLabel: dash.define.labelReady,
      statusLine: dash.define.statusReady,
      details,
      ctaLabel: dash.define.ctaOpen,
    };
  }
  return {
    tone: "progress",
    statusLabel: dash.define.labelInProgress,
    statusLine: state.isTraining
      ? dash.define.statusTraining
      : dash.define.statusInProgress,
    details,
    ctaLabel: dash.define.ctaTrain,
  };
}

function missingFieldDetails(
  missing: DefineState["missing"],
  dash: TenantMessages["dashboard"],
): string[] {
  const absent = [
    !missing.hasVoice,
    !missing.hasKnowledge,
    !missing.hasWebsite,
  ];
  if (absent.every(Boolean)) {
    return [dash.define.missingAll];
  }
  const lines: string[] = [];
  if (!missing.hasVoice) lines.push(dash.define.missingVoice);
  if (!missing.hasKnowledge) lines.push(dash.define.missingKnowledge);
  if (!missing.hasWebsite) lines.push(dash.define.missingWebsite);
  return lines;
}

export function presentVisibility(
  state: VisibilityState,
  messages: TenantMessages,
  language: OrganizationLanguage,
): HomeReadinessPresentation {
  const copy = messages.dashboard.visibility;
  const details: string[] = [];
  if (state.kind !== "unknown" && state.kind !== "none") {
    const typeLabel = state.generationType
      ? messages.seo.generationType[state.generationType]
      : "";
    const date = state.dateValue
      ? formatTenantDate(state.dateValue, language)
      : "";
    if (state.name && typeLabel && date) {
      details.push(
        interpolateTenantMessage(copy.latestNamed, {
          name: state.name,
          type: typeLabel,
          date,
        }),
      );
    } else if (typeLabel && date) {
      details.push(
        interpolateTenantMessage(copy.latestMeta, {
          type: typeLabel,
          date,
        }),
      );
    }
  }

  switch (state.kind) {
    case "unknown":
      return {
        tone: "unknown",
        statusLabel: copy.statusUnknown,
        statusLine: copy.statusUnknown,
        details: [],
        ctaLabel: copy.ctaReview,
      };
    case "none":
      return {
        tone: "attention",
        statusLabel: copy.labelNone,
        statusLine: copy.statusNone,
        details: [],
        ctaLabel: copy.ctaEstablish,
      };
    case "processing":
      return {
        tone: "progress",
        statusLabel: copy.labelProcessing,
        statusLine: copy.statusProcessing,
        details,
        ctaLabel: copy.ctaReview,
      };
    case "ready":
      return {
        tone: "ready",
        statusLabel: copy.labelReady,
        statusLine: copy.statusReady,
        details,
        ctaLabel: copy.ctaReview,
      };
    case "needs_attention":
      return {
        tone: "danger",
        statusLabel: copy.labelNeedsAttention,
        statusLine: copy.statusFailed,
        details,
        ctaLabel: copy.ctaReviewFailed,
      };
  }
}

export function presentTraction(
  state: TractionState,
  dash: TenantMessages["dashboard"],
): HomeReadinessPresentation {
  const copy = dash.traction;
  if (state.kind === "unknown") {
    return {
      tone: "unknown",
      statusLabel: copy.statusUnknown,
      statusLine: copy.statusUnknown,
      details: [],
      ctaLabel: copy.ctaOpen,
    };
  }
  if (state.kind === "none") {
    return {
      tone: "attention",
      statusLabel: copy.statusZero,
      statusLine: copy.statusZero,
      details: [],
      ctaLabel: copy.ctaDefineFirst,
    };
  }
  if (state.kind === "one") {
    return {
      tone: "ready",
      statusLabel: copy.statusOne,
      statusLine: copy.statusOne,
      details: [],
      ctaLabel: copy.ctaOpen,
    };
  }
  return {
    tone: "ready",
    statusLabel: interpolateTenantMessage(copy.statusMany, {
      count: state.audienceCount ?? 0,
    }),
    statusLine: interpolateTenantMessage(copy.statusMany, {
      count: state.audienceCount ?? 0,
    }),
    details: [],
    ctaLabel: copy.ctaOpen,
  };
}

export function presentConvert(
  state: ConvertState,
  dash: TenantMessages["dashboard"],
): HomeReadinessPresentation {
  const copy = dash.convert;

  if (state.kind === "unknown") {
    return {
      tone: "unknown",
      statusLabel: copy.statusUnknown,
      statusLine: copy.statusUnknown,
      details: [],
      ctaLabel: copy.ctaOpen,
    };
  }
  if (state.kind === "none") {
    return {
      tone: "attention",
      statusLabel: copy.statusZero,
      statusLine: copy.statusZero,
      details: [],
      ctaLabel: copy.ctaOpen,
    };
  }

  const details = [
    interpolateTenantMessage(copy.readyCount, { count: state.readyCount ?? 0 }),
    interpolateTenantMessage(copy.missingCount, {
      count: state.missingCount ?? 0,
    }),
  ];
  const tone: HomeDomainTone =
    (state.failedCount ?? 0) > 0
      ? "danger"
      : (state.missingCount ?? 0) > 0 || (state.readyCount ?? 0) > 0
        ? "attention"
        : (state.inProgressCount ?? 0) > 0
          ? "progress"
          : "ready";

  return {
    tone,
    statusLabel: interpolateTenantMessage(copy.statusSome, {
      count: state.workingCount ?? 0,
    }),
    statusLine: interpolateTenantMessage(copy.statusSome, {
      count: state.workingCount ?? 0,
    }),
    details,
    ctaLabel: copy.ctaOpen,
  };
}

export function homePriorityCopy(
  id: HomePriorityId,
  dash: TenantMessages["dashboard"],
): { title: string; body: string; cta: string } {
  return dash.next[id];
}
