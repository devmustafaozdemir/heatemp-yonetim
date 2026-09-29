import { ArrowRight, Factory, Receipt, Store, Warehouse, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { cx, IconBox } from "@/components/ui";
import { fmtInt, fmtMoney } from "@/lib/format";
import type { ShelfKind } from "./types";

interface Step {
  key: string;
  label: string;
  icon: LucideIcon;
  href?: string;
}

const STEPS: Step[] = [
  { key: "uretim", label: "Üretim", icon: Factory, href: "/uretim" },
  { key: "heatemp", label: "Heatemp rafı", icon: Warehouse, href: "/rafim" },
  { key: "mekonsis", label: "Mekonsis rafı", icon: Store, href: "/mekonsis" },
  { key: "satis", label: "Satış", icon: Receipt, href: "/satislar" },
];

const EDGE: Record<string, string> = { uretim: "tamamlanınca", heatemp: "teslimat", mekonsis: "satış" };

/**
 * Konum şeridi: hangi rafta olunduğunu (renk + ikon + metin) ve mamulün akışını gösterir.
 * Heatemp rafı üreticinin deposu; Mekonsis rafı satıcıdaki, hâlâ Heatemp'e ait stoktur.
 */
export function LocationBanner({
  kind,
  other,
}: {
  kind: ShelfKind;
  /** Diğer raftaki güncel durum (yüklenemediyse null) */
  other: { qty: number; value: number } | null;
}) {
  const heatemp = kind === "heatemp";
  return (
    <section
      aria-label="Raf konumu"
      className={cx(
        "card mb-4 grid gap-4 border-l-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center",
        heatemp ? "border-l-brand-600" : "border-l-chart-teal",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <IconBox icon={heatemp ? Warehouse : Store} tone={heatemp ? "brand" : "teal"} size="md" />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">
            <span className={cx("size-2 rounded-full", heatemp ? "bg-brand-600" : "bg-chart-teal")} aria-hidden />
            {heatemp ? "Konum · Üretici" : "Konum · Satıcı"}
          </p>
          <h2 className="text-[15px] font-semibold text-ink">
            {heatemp ? "Heatemp'in deposu" : "Mekonsis'teki satış rafı — stok Heatemp'in varlığı"}
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            {heatemp
              ? "Tamamlanan üretim partileri ve açılış stoğu buraya girer. Mekonsis'e teslimat satış değildir; ürün satılana kadar Heatemp'e aittir."
              : "Mekonsis ürünleri satılana kadar Heatemp adına tutar; bu stok Heatemp'in toplam stok değerine dahildir. Ciro ve kâr yalnız satışta oluşur."}
          </p>
          <p className="mt-1.5 text-xs">
            <Link href={heatemp ? "/mekonsis" : "/rafim"} className="link">
              {heatemp ? "Mekonsis rafı" : "Heatemp rafı"}
            </Link>
            <span className="text-ink-muted">
              {other ? ` · ${fmtInt(other.qty)} adet · ${fmtMoney(other.value, "TRY")}` : " · özet yüklenemedi"}
            </span>
          </p>
        </div>
      </div>
      <nav aria-label="Mamul akışı" className="min-w-0">
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-xs">
          {STEPS.map((s, i) => {
            const current = s.key === kind;
            const Icon = s.icon;
            return (
              <li key={s.key} className="flex items-center gap-1">
                {s.href && !current ? (
                  <Link
                    href={s.href}
                    className="inline-flex items-center gap-1 rounded-md border border-line-strong px-2 py-1 font-medium text-ink-soft hover:bg-canvas"
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {s.label}
                  </Link>
                ) : (
                  // Bulunulan adım: dolgu + kenar + koyu metin (küçük metinde WCAG AA kontrastı).
                  // Heatemp lacivert dolgu/beyaz metin (~8:1); Mekonsis açık yeşil zemin, koyu metin, yeşil kenar ve ikon.
                  <span
                    aria-current="location"
                    className={cx(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-1 font-semibold",
                      heatemp ? "border-brand-600 bg-brand-600 text-white" : "border-chart-teal bg-chart-teal/12 text-ink",
                    )}
                  >
                    <Icon className={cx("size-3.5", !heatemp && "text-chart-teal")} aria-hidden />
                    {s.label}
                  </span>
                )}
                {i < STEPS.length - 1 ? (
                  <span className="flex items-center gap-0.5 px-0.5 text-[10.5px] text-ink-muted">
                    <span className="hidden xl:inline">{EDGE[s.key]}</span>
                    <ArrowRight className="size-3.5" aria-hidden />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>
    </section>
  );
}
