import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { TenantAppShell } from "../../components/dashboard/TenantAppShell";
import {
  TenantAthenaWordmark,
  TenantSidebar,
} from "../../components/dashboard/TenantSidebar";
import { localizeTenantNav } from "../../components/dashboard/tenantNavigation";
import { en } from "../../lib/tenantI18n/messages/en";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function renderWordmark(athenaPlan?: "full" | "free") {
  return renderToStaticMarkup(
    createElement(TenantAthenaWordmark, {
      titleClassName: "text-2xl font-bold tracking-tight",
      athenaPlan,
    }),
  );
}

function renderSidebar(athenaPlan?: "full" | "free") {
  return renderToStaticMarkup(
    createElement(TenantSidebar, {
      currentPath: "/",
      messages: en,
      athenaPlan,
    }),
  );
}

function renderShell(athenaPlan?: "full" | "free") {
  return renderToStaticMarkup(
    createElement(
      TenantAppShell,
      {
        currentPath: "/",
        messages: en,
        athenaPlan,
      },
      createElement("div", null, "Home body"),
    ),
  );
}

describe("FREE-2 Athena plan — chrome presentation", () => {
  it("renders a subtle FREE marker for free and nothing extra for full", () => {
    const free = renderWordmark("free");
    const full = renderWordmark("full");
    const omitted = renderWordmark();

    assert.match(free, /ATHENA/);
    assert.match(free, />FREE</);
    assert.doesNotMatch(free, />FULL</);

    assert.match(full, /ATHENA/);
    assert.doesNotMatch(full, />FREE</);
    assert.doesNotMatch(full, />FULL</);
    assert.equal(full, omitted);
    assert.equal(full, '<div class="text-2xl font-bold tracking-tight">ATHENA</div>');
  });

  it("shows FREE on desktop chrome only when the plan is free", () => {
    const free = renderSidebar("free");
    const full = renderSidebar("full");
    const omitted = renderSidebar();

    assert.match(free, /ATHENA/);
    assert.match(free, />FREE</);
    assert.match(free, /Intelligence OS/);
    assert.doesNotMatch(free, />FULL</);
    assert.doesNotMatch(free, /upgrade|paywall|quota/i);

    assert.match(full, /ATHENA/);
    assert.match(full, /Intelligence OS/);
    assert.doesNotMatch(full, />FREE</);
    assert.doesNotMatch(full, />FULL</);
    assert.equal(full, omitted);
  });

  it("shows FREE on tenant shell mobile header only when the plan is free", () => {
    const free = renderShell("free");
    const full = renderShell("full");
    const omitted = renderShell();

    assert.match(free, /ATHENA/);
    assert.match(free, />FREE</);
    assert.match(free, /lg:hidden/);
    assert.match(free, /Home body/);
    assert.doesNotMatch(free, />FULL</);
    assert.doesNotMatch(free, /upgrade|paywall|quota/i);

    assert.match(full, /ATHENA/);
    assert.match(full, /Home body/);
    assert.doesNotMatch(full, />FREE</);
    assert.doesNotMatch(full, />FULL</);
    assert.equal(full, omitted);
  });

  it("uses the same optional plan contract to add and remove the badge", () => {
    const sidebar = read("components/dashboard/TenantSidebar.tsx");
    const shell = read("components/dashboard/TenantAppShell.tsx");
    const mobile = read("components/dashboard/TenantMobileNav.tsx");

    assert.match(sidebar, /athenaPlan\?: AthenaPlan/);
    assert.match(sidebar, /defineKind\?: DefineKind/);
    assert.match(shell, /athenaPlan\?: AthenaPlan/);
    assert.match(shell, /defineKind\?: DefineKind/);
    assert.match(mobile, /athenaPlan\?: AthenaPlan/);
    assert.match(sidebar, /athenaPlanBadgeLabel\(athenaPlan\)/);
    assert.match(sidebar, /athenaPlan !== "free"/);
    assert.match(shell, /athenaPlan=\{athenaPlan\}/);
    assert.match(mobile, /<TenantAthenaWordmark/);
    assert.match(mobile, /athenaPlan=\{athenaPlan\}/);

    const added = renderWordmark("free");
    const removed = renderWordmark("full");
    assert.match(added, />FREE</);
    assert.doesNotMatch(removed, />FREE</);
    assert.doesNotMatch(removed, />FULL</);
  });

  it("does not infer plan from a specimen account and does not gate navigation", () => {
    const chromeFiles = [
      "components/dashboard/TenantAppShell.tsx",
      "components/dashboard/TenantSidebar.tsx",
      "components/dashboard/TenantMobileNav.tsx",
    ];
    for (const file of chromeFiles) {
      const source = read(file);
      assert.doesNotMatch(source, /freesubaccountv2|getoblic\.com/i);
      assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/);
      assert.doesNotMatch(source, /requireTenantContext|requireCurrentOrganizationContext/);
      assert.doesNotMatch(source, /paywall|entitlement|quota/i);
      assert.doesNotMatch(source, /\/pricing|\/checkout|\/billing/);
    }

    const items = localizeTenantNav(en);
    assert.equal(
      items.some((item) => item.disabled && item.key !== "settings"),
      false,
    );
    assert.ok(items.find((item) => item.key === "home" && item.href === "/"));
    assert.ok(
      items.find((item) => item.key === "defineYourBusiness" && item.href === "/identity"),
    );
  });
});
