import Link from "next/link";
import { cx } from "@/components/ui";
import { fmtInt, fmtMoney } from "@/lib/format";

function pctText(part: number, total: number) {
  return total > 0 ? `%${((part / total) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}` : "—";
}

/**
 * Tek çubukta oransal dağılım (ör. üretim partisi / açılış stoğu) ve altında açıklama listesi.
 * Renkler tema sınıflarıyla verilir (bg-chart-teal vb.).
 */
export function SplitBar({
  items,
  unit,
  label,
}: {
  items: { name: string; value: number; color: string; hint?: string }[];
  unit: "try" | "qty";
  label: string;
}) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const fmt = (v: number) => (unit === "try" ? fmtMoney(v, "TRY") : `${fmtInt(v)} adet`);
  return (
    <div>
      <div
        role="img"
        aria-label={`${label}: ${items.map((i) => `${i.name} ${fmt(i.value)} (${pctText(i.value, total)})`).join(", ")}`}
        className="flex h-3 w-full overflow-hidden rounded-full bg-canvas"
      >
        {total > 0
          ? items
              .filter((i) => i.value > 0)
              .map((i) => <div key={i.name} className={cx("h-full", i.color)} style={{ width: `${(i.value / total) * 100}%` }} />)
          : null}
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((i) => (
          <li key={i.name} className="flex items-start justify-between gap-3 text-[13px]">
            <span className="flex min-w-0 items-start gap-2">
              <span className={cx("mt-1 size-2.5 shrink-0 rounded-sm", i.color)} aria-hidden />
              <span className="min-w-0">
                <span className="block font-medium text-ink">{i.name}</span>
                {i.hint ? <span className="block text-xs text-ink-muted">{i.hint}</span> : null}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-semibold text-ink tabular-nums">{fmt(i.value)}</span>
              <span className="block text-xs text-ink-muted tabular-nums">{pctText(i.value, total)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface SellThroughRow {
  key: string;
  label: string;
  href?: string;
  sold: number;
  remaining: number;
  /** Sağdaki ek bilgi (ör. teslimat sayısı, maliyet) */
  meta?: string;
}

/**
 * Varyant bazında teslim edilenlerin satılan / Mekonsis'te kalan dağılımı (adet).
 * Çubuk uzunluğu en büyük teslim adedine göredir; tam adlar okunur kalır.
 */
export function SellThroughList({ rows, emptyText = "Gösterilecek teslimat yok." }: { rows: SellThroughRow[]; emptyText?: string }) {
  const max = Math.max(0, ...rows.map((r) => r.sold + r.remaining));
  if (rows.length === 0 || max === 0) {
    return (
      <p className="rounded-md border border-dashed border-line-strong bg-canvas/50 px-4 py-8 text-center text-[13px] text-ink-muted">
        {emptyText}
      </p>
    );
  }
  return (
    <div>
      <ul className="space-y-3">
        {rows.map((r) => {
          const delivered = r.sold + r.remaining;
          return (
            <li key={r.key} className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px]">
                <span className="min-w-0">
                  {r.href ? (
                    <Link href={r.href} className="link font-normal text-ink-soft hover:text-brand-700">
                      {r.label}
                    </Link>
                  ) : (
                    r.label
                  )}
                </span>
                <span className="ml-auto shrink-0 text-xs text-ink-muted tabular-nums">
                  <span className="font-semibold text-ink">{fmtInt(r.sold)}</span> / {fmtInt(delivered)} adet · {pctText(r.sold, delivered)}
                  {r.meta ? ` · ${r.meta}` : ""}
                </span>
              </div>
              <div
                className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-canvas"
                role="img"
                aria-label={`${r.label}: teslim edilen ${fmtInt(delivered)}, satılan ${fmtInt(r.sold)}, kalan ${fmtInt(r.remaining)} adet`}
              >
                <div className="flex h-full" style={{ width: `${(delivered / max) * 100}%` }}>
                  {r.sold > 0 ? <div className="h-full bg-chart-teal" style={{ width: `${(r.sold / delivered) * 100}%` }} /> : null}
                  {r.remaining > 0 ? (
                    <div className="h-full bg-chart-blue" style={{ width: `${(r.remaining / delivered) * 100}%` }} />
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted" aria-label="Açıklama">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-chart-teal" aria-hidden />
          Satılan
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-chart-blue" aria-hidden />
          Mekonsis&apos;te kalan
        </li>
        <li>Çubuk uzunluğu teslim edilen adede göre</li>
      </ul>
    </div>
  );
}
