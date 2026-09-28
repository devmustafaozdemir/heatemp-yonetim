"use client";

import { CalendarRange, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cx } from "@/components/ui";
import type { ToolbarFilter } from "@/components/ui/ListToolbar";
import { hrefWith } from "@/lib/list-params";

const NAV_KEYS = new Set(["sayfa", "adet", "sirala", "yon"]);

/**
 * Sekme içindeki listeler için filtre çubuğu. Ortak ListToolbar ile aynı görünüm ve URL
 * anahtarları; farkı, sekmeyi belirleyen parametreleri (ör. ?sekme=stok) "Filtreleri temizle"
 * ve filtre değişikliklerinde korumasıdır.
 */
export function TabToolbar({
  basePath,
  values,
  keep,
  filters = [],
  dateRange,
  total,
  noun = "kayıt",
}: {
  basePath: string;
  values: Record<string, string>;
  /** Her bağlantıda korunacak sabit parametreler (ör. { sekme: "stok" }) */
  keep: Record<string, string>;
  filters?: ToolbarFilter[];
  dateRange?: { fromKey?: string; toKey?: string; label?: string };
  total: number | null;
  noun?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fromKey = dateRange?.fromKey ?? "bas";
  const toKey = dateRange?.toKey ?? "bit";

  function go(overrides: Record<string, string | null>) {
    const href = hrefWith(basePath, { ...values, ...keep }, { ...overrides, sayfa: null });
    startTransition(() => router.push(href, { scroll: false }));
  }

  const active = Object.keys(values).some((k) => !NAV_KEYS.has(k) && !(k in keep));

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
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
          onClick={() => startTransition(() => router.push(hrefWith(basePath, {}, { ...keep, adet: values.adet ?? null }), { scroll: false }))}
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-ink-soft hover:bg-canvas"
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
  );
}
