"use client";

import { Mail } from "lucide-react";
import { CopyButton } from "@/components/deployment/CopyButton";
import { ContinueButton } from "@/components/deployment/ContinueButton";
import { SEO_STRATEGY_ICON } from "@/components/seo/seoStrategyReportPresentation";
import { getAssetCopyChrome } from "@/lib/tenantI18n/opportunityPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import { formatSeoAccompanyingFullEmail } from "@/services/seo/seoAccompanyingEmail";
import type { PublicSeoAccompanyingEmail } from "@/services/seo/seoReportPublic";

type SeoAccompanyingEmailCardProps = {
  status: string;
  email: PublicSeoAccompanyingEmail | null;
  messages: TenantMessages;
};

export function SeoAccompanyingEmailCard({
  status,
  email,
  messages,
}: SeoAccompanyingEmailCardProps) {
  if (status !== "Ready" || !email) return null;

  const copy = messages.seo.accompanyingEmail;
  const chrome = getAssetCopyChrome(messages);
  const fullEmail = formatSeoAccompanyingFullEmail(email);

  return (
    <section className="mt-6 rounded-[28px] border border-white/10 bg-[var(--athena-card)] p-6">
      <div className="flex items-start gap-4">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-2xl ${SEO_STRATEGY_ICON.green}`}
          aria-hidden="true"
        >
          <Mail size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight">{copy.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
            {copy.intro}
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
              {copy.subjectLabel}
            </div>
            <CopyButton
              text={email.subject}
              tracking={null}
              showContinue={false}
              variant="utility"
              chrome={{
                ...chrome,
                copy: copy.copySubject,
                copyAria: copy.copySubject,
              }}
            />
          </div>
          <div className="whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-white/80">
            {email.subject}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
              {copy.bodyLabel}
            </div>
            <CopyButton
              text={email.body}
              tracking={null}
              showContinue={false}
              variant="utility"
              chrome={{
                ...chrome,
                copy: copy.copyBody,
                copyAria: copy.copyBody,
              }}
            />
          </div>
          <div className="whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-white/80">
            {email.body}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CopyButton
            text={fullEmail}
            tracking={null}
            showContinue={false}
            variant="utility"
            chrome={{
              ...chrome,
              copy: copy.copyFull,
              copyAria: copy.copyFull,
            }}
          />
          <ContinueButton
            text={fullEmail}
            assetType="email_outreach"
            label={chrome.continue}
            ariaLabel={copy.continueAria}
            toasts={chrome.continueToasts}
          />
        </div>
      </div>
    </section>
  );
}
