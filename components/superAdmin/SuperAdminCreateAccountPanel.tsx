"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Plus } from "lucide-react";
import {
  SUPER_ADMIN_ICON_WELL,
  SUPER_ADMIN_PANEL_CLASS,
  SUPER_ADMIN_PRIMARY_BUTTON_CLASS,
} from "@/lib/superAdmin/superAdminPresentation";

type SuperAdminCreateAccountPanelProps = {
  title: string;
  summary: string;
  actionLabel: string;
  pending: boolean;
  onSubmit: (event: FormEvent) => void | Promise<void>;
  children: ReactNode;
};

export function SuperAdminCreateAccountPanel({
  title,
  summary,
  actionLabel,
  pending,
  onSubmit,
  children,
}: SuperAdminCreateAccountPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className={SUPER_ADMIN_PRIMARY_BUTTON_CLASS}
      >
        <Plus size={16} aria-hidden="true" />
        {open ? `Close ${actionLabel}` : actionLabel}
      </button>

      {open ? (
        <form
          onSubmit={onSubmit}
          className={`${SUPER_ADMIN_PANEL_CLASS} space-y-4`}
        >
          <div className="flex items-start gap-3">
            <span
              className={`grid size-10 place-items-center rounded-2xl ${SUPER_ADMIN_ICON_WELL.orange}`}
              aria-hidden="true"
            >
              <Plus size={18} />
            </span>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--athena-orange)]">
                {title}
              </div>
              <p className="mt-2 text-sm leading-6 text-white/50">{summary}</p>
            </div>
          </div>
          {children}
          <button
            type="submit"
            disabled={pending}
            className={SUPER_ADMIN_PRIMARY_BUTTON_CLASS}
          >
            {actionLabel}
          </button>
        </form>
      ) : null}
    </div>
  );
}

