"use client";

import { ChevronDown, LogOut, Settings, ShieldCheck, Eye } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";

/** Üst bardaki kullanıcı menüsü: hesap, rol, ayarlar ve çıkış. */
export function UserMenu({
  email,
  role,
  signOut,
}: {
  email: string | null;
  role: "admin" | "viewer";
  signOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initials = (email ?? "?").slice(0, 2).toUpperCase();
  const roleLabel = role === "admin" ? "Yönetici" : "Görüntüleyici";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-14 items-center gap-2 bg-canvas px-2.5 hover:bg-line sm:px-3"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white" aria-hidden>
          {initials}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-44 truncate text-[13px] font-medium text-ink">{email}</span>
          <span className="block text-xs text-ink-muted">{roleLabel}</span>
        </span>
        <ChevronDown className={cx("hidden size-4 text-ink-muted transition-transform sm:block", open && "rotate-180")} aria-hidden />
        <span className="sr-only">Kullanıcı menüsü</span>
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-50 mt-1 w-64 rounded-md border border-line bg-white py-1.5 shadow-(--shadow-pop)">
          <div className="border-b border-line px-4 pt-1.5 pb-2.5">
            <div className="truncate text-[13px] font-medium text-ink" title={email ?? undefined}>
              {email}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
              {role === "admin" ? <ShieldCheck className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
              {roleLabel}
              {role === "viewer" ? " · salt okunur" : null}
            </div>
          </div>
          <Link
            role="menuitem"
            href="/ayarlar"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2 text-[13px] text-ink-soft hover:bg-canvas"
          >
            <Settings className="size-4 text-ink-muted" aria-hidden />
            Ayarlar ve kur
          </Link>
          <form action={signOut}>
            <button role="menuitem" className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-ink-soft hover:bg-canvas">
              <LogOut className="size-4 text-ink-muted" aria-hidden />
              Çıkış yap
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
