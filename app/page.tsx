import { redirect } from "next/navigation";
import { HomeAttentionList } from "@/components/home/HomeAttentionList";
import {
  HomeDomainCard,
  type HomeDomainTone,
} from "@/components/home/HomeDomainCard";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { formatTenantDate } from "@/lib/tenantI18n/format";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import {
  allHomeDomainsErrored,
  deriveConvertState,
  deriveDefineState,
  deriveTractionState,
  deriveVisibilityState,
  hasMissingCoreField,
  toHomeAttentionInput,
  type ConvertState,
  type DefineState,
  type TractionState,
  type VisibilityState,
} from "@/lib/home/homeDomainState";
import { buildHomeAttention } from "@/lib/home/homeAttention";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadHomeSnapshot } from "@/services/home/homeReadService";
import { requireTenantContext } from "@/services/tenantContext";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

function timeGreetingKey(): "goodMorning" | "goodAfternoon" | "goodEvening" {
  const hour = new Date().getHours();
  if (hour < 12) return "goodMorning";
  if (hour < 18) return "goodAfternoon";
  return "goodEvening";
}

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { organizationId, userId } = await requireTenantContext();
  const [{ language, messages }, snapshot] = await Promise.all([
    getTenantLocalization(),
    loadHomeSnapshot(organizationId, userId),
  ]);

  const define = deriveDefineState(snapshot.define);
  const visibility = deriveVisibilityState(snapshot.visibility);
  const traction = deriveTractionState(snapshot.traction);
  const convert = deriveConvertState(snapshot.convert);
  const attentionItems = buildHomeAttention(toHomeAttentionInput(snapshot));
  const dash = messages.dashboard;
  const name = define.greetingName || dash.greetingFallback;

  return (
    <TenantAppShell currentPath="/" messages={messages}>
      <div className="mb-12">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          {dash.eyebrow}
        </div>

        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          {messages.dashboard[timeGreetingKey()]}, {name}.
        </h1>

        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          {dash.subtitle}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <HomeDomainCard
          stageNumber={1}
          icon="brain"
          title={dash.define.title}
          question={dash.define.question}
          href="/identity"
          {...presentDefine(define, dash, language)}
        />
        <HomeDomainCard
          stageNumber={2}
          icon="visibility"
          title={dash.visibility.title}
          question={dash.visibility.question}
          href="/seo"
          {...presentVisibility(visibility, messages, language)}
        />
        <HomeDomainCard
          stageNumber={3}
          icon="traction"
          title={dash.traction.title}
          question={dash.traction.question}
          href="/personas"
          {...presentTraction(traction, dash)}
        />
        <HomeDomainCard
          stageNumber={4}
          icon="convert"
          title={dash.convert.title}
          question={dash.convert.question}
          href="/prospects"
          {...presentConvert(convert, dash)}
        />
      </div>

      <HomeAttentionList
        title={dash.attention.title}
        intro={dash.attention.intro}
        emptyLabel={
          allHomeDomainsErrored(snapshot)
            ? dash.attention.loadFailed
            : dash.attention.empty
        }
        items={attentionItems.map((item) => ({
          title: dash.attention[item.id].title,
          body: dash.attention[item.id].body,
          href: item.href,
          cta: dash.attention.cta,
        }))}
      />
    </TenantAppShell>
  );
}

function presentDefine(
  state: DefineState,
  dash: TenantMessages["dashboard"],
  language: OrganizationLanguage,
): {
  tone: HomeDomainTone;
  statusLabel: string;
  statusLine: string;
  details: string[];
  ctaLabel: string;
} {
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

function presentVisibility(
  state: VisibilityState,
  messages: TenantMessages,
  language: OrganizationLanguage,
): {
  tone: HomeDomainTone;
  statusLabel: string;
  statusLine: string;
  details: string[];
  ctaLabel: string;
} {
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

function presentTraction(
  state: TractionState,
  dash: TenantMessages["dashboard"],
): {
  tone: HomeDomainTone;
  statusLabel: string;
  statusLine: string;
  details: string[];
  ctaLabel: string;
} {
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

function presentConvert(
  state: ConvertState,
  dash: TenantMessages["dashboard"],
): {
  tone: HomeDomainTone;
  statusLabel: string;
  statusLine: string;
  details: string[];
  ctaLabel: string;
} {
  const copy = dash.convert;
  const ctaLabel =
    state.cta === "find"
      ? copy.ctaFind
      : state.cta === "reviewNew"
        ? copy.ctaReviewNew
        : state.cta === "followUp"
          ? copy.ctaFollowUp
          : state.cta === "reviewBoth"
            ? copy.ctaReviewBoth
            : copy.ctaOpen;

  if (state.kind === "unknown") {
    return {
      tone: "unknown",
      statusLabel: copy.statusUnknown,
      statusLine: copy.statusUnknown,
      details: [],
      ctaLabel,
    };
  }
  if (state.kind === "none") {
    return {
      tone: "attention",
      statusLabel: copy.statusZero,
      statusLine: copy.statusZero,
      details: [],
      ctaLabel,
    };
  }

  const details = [
    interpolateTenantMessage(copy.newCount, { count: state.newCount ?? 0 }),
    interpolateTenantMessage(copy.followUpCount, {
      count: state.followUpCount ?? 0,
    }),
  ];
  const hasOpenWork = (state.newCount ?? 0) > 0 || (state.followUpCount ?? 0) > 0;

  return {
    tone: hasOpenWork ? "attention" : "ready",
    statusLabel: interpolateTenantMessage(copy.statusSome, {
      count: state.total ?? 0,
    }),
    statusLine: interpolateTenantMessage(copy.statusSome, {
      count: state.total ?? 0,
    }),
    details,
    ctaLabel,
  };
}
