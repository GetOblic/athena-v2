export function SystemStatus() {
  return (
    <div className="rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
      <h2 className="text-xl font-semibold">System Status</h2>

      <div className="mt-8 space-y-5 text-sm">
        <Status label="Supabase" value="Connected" type="success" />
        <Status label="Authentication" value="Protected" type="success" />
        <Status label="OpenRouter" value="Connected" type="success" />
        <Status label="AI Processing" value="Ready" type="success" />
      </div>
    </div>
  );
}

function Status({
  label,
  value,
  type,
}: {
  label: string;
  value: string;
  type: "success" | "warning" | "danger";
}) {
  const color =
    type === "success"
      ? "text-[var(--athena-success)]"
      : type === "warning"
        ? "text-[var(--athena-warning)]"
        : "text-[var(--athena-danger)]";

  return (
    <div className="flex justify-between">
      <span className="text-white/40">{label}</span>
      <span className={color}>{value}</span>
    </div>
  );
}
