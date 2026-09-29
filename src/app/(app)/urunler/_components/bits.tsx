import { Package, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { STOCK_STATUS } from "@/components/StockStatus";
import { DeltaText, IconBox, cx, type Tone } from "@/components/ui";
import { fmtInt, fmtUnitMoney, toNumber } from "@/lib/format";
import type { SimulationLine } from "@/lib/types";
import { productImageUrl } from "../image";
import type { RecipeCostRow } from "./types";

/** Ürün görseli; yoksa ikonlu yer tutucu. Görsel oturum kontrollü /urun-gorseli rotasından gelir. */
export function ProductThumb({
  path,
  alt = "",
  size = "md",
  className,
}: {
  path: string | null | undefined;
  alt?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const s = { sm: "size-9", md: "size-11", lg: "size-16", xl: "size-20" }[size];
  if (path) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={productImageUrl(path)}
        alt={alt}
        loading="lazy"
        className={cx(s, "shrink-0 rounded-md border border-line bg-white object-cover", className)}
      />
    );
  }
  return (
    <span
      className={cx(s, "flex shrink-0 items-center justify-center rounded-md border border-dashed border-line-strong bg-canvas text-ink-muted/70", className)}
      aria-hidden
    >
      <Package className="size-1/2" strokeWidth={1.6} />
    </span>
  );
}

/** Varyant değeri ürün varsayılanından mı geliyor (miras) yoksa varyanta mı özel? */
export function SourceTag({ overridden }: { overridden: boolean }) {
  return overridden ? (
    <span className="rounded bg-brand-50 px-1 py-px text-[10.5px] font-semibold text-brand-700" title="Bu varyanta özel tanımlı değer">
      Özel
    </span>
  ) : (
    <span className="rounded bg-canvas px-1 py-px text-[10.5px] font-medium text-ink-muted" title="Ürünün varsayılan değeri kullanılıyor">
      Miras
    </span>
  );
}

/**
 * Başlık kartındaki anahtar göstergeler. Her gösterge üç satırlık bir alt ızgaradır
 * (grid-rows-subgrid): aynı satırdaki göstergelerin etiket, değer ve açıklama satırları ortak
 * yüksekliği paylaşır. Etiketi iki satıra kırılan bir gösterge (ör. "Gerçekleşmiş parti
 * maliyeti") diğerlerinin değerini aşağı itmez; tüm değerler aynı hizada kalır.
 */
export function KpiStrip({ items }: { items: { label: ReactNode; value: ReactNode; sub?: ReactNode }[] }) {
  return (
    <dl className="-mb-4 grid min-w-0 flex-1 grid-cols-2 gap-x-5 sm:grid-cols-3 xl:grid-cols-6">
      {items.map((it, i) => (
        <div key={i} className="row-span-3 mb-4 grid min-w-0 grid-rows-subgrid">
          <dt className="self-end text-xs font-medium text-ink-muted">{it.label}</dt>
          <dd className="mt-1 text-[15px] leading-tight font-semibold text-ink tabular-nums">{it.value}</dd>
          {it.sub ? <dd className="mt-0.5 text-xs text-ink-muted">{it.sub}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/** "Heatemp 21 · Mekonsis 30": dar sütunda raf adı ile adedi ayrılmaz, satır ancak ayraçta kırılır. */
export function ShelfSplit({ heatemp, mekonsis }: { heatemp: number | null | undefined; mekonsis: number | null | undefined }) {
  return (
    <>
      <span className="whitespace-nowrap">Heatemp {fmtInt(heatemp)}</span> · <span className="whitespace-nowrap">Mekonsis {fmtInt(mekonsis)}</span>
    </>
  );
}

/** Birden çok varyantın maliyeti: tek değer veya "en düşük – en yüksek". */
export function fmtCostRange(min: number | string | null | undefined, max: number | string | null | undefined, currency: "USD" | "TRY") {
  const a = toNumber(min);
  const b = toNumber(max);
  if (a === null && b === null) return "—";
  if (a === null || b === null || Math.abs(a - b) < 0.00005) return fmtUnitMoney(b ?? a, currency);
  return `${fmtUnitMoney(a, currency)} – ${fmtUnitMoney(b, currency)}`;
}

const METER_BAR: Record<keyof typeof STOCK_STATUS, string> = {
  critical: "bg-chart-red",
  low: "bg-orange-400",
  below_target: "bg-chart-amber",
  ok: "bg-chart-teal",
};

/**
 * Stok / hedef ilerleme çubuğu. Renk stok durumundan gelir (rozet ve dağılım çubuğuyla aynı:
 * kritik kırmızı, minimum altı turuncu, hedef altı amber, yeterli teal).
 */
export function StockProgress({
  value,
  max,
  status,
  label,
}: {
  value: number;
  max: number;
  status: keyof typeof STOCK_STATUS;
  label: string;
}) {
  const v = Number(value) || 0;
  const m = Number(max) || 0;
  const pct = m > 0 ? Math.max(0, Math.min(100, (v / m) * 100)) : v > 0 ? 100 : 0;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-canvas"
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`%${Math.round(pct)} · ${STOCK_STATUS[status].label}`}
    >
      <div className={cx("h-full rounded-full", METER_BAR[status])} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Özet kartı. Ortak StatCard ile aynı görünüm; farkı mobilde (640 px altı) iki sütuna
 * sığacak şekilde küçülmesidir: daha az iç boşluk, daha küçük değer, ikon gizli.
 */
export function StatTile({
  label,
  value,
  unit,
  icon,
  tone = "brand",
  description,
  delta,
  scope,
  href,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  description?: ReactNode;
  delta?: { pct: number | null; label: string; invert?: boolean };
  scope?: ReactNode;
  href?: string;
}) {
  const body = (
    <div className="flex h-full items-start justify-between gap-3 p-3 sm:p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[11px] font-medium tracking-wide text-ink-muted uppercase sm:text-xs">{label}</p>
          {scope ? <span className="rounded bg-canvas px-1.5 py-px text-[10.5px] font-medium text-ink-muted">{scope}</span> : null}
        </div>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 text-lg leading-none font-semibold text-ink tabular-nums sm:mt-2.5 sm:text-[22px]">
          {value}
          {unit ? <span className="text-xs font-medium text-ink-muted sm:text-[13px]">{unit}</span> : null}
        </p>
        {delta ? <DeltaText {...delta} /> : null}
        {description ? <p className="mt-1.5 text-xs text-ink-muted">{description}</p> : null}
      </div>
      <span className="hidden sm:block">
        <IconBox icon={icon} tone={tone} size="lg" />
      </span>
    </div>
  );
  return href ? (
    <Link href={href} className="card block min-w-0 transition-shadow hover:shadow-(--shadow-pop)">
      {body}
    </Link>
  ) : (
    <div className="card min-w-0">{body}</div>
  );
}

/**
 * Varyantların stok durumu dağılımı: gerçek sayılardan yatay yığılmış çubuk + açıklama.
 * Renkler stok rozetleriyle aynıdır; her dilim metinle de verilir.
 */
export function StatusMeter({ counts }: { counts: Record<keyof typeof STOCK_STATUS, number> }) {
  const order = ["critical", "low", "below_target", "ok"] as const;
  const total = order.reduce((a, k) => a + counts[k], 0);
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-canvas" role="img" aria-label={order.map((k) => `${STOCK_STATUS[k].label}: ${counts[k]}`).join(", ")}>
        {total > 0
          ? order.map((k) =>
              counts[k] > 0 ? <div key={k} className={cx("h-full", METER_BAR[k])} style={{ width: `${(counts[k] / total) * 100}%` }} /> : null,
            )
          : null}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        {order.map((k) => {
          const s = STOCK_STATUS[k];
          const Icon = s.icon;
          return (
            <li key={k} className="flex min-w-0 items-start gap-2">
              <span className={cx("mt-1 size-2.5 shrink-0 rounded-sm", METER_BAR[k])} aria-hidden />
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-[13px] font-medium text-ink">
                  <Icon className="size-3.5 text-ink-muted" aria-hidden />
                  {s.label}
                </span>
                <span className="text-xs text-ink-muted tabular-nums">
                  {fmtInt(counts[k])} varyant
                  {total > 0 ? ` · %${((counts[k] / total) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}` : ""}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Reçete satırındaki malzemenin birim maliyeti, GÖSTERİM birimi başına (ör. "$10,00 / kg").
 * Maliyet temel birim (ör. g) başına saklanır; gram başına tutar okunaksız ve 4 hanede $0,00'a
 * yuvarlanabilir. display_factor: 1 gösterim birimindeki temel birim miktarı.
 */
export function materialUnitCost(l: Pick<SimulationLine, "unit_cost_usd" | "display_factor" | "display_unit">) {
  const c = toNumber(l.unit_cost_usd);
  if (c === null) return "—";
  return `${fmtUnitMoney(c * (toNumber(l.display_factor) ?? 1), "USD")} / ${l.display_unit}`;
}

/** Tanımlı fiyat − tahmini reçete maliyeti (fiyatın para biriminde). */
export function priceMinusEstimate(
  price: number | null,
  currency: "USD" | "TRY",
  est: Pick<RecipeCostRow, "bom_line_count" | "est_unit_cost_usd" | "est_unit_cost_try"> | undefined | null,
) {
  const p = toNumber(price);
  const c = toNumber(currency === "USD" ? est?.est_unit_cost_usd : est?.est_unit_cost_try);
  if (p === null || c === null || !est || est.bom_line_count === 0) return null;
  return { diff: p - c, pct: p > 0 ? ((p - c) / p) * 100 : null };
}

