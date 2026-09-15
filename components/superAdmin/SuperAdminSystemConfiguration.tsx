import type { FormEvent } from "react";
import { Scale, ScrollText } from "lucide-react";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS } from "@/services/estimate/athenaEstimateTypes";
import {
  SUPER_ADMIN_CARD_SURFACE,
  SUPER_ADMIN_ICON_WELL,
  SUPER_ADMIN_PRIMARY_BUTTON_CLASS,
  SUPER_ADMIN_TEXTAREA_CLASS,
} from "@/lib/superAdmin/superAdminPresentation";

type GovernedInstructionMeta = {
  revisionId: string | null;
  updatedAt: string | null;
  configured: boolean;
};

type SuperAdminSystemConfigurationProps = {
  pending: boolean;
  trendSocialPromptText: string;
  trendSocialPromptMeta: GovernedInstructionMeta;
  onTrendSocialPromptTextChange: (value: string) => void;
  onSaveTrendSocialPrompt: (event: FormEvent) => void | Promise<void>;
  estimateMethodologyText: string;
  estimateMethodologyMeta: GovernedInstructionMeta;
  onEstimateMethodologyTextChange: (value: string) => void;
  onSaveEstimatePricingMethodology: (event: FormEvent) => void | Promise<void>;
};

export function SuperAdminSystemConfiguration({
  pending,
  trendSocialPromptText,
  trendSocialPromptMeta,
  onTrendSocialPromptTextChange,
  onSaveTrendSocialPrompt,
  estimateMethodologyText,
  estimateMethodologyMeta,
  onEstimateMethodologyTextChange,
  onSaveEstimatePricingMethodology,
}: SuperAdminSystemConfigurationProps) {
  return (
    <section className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--athena-orange)]">
          System Configuration
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">
          Centrally governed instructions
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
          Configure GetOblic instructions used by future generations. Previously
          generated outputs are not rewritten.
        </p>
      </div>

      <AthenaCollapsibleSection
        eyebrow="Strategic Asset Blueprints"
        title="Centrally governed blueprint instructions"
        summary="Configure GetOblic instructions that Athena injects during future Strategic Asset Blueprint generation. Previously generated outputs are not rewritten."
        defaultOpen={false}
        showToggleLabel
        tone="identity"
        icon={<ScrollText size={20} />}
        iconClassName={SUPER_ADMIN_ICON_WELL.orange}
        className={SUPER_ADMIN_CARD_SURFACE.orange}
      >
        <form onSubmit={onSaveTrendSocialPrompt} className="space-y-4">
          <div>
            <label
              htmlFor="trend-social-prompt-instruction"
              className="text-sm font-medium text-white/80"
            >
              Trend Social Prompt
            </label>
            <p className="mt-1 text-sm leading-6 text-white/45">
              Active instruction for the Trend Social Prompt field. Distinct
              from Athena&apos;s existing Social Prompt.
            </p>
          </div>
          <textarea
            id="trend-social-prompt-instruction"
            value={trendSocialPromptText}
            onChange={(event) =>
              onTrendSocialPromptTextChange(event.target.value)
            }
            rows={14}
            spellCheck={false}
            placeholder="Enter the current GetOblic Trend Social Prompt instruction…"
            className={SUPER_ADMIN_TEXTAREA_CLASS}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs leading-5 text-white/40">
              {trendSocialPromptMeta.configured
                ? `Configured · revision ${trendSocialPromptMeta.revisionId ?? "—"}`
                : "Not configured — generations will mark Trend Social Prompt unavailable."}
              {trendSocialPromptMeta.updatedAt
                ? ` · updated ${new Date(trendSocialPromptMeta.updatedAt).toLocaleString()}`
                : ""}
            </div>
            <button
              type="submit"
              disabled={pending}
              className={SUPER_ADMIN_PRIMARY_BUTTON_CLASS}
            >
              Save Trend Social Prompt
            </button>
          </div>
        </form>
      </AthenaCollapsibleSection>

      <AthenaCollapsibleSection
        eyebrow="Athena Estimate"
        title="Athena Estimate Pricing Methodology"
        summary="Controls the commercial pricing methodology used by future Athena Estimate generations. Historical Ready Estimates are not rewritten."
        defaultOpen={false}
        showToggleLabel
        tone="identity"
        icon={<Scale size={20} />}
        iconClassName={SUPER_ADMIN_ICON_WELL.warm}
        className={SUPER_ADMIN_CARD_SURFACE.warm}
      >
        <form onSubmit={onSaveEstimatePricingMethodology} className="space-y-4">
          <div>
            <label
              htmlFor="estimate-pricing-methodology-instruction"
              className="text-sm font-medium text-white/80"
            >
              Pricing methodology instruction
            </label>
            <p className="mt-1 text-sm leading-6 text-white/45">
              Commercial guidance for future Estimate generations only. Does
              not override code-level evidence, authorization, or grounding
              rules. Maximum {ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS} characters.
            </p>
          </div>
          <textarea
            id="estimate-pricing-methodology-instruction"
            value={estimateMethodologyText}
            onChange={(event) =>
              onEstimateMethodologyTextChange(event.target.value)
            }
            rows={14}
            spellCheck={false}
            maxLength={ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS}
            placeholder="Enter the GetOblic Athena Estimate pricing methodology…"
            className={SUPER_ADMIN_TEXTAREA_CLASS}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs leading-5 text-white/40">
              {estimateMethodologyMeta.configured
                ? `Configured · revision ${estimateMethodologyMeta.revisionId ?? "—"}`
                : "Not configured — future Estimate generations will fail until a methodology is saved."}
              {estimateMethodologyMeta.updatedAt
                ? ` · updated ${new Date(estimateMethodologyMeta.updatedAt).toLocaleString()}`
                : ""}
              {` · ${estimateMethodologyText.length}/${ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS}`}
            </div>
            <button
              type="submit"
              disabled={pending}
              className={SUPER_ADMIN_PRIMARY_BUTTON_CLASS}
            >
              Save Estimate Pricing Methodology
            </button>
          </div>
        </form>
      </AthenaCollapsibleSection>
    </section>
  );
}
