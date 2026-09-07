import type { ReactNode } from "react";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import type { TenantMessages } from "@/lib/tenantI18n/types";

type IdentityCopy = TenantMessages["identity"];

type IdentityOtherToolsProps = {
  messages: IdentityCopy;
  accountLanguageLabel: string;
  workspace: ReactNode;
  getoblic: ReactNode;
};

export function IdentityOtherTools({
  messages,
  accountLanguageLabel,
  workspace,
  getoblic,
}: IdentityOtherToolsProps) {
  return (
    <AthenaCollapsibleSection
      title={messages.page.otherToolsTitle}
      defaultOpen={false}
    >
      <div className="grid gap-8">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="text-xs uppercase tracking-[0.25em] text-white/35">
            {messages.accountLanguage}
          </div>
          <div className="mt-3 text-lg font-semibold text-white">
            {accountLanguageLabel}
          </div>
          <div className="mt-2 text-sm text-white/40">
            {messages.accountLanguageHelp}
          </div>
        </div>
        {workspace}
        {getoblic}
      </div>
    </AthenaCollapsibleSection>
  );
}
