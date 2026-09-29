"use client";

import { ChevronRight, Home } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { activeTrail } from "@/components/nav-config";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Menü yapısından türetilen yol: Ana sayfa › Grup › Sayfa › (ek adımlar).
 * Ek adımlar detay sayfalarında kayıt adını/numarasını gösterir.
 */
export function Breadcrumbs({ extra = [], current }: { extra?: Crumb[]; current?: string }) {
  const pathname = usePathname();
  const trail = activeTrail(pathname);
  const items: Crumb[] = [];
  if (trail && trail.href !== "/") {
    items.push({ label: trail.group });
    if (trail.leaf) items.push({ label: trail.item.label, href: trail.item.children?.[0]?.href });
    const pageLabel = trail.leaf?.label ?? trail.item.label;
    // Sayfanın kendisi listedeyse ve biz bir alt sayfadaysak bağlantı olur.
    items.push({ label: pageLabel, href: pathname === trail.href ? undefined : trail.href });
  }
  for (const c of extra) {
    if (!items.some((i) => i.href && i.href === c.href)) items.push(c);
  }
  // Sayfa başlığıyla aynı son adımı tekrar etme.
  if (current && pathname !== trail?.href && items.at(-1)?.label !== current) items.push({ label: current });

  return (
    <nav aria-label="Konum" className="mb-1.5">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-ink-muted">
        <li>
          <Link href="/" className="flex items-center gap-1 hover:text-brand-600">
            <Home className="size-3.5" aria-hidden />
            <span className={items.length ? "sr-only sm:not-sr-only" : undefined}>Ana sayfa</span>
          </Link>
        </li>
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <Fragment key={`${c.label}-${i}`}>
              <li aria-hidden>
                <ChevronRight className="size-3.5 text-ink-muted/60" />
              </li>
              <li className="max-w-[16rem] truncate" title={c.label}>
                {c.href && !last ? (
                  <Link href={c.href} className="hover:text-brand-600">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined} className={last ? "font-medium text-ink-soft" : undefined}>
                    {c.label}
                  </span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
