"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { activeTrail, navFor, type NavItem } from "@/components/nav-config";
import { BrandMark } from "@/components/shell/BrandMark";
import { cx } from "@/components/ui";

/**
 * Koyu lacivert sol menü. Masaüstünde daraltılabilir (yalnız ikonlar; üzerine gelince
 * alt menü açılır), mobil/tablette AppShell tarafından kayar panel olarak gösterilir.
 */
export function Sidebar({
  collapsed,
  onNavigate,
  role = "admin",
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  role?: "admin" | "viewer";
}) {
  const pathname = usePathname();
  const trail = activeTrail(pathname);

  return (
    <div className="flex h-full flex-col bg-nav text-nav-text">
      <Link
        href="/"
        onClick={onNavigate}
        className={cx("flex h-14 shrink-0 items-center gap-2.5 border-b border-white/5", collapsed ? "justify-center px-0" : "px-5")}
        aria-label="Heatemp Yönetim — Dashboard"
      >
        <BrandMark className="size-9" preload />
        {!collapsed ? (
          <span className="leading-tight">
            <span className="block text-[15px] font-semibold tracking-wide text-white">HEATEMP</span>
            <span className="block text-[11px] text-nav-title">Üretim · Stok · Satış</span>
          </span>
        ) : null}
      </Link>

      <nav aria-label="Ana menü" className={cx("flex-1 py-3", collapsed ? "overflow-visible px-2" : "overflow-y-auto px-3")}>
        {navFor(role).map((group) => (
          <div key={group.title} className="mb-2">
            {collapsed ? (
              <div className="mx-auto my-2 h-px w-6 bg-white/10" aria-hidden />
            ) : (
              <div className="px-2.5 pt-2 pb-1.5 text-[11px] font-semibold tracking-wider text-nav-title uppercase">{group.title}</div>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.label}>
                  <MenuItem item={item} collapsed={collapsed} activeHref={trail?.href ?? null} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

function MenuItem({
  item,
  collapsed,
  activeHref,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  activeHref: string | null;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const childActive = item.children?.some((c) => c.href === activeHref) ?? false;
  const [open, setOpen] = useState(childActive);
  const isOpen = open || childActive;
  const base =
    "group/item flex w-full items-center gap-3 rounded-md text-[13.5px] transition-colors hover:bg-nav-hover hover:text-white";

  if (!item.children) {
    const active = item.href === activeHref;
    return (
      <div className="group/fly relative">
        <Link
          href={item.href!}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          aria-label={collapsed ? item.label : undefined}
          className={cx(base, collapsed ? "justify-center px-0 py-2.5" : "px-2.5 py-2", active && "bg-nav-hover font-medium text-white")}
        >
          <Icon className={cx("size-[18px] shrink-0", active ? "text-white" : "text-nav-text")} aria-hidden />
          {!collapsed ? <span className="truncate">{item.label}</span> : null}
          {active && !collapsed ? <span className="ml-auto h-4 w-0.5 rounded bg-chart-blue" aria-hidden /> : null}
        </Link>
        {collapsed ? <Flyout title={item.label} /> : null}
      </div>
    );
  }

  if (collapsed) {
    return (
      <div className="group/fly relative">
        <Link
          href={item.children[0].href}
          onClick={onNavigate}
          aria-label={item.label}
          className={cx(base, "justify-center px-0 py-2.5", childActive && "bg-nav-hover text-white")}
        >
          <Icon className="size-[18px] shrink-0" aria-hidden />
        </Link>
        <Flyout title={item.label}>
          {item.children.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              onClick={onNavigate}
              aria-current={c.href === activeHref ? "page" : undefined}
              className={cx(
                "block rounded px-3 py-1.5 text-[13px] hover:bg-nav-hover hover:text-white",
                c.href === activeHref ? "font-medium text-white" : "text-nav-text",
              )}
            >
              {c.label}
            </Link>
          ))}
        </Flyout>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={isOpen}
        className={cx(base, "px-2.5 py-2", childActive && "text-white")}
      >
        <Icon className={cx("size-[18px] shrink-0", childActive ? "text-white" : "text-nav-text")} aria-hidden />
        <span className="truncate">{item.label}</span>
        <ChevronDown className={cx("ml-auto size-4 transition-transform", isOpen && "rotate-180")} aria-hidden />
      </button>
      {isOpen ? (
        <ul className="mt-0.5 mb-1 space-y-0.5 pl-[42px]">
          {item.children.map((c) => {
            const active = c.href === activeHref;
            return (
              <li key={c.href}>
                <Link
                  href={c.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "relative block rounded-md py-1.5 pr-2 pl-3 text-[13px] transition-colors hover:text-white",
                    active ? "font-medium text-white" : "text-nav-text",
                  )}
                >
                  <span
                    className={cx("absolute top-1/2 left-0 size-1.5 -translate-y-1/2 rounded-full", active ? "bg-chart-blue" : "bg-nav-title/60")}
                    aria-hidden
                  />
                  {c.label}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}

/** Daraltılmış menüde öğenin üzerine gelince/odaklanınca açılan etiket ve alt menü. */
function Flyout({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="invisible absolute top-0 left-full z-50 ml-2 min-w-44 rounded-md bg-nav py-2 opacity-0 shadow-(--shadow-pop) ring-1 ring-white/10 transition-opacity group-focus-within/fly:visible group-focus-within/fly:opacity-100 group-hover/fly:visible group-hover/fly:opacity-100">
      <div className={cx("px-3 text-[13px] font-semibold text-white", children ? "pb-1.5" : "")}>{title}</div>
      {children ? <div className="px-1">{children}</div> : null}
    </div>
  );
}
