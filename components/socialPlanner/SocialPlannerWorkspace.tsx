"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SocialPlannerCreateForm } from "@/components/socialPlanner/SocialPlannerCreateForm";
import { SocialPlannerHistoryCta } from "@/components/socialPlanner/SocialPlannerHistoryCta";
import { SocialPlannerTabs } from "@/components/socialPlanner/SocialPlannerTabs";
import {
  createDailySocialCalendarRequest,
  createEvergreenSocialCalendarRequest,
  type SocialPlannerCreatePayload,
} from "@/components/socialPlanner/socialPlannerClient";
import { unlockCompletionSound } from "@/lib/completionSound/playCompletionSound";
import { socialPlannerWorkspaceHref } from "@/lib/socialPlanner/socialPlannerRouting";
import type { TenantFormattingLocale } from "@/lib/tenantI18n/format";
import { en } from "@/lib/tenantI18n/messages/en";
import { getSocialPlannerErrorChrome } from "@/lib/tenantI18n/socialPlannerPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { SocialPlannerTargetAudienceView } from "@/lib/socialPlanner/socialPlannerTargetPresentation";
import type { OrganizationLanguage } from "@/services/organizationLanguage";
import type { SocialCalendarImplementedPlannerKind } from "@/services/socialPlanner/socialCalendarPlannerKind";

type SocialPlannerWorkspaceProps = {
  plannerKind: SocialCalendarImplementedPlannerKind;
  targetAudience?: SocialPlannerTargetAudienceView | null;
  messages?: TenantMessages;
  language?: OrganizationLanguage;
  locale?: TenantFormattingLocale;
};

export function SocialPlannerWorkspace({
  plannerKind,
  targetAudience = null,
  messages,
  locale = "en-US",
}: SocialPlannerWorkspaceProps) {
  const dictionary = messages ?? en;
  const copy = dictionary.socialPlanner;
  const errorChrome = useMemo(
    () => getSocialPlannerErrorChrome(dictionary),
    [dictionary],
  );
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  async function handleCreate(body: SocialPlannerCreatePayload) {
    if (submittingRef.current) return;
    unlockCompletionSound();
    submittingRef.current = true;
    setSubmitting(true);
    setCreateError(null);

    try {
      const result =
        plannerKind === "evergreen"
          ? await createEvergreenSocialCalendarRequest(body, errorChrome)
          : await createDailySocialCalendarRequest(body, errorChrome);
      if (result.kind === "auth") {
        window.location.href = "/login";
        return;
      }
      if (result.kind === "validation" || result.kind === "error") {
        setCreateError(result.message);
        return;
      }
      if (result.kind !== "ok") {
        setCreateError(copy.somethingWentWrong);
        return;
      }

      const created = result.value;
      router.push(`/social-planner/${created.id}`);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-10">
      <SocialPlannerTabs
        plannerKind={plannerKind}
        personaId={targetAudience?.personaId ?? null}
        messages={dictionary}
      />

      <SocialPlannerCreateForm
        plannerKind={plannerKind}
        submitting={submitting}
        error={createError}
        targetAudience={targetAudience}
        clearHref={socialPlannerWorkspaceHref({ planner: plannerKind })}
        onSubmit={(body) => void handleCreate(body)}
        messages={dictionary}
        locale={locale}
      />

      <SocialPlannerHistoryCta
        plannerKind={plannerKind}
        messages={dictionary}
      />
    </div>
  );
}
