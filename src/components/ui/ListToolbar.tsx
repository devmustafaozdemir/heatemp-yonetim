"use client";

import { ArrowDownUp, CalendarRange, Loader2, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cx } from "@/components/ui";
import { hrefWith } from "@/lib/list-params";

export interface ToolbarFilter {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  /** Tümü seçeneğinin metni */
  allLabel?: string;
  /** Bu filtre değişince sıfırlanacak bağımlı filtreler (ör. ürün → varyant) */
  resets?: string[];
}

/** Liste gezinmesiyle ilgili ve "filtre" sayılmayan anahtarlar */
const NON_FILTER_KEYS = new Set(["sayfa", "adet", "sirala", "yon"]);

/**
 * Liste filtre çubuğu: arama, seçim filtreleri, tarih aralığı, sıralama (kart görünümleri için),
 * sonuç sayısı ve "Filtreleri temizle". Durum URL'de tutulur; sunucu sayfası parametreleri okuyup
 * sorguyu yapar.
 */
export function ListToolbar({
  basePath,
  values,
  search,
  filters = [],
  dateRange,
  sortOptions,
  total,
  noun = "kayıt",
  preserveKeys = [],
  hash,
  children,
}: {
  basePath: string;
  values: Record<string, string>;
  search?: { placeholder: string };
  filters?: ToolbarFilter[];
  dateRange?: { fromKey?: string; toKey?: string; label?: string };
  /** Tablo başlığı olmayan (kart/mobil) görünümler için sıralama seçici: değer "sütun:yon" */
  sortOptions?: { value: string; label: string }[];
  /** Toplam sonuç sayısı; sorgu hatasında null */
  total: number | null;
  noun?: string;
  /** Filtre sayılmayan ve temizlemede korunacak anahtarlar (ör. "sekme", "donem") */
  preserveKeys?: string[];
  /** Sayfanın aşağısındaki listelerde konumu korumak için #çapa (liste kartının id'si) */
  hash?: string;
  /** Sağ tarafa ek içerik (ör. görünüm düğmeleri) */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const timer = useRef<number | null>(null);
  // Arama kutusu kontrolsüz: URL güncellenirken yazılan harfler kaybolmaz. Temizlemede yeniden kurulur.
  const [searchKey, setSearchKey] = useState(0);
  const fromKey = dateRange?.fromKey ?? "bas";
  const toKey = dateRange?.toKey ?? "bit";
  const keep = new Set([...NON_FILTER_KEYS, ...preserveKeys]);
  const h = hash ? `#${hash}` : "";

  function go(overrides: Record<string, string | null>, replace = false) {
    const href = hrefWith(basePath, values, { ...overrides, sayfa: null }) + h;
    startTransition(() => (replace ? router.replace(href, { scroll: !hash }) : router.push(href, { scroll: !hash })));
  }

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  function onSearch(v: string) {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => go({ q: v.trim() || null }, true), 350);
  }

  const active = Object.keys(values).some((k) => !keep.has(k));
  const currentSort = values.sirala ? `${values.sirala}:${values.yon ?? "desc"}` : "";

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
      {search ? (
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            key={searchKey}
            type="search"
            defaultValue={values.q ?? ""}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={search.placeholder}
            aria-label={search.placeholder}
            title={search.placeholder}
            className="input input-sm pl-8"
          />
        </div>
      ) : null}
      {filters.length ? (
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          {filters.map((f) => (
            <label key={f.key} className="min-w-0">
              <span className="sr-only">{f.label}</span>
              <select
                value={values[f.key] ?? ""}
                onChange={(e) => go({ [f.key]: e.target.value || null, ...Object.fromEntries((f.resets ?? []).map((r) => [r, null])) })}
                className={cx("input input-sm w-full pr-8 sm:w-auto sm:max-w-[15rem]", values[f.key] && "border-brand-300 bg-brand-50/50")}
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
        </div>
      ) : null}
      {dateRange ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <CalendarRange className="size-4 text-ink-muted" aria-hidden />
          <span className="text-xs text-ink-muted">{dateRange.label ?? "Tarih"}</span>
          <input
            type="date"
            value={values[fromKey] ?? ""}
            max={values[toKey] || undefined}
            onChange={(e) => go({ [fromKey]: e.target.value || null })}
            className="input input-sm w-[9.5rem]"
            aria-label={`${dateRange.label ?? "Tarih"} başlangıç`}
          />
          <span className="text-xs text-ink-muted">–</span>
          <input
            type="date"
            value={values[toKey] ?? ""}
            min={values[fromKey] || undefined}
            onChange={(e) => go({ [toKey]: e.target.value || null })}
            className="input input-sm w-[9.5rem]"
            aria-label={`${dateRange.label ?? "Tarih"} bitiş`}
          />
        </div>
      ) : null}
      {sortOptions?.length ? (
        <label className="flex min-w-0 items-center gap-1.5">
          <ArrowDownUp className="size-4 shrink-0 text-ink-muted" aria-hidden />
          <span className="sr-only">Sıralama</span>
          <select
            value={currentSort}
            onChange={(e) => {
              const [col, dir] = e.target.value.split(":");
              go({ sirala: col || null, yon: col ? dir || "desc" : null });
            }}
            className="input input-sm w-auto max-w-[15rem] pr-8"
            aria-label="Sıralama"
          >
            <option value="">Varsayılan sıralama</option>
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
        {children}
        {active ? (
          <button
            type="button"
            onClick={() => {
              if (timer.current) window.clearTimeout(timer.current);
              setSearchKey((k) => k + 1);
              const kept = Object.fromEntries(Object.entries(values).filter(([k]) => preserveKeys.includes(k) || k === "adet"));
              startTransition(() => router.push(hrefWith(basePath, kept) + h, { scroll: !hash }));
            }}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium whitespace-nowrap text-ink-soft hover:bg-canvas"
          >
            <X className="size-3.5" aria-hidden />
            Filtreleri temizle
          </button>
        ) : null}
        <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-ink-muted" aria-live="polite">
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          {total === null ? "Sonuç sayısı alınamadı" : `${total.toLocaleString("tr-TR")} ${noun}`}
        </span>
      </div>
    </div>
  );
}
