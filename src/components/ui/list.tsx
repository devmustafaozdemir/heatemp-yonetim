import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/components/ui";
import { hrefWith, PAGE_SIZES } from "@/lib/list-params";

/** Sıralanabilir tablo başlığı (sunucu tarafı sıralama; bağlantı ile). */
export function SortTh({
  label,
  column,
  sort,
  dir,
  basePath,
  values,
  align = "left",
  title,
  className,
  hash,
}: {
  label: ReactNode;
  column: string;
  sort: string | null;
  dir: "asc" | "desc";
  basePath: string;
  values: Record<string, string>;
  align?: "left" | "right";
  title?: string;
  className?: string;
  /** Sayfanın aşağısındaki tablolarda konumu korumak için bağlantıya eklenecek #çapa */
  hash?: string;
}) {
  const active = sort === column;
  const nextDir = active && dir === "desc" ? "asc" : "desc";
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={cx(align === "right" && "num", className)} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined} title={title}>
      <Link
        href={hrefWith(basePath, values, { sirala: column, yon: nextDir, sayfa: null }) + (hash ? `#${hash}` : "")}
        className={cx("inline-flex items-center gap-1 hover:text-brand-600", align === "right" && "flex-row-reverse", active && "text-brand-700")}
        scroll={false}
      >
        {label}
        <Icon className={cx("size-3.5", !active && "opacity-40")} aria-hidden />
      </Link>
    </th>
  );
}

/** Sunucu tarafı sayfalama: "1–25 / 312", önceki/sonraki, sayfa numaraları, sayfa boyutu. */
export function Pagination({
  basePath,
  values,
  page,
  pageSize,
  total,
  noun = "kayıt",
  hash,
}: {
  basePath: string;
  values: Record<string, string>;
  page: number;
  pageSize: number;
  total: number;
  noun?: string;
  /** Sayfanın aşağısındaki listelerde sayfa değişince konumu korumak için #çapa (liste kartının id'si) */
  hash?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const windowPages = Array.from(new Set([1, page - 1, page, page + 1, pages].filter((p) => p >= 1 && p <= pages))).sort((a, b) => a - b);
  const h = hash ? `#${hash}` : "";
  const link = (p: number) => hrefWith(basePath, values, { sayfa: p === 1 ? null : p }) + h;
  const btn = "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-medium";

  return (
    <nav aria-label="Sayfalama" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
      <p className="text-xs text-ink-muted">
        <span className="font-medium text-ink-soft tabular-nums">
          {start.toLocaleString("tr-TR")}–{end.toLocaleString("tr-TR")}
        </span>{" "}
        / {total.toLocaleString("tr-TR")} {noun}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 text-xs text-ink-muted">
          <span>Sayfa başına</span>
          {PAGE_SIZES.map((s) => (
            <Link
              key={s}
              href={hrefWith(basePath, values, { adet: s === 25 ? null : s, sayfa: null }) + h}
              aria-current={s === pageSize ? "true" : undefined}
              className={cx(btn, "h-7 min-w-7", s === pageSize ? "bg-brand-50 text-brand-700" : "hover:bg-canvas")}
            >
              {s}
            </Link>
          ))}
        </div>
        {pages > 1 ? (
          <ul className="flex items-center gap-1">
            <li>
              {page > 1 ? (
                <Link href={link(page - 1)} className={cx(btn, "border border-line text-ink-soft hover:bg-canvas")} aria-label="Önceki sayfa">
                  <ChevronLeft className="size-4" aria-hidden />
                </Link>
              ) : (
                <span className={cx(btn, "border border-line text-ink-muted/50")} aria-hidden>
                  <ChevronLeft className="size-4" />
                </span>
              )}
            </li>
            {windowPages.map((p, i) => (
              <li key={p} className="flex items-center gap-1">
                {i > 0 && p - windowPages[i - 1] > 1 ? <span className="px-1 text-xs text-ink-muted">…</span> : null}
                <Link
                  href={link(p)}
                  aria-current={p === page ? "page" : undefined}
                  className={cx(btn, p === page ? "bg-brand-600 text-white" : "border border-line text-ink-soft hover:bg-canvas")}
                >
                  {p}
                </Link>
              </li>
            ))}
            <li>
              {page < pages ? (
                <Link href={link(page + 1)} className={cx(btn, "border border-line text-ink-soft hover:bg-canvas")} aria-label="Sonraki sayfa">
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              ) : (
                <span className={cx(btn, "border border-line text-ink-muted/50")} aria-hidden>
                  <ChevronRight className="size-4" />
                </span>
              )}
            </li>
          </ul>
        ) : null}
      </div>
    </nav>
  );
}

/** URL tabanlı sekmeler (sunucu bileşeni). Etkin sekme ?sekme=… ile seçilir. */
export function LinkTabs({
  tabs,
  active,
  className,
}: {
  tabs: { key: string; label: ReactNode; href: string; count?: number | null }[];
  active: string;
  className?: string;
}) {
  return (
    <nav aria-label="Sekmeler" className={cx("-mb-px flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]", className)}>
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            scroll={false}
            aria-current={on ? "page" : undefined}
            className={cx(
              "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors",
              on ? "border-brand-600 text-brand-700" : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {t.label}
            {t.count !== undefined && t.count !== null ? (
              <span className={cx("rounded-full px-1.5 py-px text-[11px] tabular-nums", on ? "bg-brand-50 text-brand-700" : "bg-canvas text-ink-muted")}>
                {t.count.toLocaleString("tr-TR")}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Durum filtresi gibi kısa seçenekler için bağlantılı segmentli düğme grubu. */
export function LinkSegmented({
  items,
  active,
  label,
}: {
  items: { key: string; label: ReactNode; href: string }[];
  active: string;
  /** Grup için erişilebilir ad (ör. "Satış durumu") */
  label?: string;
}) {
  return (
    <nav aria-label={label} className="inline-flex flex-wrap rounded-md bg-canvas p-0.5">
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          scroll={false}
          aria-current={it.key === active ? "true" : undefined}
          className={cx(
            "rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap",
            it.key === active ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink",
          )}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
