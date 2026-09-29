import {
  Boxes,
  Building2,
  Calculator,
  Factory,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  Truck,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export interface NavLeaf {
  href: string;
  label: string;
  /** Yalnız yöneticiye gösterilir (yazma işlemi sayfaları) */
  adminOnly?: boolean;
}
export interface NavItem {
  label: string;
  icon: LucideIcon;
  /** Tek sayfa: href; alt menü: children */
  href?: string;
  children?: NavLeaf[];
}
export interface NavGroup {
  title: string;
  items: NavItem[];
}

/** Sol menü ve breadcrumb için tek kaynak. */
export const NAV: NavGroup[] = [
  {
    title: "Genel",
    items: [{ label: "Dashboard", icon: LayoutDashboard, href: "/" }],
  },
  {
    title: "Üretim",
    items: [
      { label: "Ürünler ve BOM", icon: Package, href: "/urunler" },
      { label: "Hammadde", icon: Boxes, href: "/hammadde" },
      { label: "Üretim Simülasyonu", icon: Calculator, href: "/simulasyon" },
      { label: "Üretim Partileri", icon: Factory, href: "/uretim" },
    ],
  },
  {
    title: "Stok ve Satış",
    items: [
      {
        label: "Raflar",
        icon: Warehouse,
        children: [
          { href: "/rafim", label: "Heatemp rafı" },
          { href: "/mekonsis", label: "Mekonsis rafı" },
        ],
      },
      { label: "Teslimatlar", icon: Truck, href: "/teslimatlar" },
      {
        label: "Satışlar",
        icon: Receipt,
        children: [
          { href: "/satislar", label: "Satış listesi" },
          { href: "/satislar/yeni", label: "Yeni satış", adminOnly: true },
        ],
      },
      { label: "Kurumsal Müşteriler", icon: Building2, href: "/musteriler" },
    ],
  },
  {
    title: "Finans",
    items: [{ label: "Kasa", icon: Wallet, href: "/kasa" }],
  },
  {
    title: "Sistem",
    items: [{ label: "Ayarlar", icon: Settings, href: "/ayarlar" }],
  },
];

interface Trail {
  group: string;
  item: NavItem;
  leaf: NavLeaf | null;
  href: string;
}

function allTrails(): Trail[] {
  return NAV.flatMap((g) =>
    g.items.flatMap((item): Trail[] =>
      item.children
        ? item.children.map((leaf) => ({ group: g.title, item, leaf, href: leaf.href }))
        : [{ group: g.title, item, leaf: null, href: item.href! }],
    ),
  );
}

function matches(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Role göre görünür menü (görüntüleyici yazma sayfalarını görmez). */
export function navFor(role: "admin" | "viewer"): NavGroup[] {
  if (role === "admin") return NAV;
  return NAV.map((g) => ({
    ...g,
    items: g.items.map((i) => (i.children ? { ...i, children: i.children.filter((c) => !c.adminOnly) } : i)),
  }));
}

/** Yol için en uzun eşleşen menü öğesi (ör. /satislar/yeni → "Yeni satış", /satislar/SAT-1 → "Satış listesi"). */
export function activeTrail(pathname: string): Trail | null {
  let best: Trail | null = null;
  for (const t of allTrails()) {
    if (matches(pathname, t.href) && (!best || t.href.length > best.href.length)) best = t;
  }
  return best;
}
