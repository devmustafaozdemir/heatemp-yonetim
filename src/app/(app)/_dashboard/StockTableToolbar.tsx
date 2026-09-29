"use client";

import { Loader2, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cx } from "@/components/ui";
import { hrefWith } from "@/lib/list-params";

const FILTER_KEYS = ["q", "durum", "kapsam"] as const;
const RESET = { q: null, durum: null, kapsam: null, sayfa: null, sirala: null, yon: null } as const;

/**
 * Ürün durumu tablosunun filtre çubuğu. Durum URL'de tutulur; dönem (donem/bas/bit/gorunum)
 * parametreleri korunur — "Filtreleri temizle" yalnız tablo filtrelerini kaldırır.
 */
export function StockTableToolbar({
  values,
  total,
  statusOptions,
  scopeOptions,
  sortOptions,
  sortValue,
}: {
  values: Record<string, string>;
  total: number;
  statusOptions: { value: string; label: string }[];
  scopeOptions: { value: string; label: string }[];
  /** Tablo gösterilmediğinde (tablo başlıkları yokken) sıralama seçimi: "sütun:yon" */
  sortOptions: { value: string; label: string }[];
  sortValue: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const urlQ = values.q ?? "";
  const [q, setQ] = useState(urlQ);
  // URL'deki q ile kutuyu eşitleme durumu. `own`: bu bileşenin başlattığı, henüz URL'ye yansımamış
  // gezinmelerin q değerleri (sırayla). URL bunlardan birine döndüğünde değişiklik kendi gezinmemizdir:
  // kullanıcı bu arada yazmaya devam etmiş olabileceğinden kutuya DOKUNULMAZ (tuş kaybı olmaz).
  // Yalnız dışarıdan gelen değişiklikte (geri/ileri, başka bağlantı) kutu URL değerine çekilir.
  const [sync, setSync] = useState<{ url: string; own: string[] }>({ url: urlQ, own: [] });
  const timer = useRef<number | null>(null);
  // Gidilmek istenen son parametreler. Gezinme tamamlanmadan (URL/props güncellenmeden) art arda
  // yapılan değişiklikler birbirini silmesin diye her gezinme bunun üzerine kurulur.
  const intended = useRef<Record<string, string>>(values);
  // Arama kutusunun anlık değeri (bekleyen zamanlayıcı ve seçim değişiklikleri için).
  const qNow = useRef(urlQ);

  if (urlQ !== sync.url) {
    const i = sync.own.indexOf(urlQ);
    if (i === -1) {
      setQ(urlQ);
      setSync({ url: urlQ, own: [] });
    } else {
      setSync({ url: urlQ, own: sync.own.slice(i + 1) });
    }
  }

  // Bekleyen gezinme kalmadığında (ya da URL dışarıdan değiştiğinde) hedefi gerçek URL değerleriyle eşitle.
  useEffect(() => {
    if (pending) return;
    intended.current = values;
    if (timer.current === null) qNow.current = values.q ?? "";
  }, [values, pending]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  function go(overrides: Record<string, string | null>, replace = false) {
    // Bekleyen arama zamanlayıcısı iptal edilir; yazılmış arama metni bu gezinmeye eklenir.
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const href = hrefWith("/", intended.current, { q: qNow.current.trim() || null, ...overrides, sayfa: null });
    const next: Record<string, string> = {};
    new URLSearchParams(href.split("?")[1] ?? "").forEach((v, k) => (next[k] = v));
    intended.current = next;
    const nextQ = next.q ?? "";
    setSync((st) => (nextQ === st.url && st.own.length === 0 ? st : { ...st, own: [...st.own, nextQ] }));
    startTransition(() => (replace ? router.replace(href, { scroll: false }) : router.push(href, { scroll: false })));
  }

  function onSearch(v: string) {
    setQ(v);
    qNow.current = v;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      go({}, true);
    }, 350);
  }

  const active = FILTER_KEYS.some((k) => values[k]);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Ürün, varyant veya kod ara"
          aria-label="Ürün, varyant veya kod ara"
          className="input input-sm pl-8"
        />
      </div>
      <select
        value={values.durum ?? ""}
        onChange={(e) => go({ durum: e.target.value || null })}
        aria-label="Stok durumu"
        className={cx("input input-sm w-full pr-8 sm:w-auto sm:max-w-full", values.durum && "border-brand-300 bg-brand-50/50")}
      >
        <option value="">Durum: tümü</option>
        {statusOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={values.kapsam ?? ""}
        onChange={(e) => go({ kapsam: e.target.value || null })}
        aria-label="Kapsam"
        className={cx("input input-sm w-full pr-8 sm:w-auto sm:max-w-full", values.kapsam && "border-brand-300 bg-brand-50/50")}
      >
        {scopeOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={sortOptions.some((o) => o.value === sortValue) ? sortValue : ""}
        onChange={(e) => {
          const [sirala, yon] = e.target.value.split(":");
          go({ sirala: sirala || null, yon: yon || null });
        }}
        aria-label="Sıralama"
        className="input input-sm w-full pr-8 sm:w-auto sm:max-w-full @min-[900px]:hidden"
      >
        {sortOptions.some((o) => o.value === sortValue) ? null : <option value="">Sırala</option>}
        {sortOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {active ? (
        <button
          type="button"
          onClick={() => {
            setQ("");
            qNow.current = "";
            go(RESET);
          }}
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-ink-soft hover:bg-canvas"
        >
          <X className="size-3.5" aria-hidden />
          Filtreleri temizle
        </button>
      ) : null}
      <span className="ml-auto flex items-center gap-1.5 text-xs whitespace-nowrap text-ink-muted" aria-live="polite">
        {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
        {total.toLocaleString("tr-TR")} varyant
      </span>
    </div>
  );
}
