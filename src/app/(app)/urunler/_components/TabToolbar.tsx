"use client";

import { CalendarRange, Loader2, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cx } from "@/components/ui";
import type { ToolbarFilter } from "@/components/ui/ListToolbar";
import { hrefWith } from "@/lib/list-params";
import { SortSelect, type SortOption } from "./SortSelect";

const NAV_KEYS = new Set(["sayfa", "adet", "sirala", "yon"]);

/**
 * Ürün ekranlarının liste araç çubuğu. Ortak ListToolbar ile aynı görünüm ve URL anahtarları
 * (q, filtreler, bas/bit, sirala/yon); farkları:
 * - sekmeyi belirleyen parametreleri (ör. ?sekme=stok) filtre değişikliklerinde ve
 *   "Filtreleri temizle"de korur (keep),
 * - sıralama seçimi (SortSelect) içerir; `sort.mobileOnly` ile yalnız tablo başlığının
 *   olmadığı dar ekranda gösterilir,
 * - 640 px altında seçimler iki sütunlu ızgarada tam genişlikte hizalanır (dağınık görünmez).
 */
export function TabToolbar({
  basePath,
  values,
  keep = {},
  search,
  filters = [],
  sort,
  dateRange,
  total,
  noun = "kayıt",
}: {
  basePath: string;
  values: Record<string, string>;
  /** Her bağlantıda korunacak sabit parametreler (ör. { sekme: "stok" }) */
  keep?: Record<string, string>;
  search?: { placeholder: string };
  filters?: ToolbarFilter[];
  sort?: { options: SortOption[]; sort: string | null; dir: "asc" | "desc"; mobileOnly?: boolean };
  dateRange?: { fromKey?: string; toKey?: string; label?: string };
  total: number | null;
  noun?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fromKey = dateRange?.fromKey ?? "bas";
  const toKey = dateRange?.toKey ?? "bit";
  const inTab = Object.keys(keep).length > 0;
  const [q, setQ] = useState(values.q ?? "");
  const timer = useRef<number | null>(null);

  // URL dışarıdan değişirse (ör. Filtreleri temizle) arama kutusunu eşitle.
  const [lastQ, setLastQ] = useState(values.q ?? "");
  if ((values.q ?? "") !== lastQ) {
    setLastQ(values.q ?? "");
    setQ(values.q ?? "");
  }

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  function go(overrides: Record<string, string | null>, replace = false) {
    const href = hrefWith(basePath, { ...values, ...keep }, { ...overrides, sayfa: null });
    startTransition(() => (replace ? router.replace(href, { scroll: !inTab }) : router.push(href, { scroll: !inTab })));
  }

  function onSearch(v: string) {
    setQ(v);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => go({ q: v.trim() || null }, true), 350);
  }

  const active = Object.keys(values).some((k) => !NAV_KEYS.has(k) && !(k in keep));

  return (
    <div className="grid grid-cols-2 gap-2 border-b border-line px-4 py-3 sm:flex sm:flex-wrap sm:items-center">
      {search ? (
        <div className="relative col-span-2 sm:w-52 2xl:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={search.placeholder}
            aria-label={search.placeholder}
            className="input input-sm pl-8"
          />
        </div>
      ) : null}
      {filters.map((f) => (
        <label key={f.key} className="flex min-w-0 items-center">
          <span className="sr-only">{f.label}</span>
          <select
            value={values[f.key] ?? ""}
            onChange={(e) => go({ [f.key]: e.target.value || null })}
            className={cx("input input-sm w-full pr-7 sm:w-auto sm:max-w-[14rem] sm:pr-8", values[f.key] && "border-brand-300 bg-brand-50/50")}
            aria-label={f.label}
          >
            <option value="">{f.allLabel ?? `${f.label}: tümü`}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      {sort ? (
        <SortSelect
          basePath={basePath}
          values={{ ...values, ...keep }}
          options={sort.options}
          sort={sort.sort}
          dir={sort.dir}
          scroll={!inTab}
          className={sort.mobileOnly ? "sm:hidden" : undefined}
        />
      ) : null}
      {dateRange ? (
        <div className="col-span-2 flex flex-wrap items-center gap-1.5">
          {/* Dar ekranda etiket üstte, iki tarih kutusu yan yana eşit genişlikte. */}
          <span className="flex w-full items-center gap-1.5 sm:w-auto">
            <CalendarRange className="size-4 text-ink-muted" aria-hidden />
            <span className="text-xs text-ink-muted">{dateRange.label ?? "Tarih"}</span>
          </span>
          <input
            type="date"
            value={values[fromKey] ?? ""}
            max={values[toKey] || undefined}
            onChange={(e) => go({ [fromKey]: e.target.value || null })}
            className="input input-sm w-auto min-w-0 flex-1 sm:w-[9.5rem] sm:flex-none"
            aria-label={`${dateRange.label ?? "Tarih"} başlangıç`}
          />
          <span className="text-xs text-ink-muted">–</span>
          <input
            type="date"
            value={values[toKey] ?? ""}
            min={values[fromKey] || undefined}
            onChange={(e) => go({ [toKey]: e.target.value || null })}
            className="input input-sm w-auto min-w-0 flex-1 sm:w-[9.5rem] sm:flex-none"
            aria-label={`${dateRange.label ?? "Tarih"} bitiş`}
          />
        </div>
      ) : null}
      {/* Dar ekranda temizleme ve sonuç sayısı ayrı satırda; geniş ekranda çubuğun sonunda. */}
      <div className="col-span-2 flex min-h-8 items-center gap-2 sm:ml-auto sm:min-h-0">
        {active ? (
          <button
            type="button"
            onClick={() => {
              setQ("");
              startTransition(() => router.push(hrefWith(basePath, {}, { ...keep, adet: values.adet ?? null }), { scroll: !inTab }));
            }}
            className="-ml-2 inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-ink-soft hover:bg-canvas sm:ml-0"
          >
            <X className="size-3.5" aria-hidden />
            Filtreleri temizle
          </button>
        ) : null}
        <span className="ml-auto flex items-center gap-1.5 text-xs whitespace-nowrap text-ink-muted" aria-live="polite">
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          {total === null ? "Sonuç sayısı alınamadı" : `${total.toLocaleString("tr-TR")} ${noun}`}
        </span>
      </div>
    </div>
  );
}
