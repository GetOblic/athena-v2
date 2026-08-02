"use client";

import type { ReactNode } from "react";
import { CopyButton } from "@/components/deployment/CopyButton";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";

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
};

export function AdAssetSection({
  title,
  eyebrow,
  fields,
  defaultOpen = true,
  footer,
}: AdAssetSectionProps) {
  return (
    <AthenaCollapsibleSection
      title={title}
      eyebrow={eyebrow}
      defaultOpen={defaultOpen}
      contentClassName="space-y-5"
    >
      {fields.map((field) => (
        <div key={field.label} className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
              {field.label}
            </div>
            <CopyButton
              text={field.value}
              tracking={null}
              showContinue={false}
            />
          </div>
          <div className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-white/80">
            {field.value || "—"}
          </div>
        </div>
      ))}
      {footer}
    </AthenaCollapsibleSection>
  );
}
