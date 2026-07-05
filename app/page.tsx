import { Header } from "@/components/dashboard/Header";
import { OperatingQueue } from "@/components/dashboard/OperatingQueue";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { SystemStatus } from "@/components/dashboard/SystemStatus";

const navItems = [
  "Dashboard",
  "Communities",
  "Discussions",
  "Knowledge",
  "Resources",
  "Reports",
  "Settings",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--athena-bg)] text-white">
      <div className="flex min-h-screen">
        <aside className="hidden w-[300px] border-r border-[var(--athena-border)] bg-[var(--athena-panel)] p-7 md:block">
          <div className="mb-12">
            <div className="text-3xl font-bold tracking-tight">ATHENA</div>
            <div className="mt-2 text-sm text-white/45">
              Institutional Intelligence OS
            </div>
          </div>

          <nav className="space-y-2 text-sm">
            {navItems.map((item, index) => (
              <div
                key={item}
                className={`rounded-2xl px-5 py-4 transition ${
                  index === 0
                    ? "bg-[var(--athena-orange)] text-white shadow-lg shadow-orange-500/20"
                    : "text-white/55 hover:bg-white/5 hover:text-white"
                }`}
              >
                {item}
              </div>
            ))}
          </nav>

          <div className="absolute bottom-7 text-xs text-white/30">
            Powered by GetOblic
          </div>
        </aside>

        <section className="flex-1">
          <Header />

          <div className="p-10">
            <div className="mb-8">
              <div className="text-sm text-white/40">
                Good afternoon, Laurent.
              </div>
              <div className="mt-1 text-xl font-medium">
                Athena is ready for today&apos;s operating cycle.
              </div>
            </div>

            <StatsCards />

            <div className="mt-10 grid gap-7 lg:grid-cols-3">
              <OperatingQueue />
              <SystemStatus />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
