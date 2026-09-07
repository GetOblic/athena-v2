"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import {
  TenantHelpCard,
  TenantNavList,
} from "@/components/dashboard/TenantSidebar";
import { groupTenantNav } from "@/components/dashboard/tenantNavigation";
import type { LocalizedTenantNavItem } from "@/components/dashboard/tenantNavigation";

const focusRingClassName =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]";

export type TenantMobileNavProps = {
  currentPath: string;
  items: LocalizedTenantNavItem[];
  tagline: string;
  openMenuLabel: string;
  closeMenuLabel: string;
  mainNavigationLabel: string;
  yourGrowthLabel: string;
  utilitiesLabel: string;
  moreToolsLabel: string;
  poweredByGetOblic: string;
};

export function TenantMobileNav({
  currentPath,
  items,
  tagline,
  openMenuLabel,
  closeMenuLabel,
  mainNavigationLabel,
  yourGrowthLabel,
  utilitiesLabel,
  moreToolsLabel,
  poweredByGetOblic,
}: TenantMobileNavProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const help = groupTenantNav(items).help[0];

  useEffect(() => {
    if (!open) {
      return;
    }

    const trigger = triggerRef.current;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = originalOverflow;
      trigger?.focus();
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        className={`inline-flex size-10 items-center justify-center rounded-xl text-white/80 hover:bg-white/5 hover:text-white ${focusRingClassName}`}
        aria-expanded={open}
        aria-controls="tenant-mobile-nav"
        aria-label={openMenuLabel}
        onClick={() => setOpen(true)}
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 bg-black/70 lg:hidden"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false);
            }
          }}
        >
          <div
            id="tenant-mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="flex h-dvh w-[min(20rem,88vw)] flex-col overflow-y-auto border-r border-[var(--athena-border)] bg-[var(--athena-panel)] p-5"
          >
            <div className="mb-8 flex items-start justify-between gap-3">
              <Link
                href="/"
                className={`min-w-0 transition hover:opacity-90 ${focusRingClassName}`}
                onClick={() => setOpen(false)}
              >
                <div className="text-2xl font-bold tracking-tight">ATHENA</div>
                <div className="mt-1 text-sm text-white/45">{tagline}</div>
              </Link>
              <button
                ref={closeRef}
                type="button"
                className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-white/80 hover:bg-white/5 hover:text-white ${focusRingClassName}`}
                aria-label={closeMenuLabel}
                onClick={() => setOpen(false)}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <h2 id={titleId} className="sr-only">
              {mainNavigationLabel}
            </h2>

            <TenantNavList
              currentPath={currentPath}
              items={items}
              yourGrowthLabel={yourGrowthLabel}
              utilitiesLabel={utilitiesLabel}
              moreToolsLabel={moreToolsLabel}
            />

            {help ? (
              <div className="mt-6">
                <TenantHelpCard title={help.label} subtitle={help.subtitle ?? ""} />
              </div>
            ) : null}

            <div className="mt-6 text-xs text-white/30">{poweredByGetOblic}</div>
          </div>
        </div>
      ) : (
        <div
          id="tenant-mobile-nav"
          role="dialog"
          aria-modal="true"
          aria-hidden="true"
          hidden
        />
      )}
    </div>
  );
}
