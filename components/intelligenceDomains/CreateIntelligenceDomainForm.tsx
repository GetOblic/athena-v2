import type { TenantMessages } from "@/lib/tenantI18n/types";

type CreateIntelligenceDomainFormProps = {
  action: (formData: FormData) => Promise<void>;
  messages: TenantMessages["intelligenceDomains"];
};

const fieldClassName =
  "rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[var(--athena-orange)]";

export function CreateIntelligenceDomainForm({
  action,
  messages,
}: CreateIntelligenceDomainFormProps) {
  return (
    <div className="rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6">
      <h2 className="text-xl font-semibold">{messages.createTitle}</h2>
      <p className="mt-2 text-sm leading-6 text-white/45">
        {messages.createHelp}
      </p>

      <form action={action} className="mt-6 grid gap-4">
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
            {messages.name}
          </span>
          <input
            name="name"
            required
            placeholder={messages.namePlaceholder}
            className={fieldClassName}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
            {messages.descriptionOptional}
          </span>
          <textarea
            name="description"
            rows={3}
            placeholder={messages.descriptionPlaceholder}
            className={`${fieldClassName} resize-y`}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
            {messages.marketOptional}
          </span>
          <input
            name="market"
            placeholder={messages.marketPlaceholder}
            className={fieldClassName}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
            {messages.status}
          </span>
          <select name="status" defaultValue="active" className={fieldClassName}>
            <option value="active">{messages.statusActive}</option>
            <option value="inactive">{messages.statusInactive}</option>
          </select>
        </label>

        <button
          type="submit"
          className="mt-2 rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90"
        >
          {messages.createCta}
        </button>
      </form>
    </div>
  );
}
