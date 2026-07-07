import fs from "fs";
import path from "path";
import Link from "next/link";
import { GoldenDatasetImportButton } from "@/components/dev/GoldenDatasetImportButton";

function getGoldenFacebookFiles() {
  const baseDir = path.join(process.cwd(), "test-data", "facebook", "pmu");

  if (!fs.existsSync(baseDir)) {
    return [];
  }

  return fs
    .readdirSync(baseDir)
    .filter((file) => file.endsWith(".txt"))
    .sort()
    .map((file) => {
      const fullPath = path.join(baseDir, file);
      return {
        file,
        title: file.replace(/\.txt$/, ""),
        body: fs.readFileSync(fullPath, "utf8").trim(),
      };
    });
}

export default function GoldenDatasetPage() {
  const files = getGoldenFacebookFiles();

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <Link href="/" className="text-sm text-[var(--athena-orange)]">
        ← Dashboard
      </Link>

      <div className="mb-10 mt-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Internal QA
        </div>

        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          Goen Dataset
        </h1>

        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          Import real anonymized Facebook discussions through Athena’s production
          ingestion workflow.
        </p>
      </div>

      <div className="grid gap-5">
        {files.length === 0 ? (
          <div className="rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8 text-white/50">
            No golden dataset files found.
          </div>
        ) : (
          files.map((item) => (
            <section
              key={item.file}
              className="rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8"
            >
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.25em] text-white/35">
                    {item.file}
                  </div>

                  <h2 className="mt-3 text-2xl font-mibold">{item.title}</h2>

                  <p className="mt-4 max-w-4xl text-sm leading-7 text-white/60">
                    {item.body}
                  </p>
                </div>

                <GoldenDatasetImportButton title={item.title} body={item.body} />
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
