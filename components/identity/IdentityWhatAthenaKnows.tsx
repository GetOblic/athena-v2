import { Brain } from "lucide-react";
import {
  IDENTITY_CARD_ICON_CLASS,
  IDENTITY_CARD_SURFACE_CLASS,
  splitBusinessModelEntries,
} from "@/components/identity/identityPagePresentation";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import { readIdentityExecutiveIntelligence } from "@/services/identity/identityExecutiveIntelligence";
import type { AthenaIdentity } from "@/services/identity/identityService";

type IdentityCopy = TenantMessages["identity"];

type IdentityWhatAthenaKnowsProps = {
  identity: AthenaIdentity | null;
  messages: IdentityCopy;
};

export function IdentityWhatAthenaKnows({
  identity,
  messages,
}: IdentityWhatAthenaKnowsProps) {
  if (!identity) return null;

  const copy = messages.executive;
  const page = messages.page;
  const executive = readIdentityExecutiveIntelligence(identity.master_profile);

  if (!executive) {
    if (identity.brain_status === "ready" && identity.master_profile) {
      return (
        <AthenaCollapsibleSection
          title={page.knowsTitle}
          summary={page.knowsAttribution}
          defaultOpen={false}
          tone="identity"
          icon={<Brain size={20} />}
          iconClassName={IDENTITY_CARD_ICON_CLASS.orange}
          className={IDENTITY_CARD_SURFACE_CLASS.orange}
        >
          <p className="max-w-3xl text-sm leading-7 text-white/55">
            {copy.legacyBody}
          </p>
        </AthenaCollapsibleSection>
      );
    }
    return null;
  }

  const { primary, secondary } = splitBusinessModelEntries(
    executive.business_model,
  );
  const lastSuccessful = identity.brain_status === "processing";

  return (
    <AthenaCollapsibleSection
      title={page.knowsTitle}
      summary={page.knowsAttribution}
      defaultOpen={false}
      tone="identity"
      icon={<Brain size={20} />}
      iconClassName={IDENTITY_CARD_ICON_CLASS.orange}
      className={IDENTITY_CARD_SURFACE_CLASS.orange}
    >
      <p className="max-w-3xl text-sm leading-6 text-white/50">
        {page.knowsAttribution}
      </p>
      {lastSuccessful ? (
        <p className="mt-3 text-sm leading-6 text-amber-100/90">
          {page.knowsLastSuccessful}
        </p>
      ) : null}
      <p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-white/75">
        {executive.executive_summary}
      </p>

      {primary.length > 0 ? (
        <div className="mt-8">
          <div className="text-xs uppercase tracking-[0.2em] text-white/35">
            {page.knowsUnderstandingPrefix}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {primary.map(([key, value]) => (
              <div
                key={key}
                className="rounded-2xl border border-white/10 bg-black/20 p-5"
              >
                <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                  {messages.businessModel[key]}
                </div>
                <p className="mt-3 text-sm leading-6 text-white/70">{value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {secondary.length > 0 ? (
        <div className="mt-6">
          <AthenaCollapsibleSection
            eyebrow={copy.businessModelEyebrow}
            title={copy.businessModelTitle}
            defaultOpen={false}
          >
            <div className="grid gap-3 md:grid-cols-2">
              {secondary.map(([key, value]) => (
                <div
                  key={key}
                  className="rounded-2xl border border-white/10 bg-black/20 p-5"
                >
                  <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                    {messages.businessModel[key]}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/70">{value}</p>
                </div>
              ))}
            </div>
          </AthenaCollapsibleSection>
        </div>
      ) : null}
    </AthenaCollapsibleSection>
  );
}
