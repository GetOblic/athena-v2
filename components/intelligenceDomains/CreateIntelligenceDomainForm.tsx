type CreateIntelligenceDomainFormProps = {
  action: (formData: FormData) => Promise<void>;
};

const fieldClassName =
  "rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[var(--athena-orange)]";

export function CreateIntelligenceDomainForm({
  action,
}: CreateIntelligenceDomainFormProps) {
  return (
    <div className="rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6">
      <h2 className="text-xl font-semibold">Create Intelligence Domain</h2>
      <p className="mt-2 text-sm leading-6 text-white/45">
        Add a market or niche so Athena knows which context to apply when
        analyzing discussions.
      </p>

      <form action={action} className="mt-6 grid gap-4">
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
            Name
          </span>
          <input
            name="name"
            required
            placeholder="e.g. Executive Coaching"
            className={fieldClassName}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
            Description optional
          </span>
          <textarea
            name="description"
            rows={3}
            placeholder="What this domain covers"
            className={`${fieldClassName} resize-y`}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
            Market / niche optional
          </span>
          <input
            name="market"
            placeholder="e.g. B2B SaaS founders"
            className={fieldClassName}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
            Status
          </span>
          <select name="status" defaultValue="active" className={fieldClassName}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>

        <button
          type="submit"
          className="mt-2 rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90"
        >
          Create Domain
        </button>
      </form>
    </div>
  );
}
