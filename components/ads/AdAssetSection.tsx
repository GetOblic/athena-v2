"use client";

import type { ReactNode } from "react";
import {
  CopyButton,
  type CopyButtonChrome,
} from "@/components/deployment/CopyButton";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import {
  AD_DETAIL_FIELD_LABEL_CLASS,
  AD_DETAIL_FIELD_LIST_CLASS,
  AD_DETAIL_FIELD_ROW_CLASS,
  AD_DETAIL_FIELD_VALUE_CLASS,
} from "@/lib/ads/adCampaignDetailPresentation";

export type AdAssetField = {
  label: string;
  value: string;
};

type AdAssetSectionProps = {
  title: string;
  eyebrow?: string;
  fields: AdAssetField[];
  defaultOpen?: boolean;
  footer?: ReactNode;
  emptyValue?: string;
  copy?: CopyButtonChrome | null;
  tone?: "default" | "intelligence";
  icon?: ReactNode;
  iconClassName?: string;
  className?: string;
  summary?: string;
  copyVariant?: "default" | "utility";
};

export function AdAssetSection({
  title,
  eyebrow,
  fields,
  defaultOpen = true,
  footer,
  emptyValue = "—",
  copy,
  tone = "default",
  icon,
  iconClassName,
  className,
  summary,
  copyVariant = "default",
}: AdAssetSectionProps) {
  return (
    <AthenaCollapsibleSection
      title={title}
      eyebrow={eyebrow}
      defaultOpen={defaultOpen}
      summary={summary}
      icon={icon}
      iconClassName={iconClassName}
      className={className}
      tone={tone}
      contentClassName={AD_DETAIL_FIELD_LIST_CLASS}
    >
      {fields.map((field) => (
        <div key={field.label} className={AD_DETAIL_FIELD_ROW_CLASS}>
          <div className="flex items-start justify-between gap-3">
            <div className={AD_DETAIL_FIELD_LABEL_CLASS}>{field.label}</div>
            <CopyButton
              text={field.value}
              tracking={null}
              showContinue={false}
              chrome={copy}
              variant={copyVariant}
            />
          </div>
          <div className={AD_DETAIL_FIELD_VALUE_CLASS}>
            {field.value || emptyValue}
          </div>
        </div>
      ))}
      {footer}
    </AthenaCollapsibleSection>
  );
}
