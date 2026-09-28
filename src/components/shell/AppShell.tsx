"use client";

import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { cx } from "@/components/ui";

export const SIDEBAR_COOKIE = "hm_menu";

/**
 * Uygulama kabuğu: sol menü + üst bar + içerik.
 * ≥1024 px: sabit menü, daraltma düğmesi (tercih çerezde saklanır).
 * <1024 px: menü soldan açılan panel.
 */
export function AppShell({
  initialCollapsed,
  topbarEnd,
  notice,
  children,
}: {
  initialCollapsed: boolean;
  topbarEnd: ReactNode;
  notice?: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Sayfa değişince mobil menüyü kapat.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMobileOpen(false);
  }

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "dar" : "genis"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <div className="min-h-screen">
      <a
        href="#icerik"
        className="sr-only z-[60] rounded bg-white px-3 py-2 text-sm font-medium text-brand-700 shadow focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        İçeriğe geç
      </a>

      {/* Masaüstü menü */}
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 hidden transition-[width] duration-200 lg:block",
          collapsed ? "w-[70px]" : "w-[250px]",
        )}
      >
        <Sidebar collapsed={collapsed} />
      </aside>

      {/* Mobil/tablet menü */}
      <div className={cx("fixed inset-0 z-50 lg:hidden", mobileOpen ? "" : "pointer-events-none")} inert={!mobileOpen}>
        <div
          className={cx("absolute inset-0 bg-[#12192b]/50 transition-opacity", mobileOpen ? "opacity-100" : "opacity-0")}
          onClick={() => setMobileOpen(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menü"
          className={cx(
            "absolute inset-y-0 left-0 w-[260px] max-w-[85vw] shadow-xl transition-transform duration-200",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="absolute top-3 right-3 rounded p-1.5 text-nav-text hover:bg-nav-hover hover:text-white"
            aria-label="Menüyü kapat"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      <div className={cx("flex min-h-screen min-w-0 flex-col transition-[padding] duration-200", collapsed ? "lg:pl-[70px]" : "lg:pl-[250px]")}>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-white pl-2 shadow-(--shadow-card) sm:pl-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-ink-soft hover:bg-canvas lg:hidden"
            aria-label="Menüyü aç"
            aria-expanded={mobileOpen}
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden rounded-md p-2 text-ink-soft hover:bg-canvas lg:inline-flex"
            aria-label={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}
            aria-pressed={collapsed}
          >
            {collapsed ? <PanelLeftOpen className="size-5" aria-hidden /> : <PanelLeftClose className="size-5" aria-hidden />}
          </button>
          <div className="min-w-0 flex-1">{notice}</div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">{topbarEnd}</div>
        </header>
        <main id="icerik" className="mx-auto w-full max-w-[1720px] flex-1 px-3 py-4 sm:px-5 sm:py-5 xl:px-6">
          {children}
        </main>
        <footer className="border-t border-line bg-white px-5 py-3 text-xs text-ink-muted">
          Heatemp üretim, stok ve Mekonsis satış yönetimi · Tutarlar işlem günü kuruyla sabitlenir.
        </footer>
      </div>
    </div>
  );
}
