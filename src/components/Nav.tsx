"use client";

import {
  Boxes,
  Building2,
  Calculator,
  Factory,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  Store,
  Wallet,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/urunler", label: "Ürünler ve BOM", icon: Package },
  { href: "/hammadde", label: "Hammadde", icon: Boxes },
  { href: "/simulasyon", label: "Üretim Simülasyonu", icon: Calculator },
  { href: "/uretim", label: "Üretim ve Partiler", icon: Factory },
  { href: "/rafim", label: "Rafım (Heatemp)", icon: Warehouse },
  { href: "/mekonsis", label: "Mekonsis Rafı", icon: Store },
  { href: "/satislar", label: "Satışlar", icon: Receipt },
  { href: "/musteriler", label: "Kurumsal Müşteriler", icon: Building2 },
  { href: "/kasa", label: "Kasa", icon: Wallet },
  { href: "/ayarlar", label: "Ayarlar", icon: Settings },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cx(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              active ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
