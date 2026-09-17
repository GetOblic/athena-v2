import { redirect } from "next/navigation";
import { FreeFirstSessionHome } from "@/components/home/FreeFirstSessionHome";
import { FreeTrainedHome } from "@/components/home/FreeTrainedHome";
import { HomeBusinessReadiness } from "@/components/home/HomeBusinessReadiness";
import { HomeGetOblicCapacity } from "@/components/home/HomeGetOblicCapacity";
import { HomeOpportunityPipeline } from "@/components/home/HomeOpportunityPipeline";
import { HomePriorityList } from "@/components/home/HomePriorityList";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { Brain, Search, Target, Users } from "lucide-react";
import { shouldShowFreeFirstSessionHome } from "@/lib/home/freeFirstSessionHome";
import { shouldShowFreeStarterExperience } from "@/lib/home/freeStarterHome";
import {
  allHomeDomainsErrored,
  deriveCapacityState,
  deriveConvertState,
  deriveDefineState,
  deriveTractionState,
  deriveVisibilityState,
  toHomePriorityInput,
} from "@/lib/home/homeDomainState";
import { buildHomePriorities } from "@/lib/home/homeAttention";
import {
  homePriorityCopy,
  presentConvert,
  presentDefine,
  presentTraction,
  presentVisibility,
} from "@/lib/home/homePresentation";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadHomeSnapshot } from "@/services/home/homeReadService";
import { loadFreeTrainedHomeView } from "@/services/home/freeTrainedHomeReadService";
import { resolveAthenaPlan } from "@/services/organizationService";
import { requireTenantContext } from "@/services/tenantContext";

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
  const [{ language, messages }, snapshot, athenaPlan] = await Promise.all([
    getTenantLocalization(),
    loadHomeSnapshot(organizationId, userId),
    resolveAthenaPlan(organizationId),
  ]);

  const define = deriveDefineState(snapshot.define);

  if (
    shouldShowFreeFirstSessionHome({
      athenaPlan,
      defineKind: define.kind,
    })
  ) {
    return (
      <TenantAppShell
        currentPath="/"
        messages={messages}
        athenaPlan={athenaPlan}
        defineKind={define.kind}
      >
        <FreeFirstSessionHome />
      </TenantAppShell>
    );
  }

  if (
    shouldShowFreeStarterExperience({
      athenaPlan,
      defineKind: define.kind,
    })
  ) {
    const trainedView = await loadFreeTrainedHomeView({
      organizationId,
      messages,
    });
    return (
      <TenantAppShell
        currentPath="/"
        messages={messages}
        athenaPlan={athenaPlan}
        defineKind={define.kind}
      >
        <FreeTrainedHome
          starter={trainedView.starter}
          view={trainedView.presentation}
          messages={messages}
        />
      </TenantAppShell>
    );
  }

  const visibility = deriveVisibilityState(snapshot.visibility);
  const traction = deriveTractionState(snapshot.traction);
  const convert = deriveConvertState(snapshot.convert);
  const capacity = deriveCapacityState(snapshot.capacity);
  const priorities = buildHomePriorities(toHomePriorityInput(snapshot));
  const dash = messages.dashboard;
  const name = define.greetingName || dash.greetingFallback;
  const defineView = presentDefine(define, dash, language);
  const visibilityView = presentVisibility(visibility, messages, language);
  const tractionView = presentTraction(traction, dash);
  const convertView = presentConvert(convert, dash);

  return (
    <TenantAppShell
      currentPath="/"
      messages={messages}
      athenaPlan={athenaPlan}
      defineKind={define.kind}
    >
      <div className="mb-10">
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

      <HomePriorityList
        title={dash.next.title}
        intro={dash.next.intro}
        emptyLabel={
          allHomeDomainsErrored(snapshot)
            ? dash.next.loadFailed
            : dash.next.empty
        }
        items={priorities.map((item, index) => {
          const copy = homePriorityCopy(item.id, dash);
          return {
            id: item.id,
            title: copy.title,
            body: copy.body,
            href: item.href,
            cta: copy.cta,
            countLabel:
              item.count != null
                ? interpolateTenantMessage(dash.next.count, {
                    count: item.count,
                  })
                : null,
            accent: item.accent,
            featured: index === 0,
          };
        })}
      />

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <HomeOpportunityPipeline state={convert} messages={dash.pipeline} />
        <HomeGetOblicCapacity state={capacity} messages={dash.capacity} />
      </div>

      <HomeBusinessReadiness
        title={dash.readiness.title}
        intro={dash.readiness.intro}
        tiles={[
          {
            icon: Brain,
            title: dash.define.title,
            href: "/identity",
            tone: defineView.tone,
            statusLabel: defineView.statusLabel,
            statusLine: defineView.statusLine,
            ctaLabel: defineView.ctaLabel,
          },
          {
            icon: Search,
            title: dash.visibility.title,
            href: "/seo",
            tone: visibilityView.tone,
            statusLabel: visibilityView.statusLabel,
            statusLine: visibilityView.statusLine,
            ctaLabel: visibilityView.ctaLabel,
          },
          {
            icon: Target,
            title: dash.traction.title,
            href: "/personas",
            tone: tractionView.tone,
            statusLabel: tractionView.statusLabel,
            statusLine: tractionView.statusLine,
            ctaLabel: tractionView.ctaLabel,
          },
          {
            icon: Users,
            title: dash.convert.title,
            href: "/prospects",
            tone: convertView.tone,
            statusLabel: convertView.statusLabel,
            statusLine: convertView.statusLine,
            ctaLabel: convertView.ctaLabel,
          },
        ]}
      />
    </TenantAppShell>
  );
}
