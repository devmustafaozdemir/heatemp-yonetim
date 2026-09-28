"use client";

import { CalendarRange, Loader2, Search, X } from "lucide-react";
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
}

/** Liste gezinmesiyle ilgili ve "filtre" sayılmayan anahtarlar */
const NON_FILTER_KEYS = new Set(["sayfa", "adet", "sirala", "yon"]);

/**
 * Liste filtre çubuğu: arama, seçim filtreleri, tarih aralığı, sonuç sayısı ve temizleme.
 * Durum URL'de tutulur; sunucu sayfası parametreleri okuyup sorguyu yapar.
 */
export function ListToolbar({
  basePath,
  values,
  search,
  filters = [],
  dateRange,
  total,
  noun = "kayıt",
  children,
}: {
  basePath: string;
  values: Record<string, string>;
  search?: { placeholder: string };
  filters?: ToolbarFilter[];
  dateRange?: { fromKey?: string; toKey?: string; label?: string };
  /** Toplam sonuç sayısı; sorgu hatasında null */
  total: number | null;
  noun?: string;
  /** Sağ tarafa ek içerik (ör. görünüm düğmeleri) */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(values.q ?? "");
  const timer = useRef<number | null>(null);
  const fromKey = dateRange?.fromKey ?? "bas";
  const toKey = dateRange?.toKey ?? "bit";

  // URL dışarıdan değişirse (ör. Temizle) arama kutusunu eşitle.
  const [lastQ, setLastQ] = useState(values.q ?? "");
  if ((values.q ?? "") !== lastQ) {
    setLastQ(values.q ?? "");
    setQ(values.q ?? "");
  }

  function go(overrides: Record<string, string | null>, replace = false) {
    const href = hrefWith(basePath, values, { ...overrides, sayfa: null });
    startTransition(() => (replace ? router.replace(href) : router.push(href)));
  }

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  function onSearch(v: string) {
    setQ(v);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => go({ q: v.trim() || null }, true), 350);
  }

  const active = Object.keys(values).some((k) => !NON_FILTER_KEYS.has(k));

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
      {search ? (
        <div className="relative w-full sm:w-64">
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
        <label key={f.key} className="flex min-w-0 items-center gap-1.5">
          <span className="sr-only">{f.label}</span>
          <select
            value={values[f.key] ?? ""}
            onChange={(e) => go({ [f.key]: e.target.value || null })}
            className={cx("input input-sm w-auto max-w-[14rem] pr-8", values[f.key] && "border-brand-300 bg-brand-50/50")}
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
      {active ? (
        <button
          type="button"
          onClick={() => {
            setQ("");
            startTransition(() => router.push(hrefWith(basePath, {}, { adet: values.adet ?? null })));
          }}
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-ink-soft hover:bg-canvas"
        >
          <X className="size-3.5" aria-hidden />
          Filtreleri temizle
        </button>
      ) : null}
      <div className="ml-auto flex items-center gap-3">
        {children}
        <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-ink-muted" aria-live="polite">
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          {total === null ? "Sonuç sayısı alınamadı" : `${total.toLocaleString("tr-TR")} ${noun}`}
        </span>
      </div>
    </div>
  );
}
