import { splitBusinessModelEntries } from "@/components/identity/identityPagePresentation";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
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
        <section
          className={`rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-6 sm:p-8`}
        >
          <h2 className="text-2xl font-semibold tracking-tight">
            {page.knowsTitle}
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/55">
            {copy.legacyBody}
          </p>
        </section>
      );
    }
    return null;
  }

  const { primary, secondary } = splitBusinessModelEntries(
    executive.business_model,
  );
  const lastSuccessful = identity.brain_status === "processing";

  return (
    <section className="space-y-6">
      <article
        className={`rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-6 sm:p-8`}
      >
        <h2 className="text-2xl font-semibold tracking-tight">
          {page.knowsTitle}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/50">
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
      </article>

      {secondary.length > 0 ? (
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
      ) : null}
    </section>
  );
}
