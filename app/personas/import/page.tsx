import Link from "next/link";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { PersonaImportForms } from "@/components/personas/PersonaImportForms";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function PersonaImportPage() {
  await requireCurrentOrganizationContext();

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <AthenaBrandLink className="mb-8" />

      <Link href="/personas" className="text-sm text-[var(--athena-orange)]">
        ← Personas
      </Link>

      <div className="mb-10 mt-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Persona Intelligence
        </div>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          Create or Import Personas
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          Manual and CSV imports create Persona records immediately. Incomplete
          profiles are welcome — only completely blank Personas are rejected.
        </p>
      </div>

      <PersonaImportForms />
    </main>
  );
}
