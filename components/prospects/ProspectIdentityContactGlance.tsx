import { Building2 } from "lucide-react";
import {
  PROSPECT_DETAIL_ANCHORS,
  PROSPECT_DETAIL_ICON,
  PROSPECT_FIELD_CHIP_CLASS,
  PROSPECT_IDENTITY_SURFACE,
} from "@/lib/prospects/prospectDetailPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { Prospect } from "@/services/prospects/prospectService";
import { normalizeWebsiteUrl } from "@/services/prospects/prospectUtils";
import { isMeaningfullyPopulated } from "@/services/prospects/prospectIntelligenceCompleteness";

type ProspectIdentityContactGlanceProps = {
  prospect: Prospect;
  messages: TenantMessages["prospects"];
};

type GlanceRow = {
  key: string;
  label: string;
  value: string;
  href?: string;
};

function locationOf(prospect: Prospect): string {
  return [prospect.city, prospect.state, prospect.country]
    .map((part) => String(part ?? "").trim())
    .filter((part) => isMeaningfullyPopulated(part))
    .join(", ");
}

export function ProspectIdentityContactGlance({
  prospect,
  messages,
}: ProspectIdentityContactGlanceProps) {
  const detail = messages.detail;
  const meta = messages.metadata;
  const categoryOrIndustry =
    (isMeaningfullyPopulated(prospect.category) && prospect.category) ||
    (isMeaningfullyPopulated(prospect.industry) && prospect.industry) ||
    "";
  const websiteHref = normalizeWebsiteUrl(prospect.website);
  const socials = [
    isMeaningfullyPopulated(prospect.linkedin) && "LinkedIn",
    isMeaningfullyPopulated(prospect.facebook) && "Facebook",
    isMeaningfullyPopulated(prospect.instagram) && "Instagram",
    isMeaningfullyPopulated(prospect.google_business_url) && "Google Business",
  ].filter((item): item is string => Boolean(item));

  const rows: GlanceRow[] = [];
  if (isMeaningfullyPopulated(prospect.business_name)) {
    rows.push({
      key: "business_name",
      label: meta.businessName,
      value: prospect.business_name.trim(),
    });
  }
  if (categoryOrIndustry) {
    rows.push({
      key: "category",
      label: detail.category,
      value: categoryOrIndustry,
    });
  }
  const location = locationOf(prospect);
  if (location) {
    rows.push({
      key: "location",
      label: messages.convert.identityLocation,
      value: location,
    });
  }
  if (isMeaningfullyPopulated(prospect.phone)) {
    rows.push({
      key: "phone",
      label: detail.phone,
      value: prospect.phone!.trim(),
    });
  }
  if (isMeaningfullyPopulated(prospect.email)) {
    rows.push({
      key: "email",
      label: detail.email,
      value: prospect.email!.trim(),
      href: `mailto:${prospect.email!.trim()}`,
    });
  }
  if (isMeaningfullyPopulated(prospect.decision_maker)) {
    rows.push({
      key: "decision_maker",
      label: detail.decisionMaker,
      value: prospect.decision_maker!.trim(),
    });
  }
  if (websiteHref) {
    rows.push({
      key: "website",
      label: detail.website,
      value: prospect.website?.trim() || websiteHref,
      href: websiteHref,
    });
  }
  if (socials.length > 0) {
    rows.push({
      key: "social",
      label: messages.convert.identityPresence,
      value: socials.join(" · "),
    });
  }

  if (rows.length === 0) return null;

  return (
    <section
      id={PROSPECT_DETAIL_ANCHORS.identity}
      data-prospect-detail="identity-contact"
      className={`rounded-[28px] border border-white/10 bg-[var(--athena-card)] p-6 sm:p-8 ${PROSPECT_IDENTITY_SURFACE}`}
    >
      <div className="flex items-start gap-4">
        <span
          className={`grid size-11 shrink-0 place-items-center rounded-2xl ${PROSPECT_DETAIL_ICON.cyan}`}
          aria-hidden="true"
        >
          <Building2 className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-200/80">
            {messages.convert.identityContact}
          </div>
          <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-white sm:text-2xl">
            {messages.convert.identityContact}
          </h2>
        </div>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.key} className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
              {row.label}
            </dt>
            <dd className="mt-2">
              {row.href ? (
                <a
                  href={row.href}
                  target={row.href.startsWith("mailto:") ? undefined : "_blank"}
                  rel={
                    row.href.startsWith("mailto:")
                      ? undefined
                      : "noopener noreferrer"
                  }
                  className="break-all text-sm leading-6 text-sky-100 underline underline-offset-2"
                >
                  {row.value}
                </a>
              ) : (
                <span className={PROSPECT_FIELD_CHIP_CLASS}>{row.value}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
