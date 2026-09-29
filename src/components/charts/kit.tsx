"use client";

import { BarChart3 } from "lucide-react";
import type { ReactNode } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cx } from "@/components/ui";

/**
 * Grafik kiti: ortak renkler, eksen stili, tooltip kutusu, boş durum ve iki hazır grafik
 * (halka, yatay sütun). Alan/çizgi/sütun grafikleri Recharts ile bu sabitler kullanılarak kurulur.
 */
export const CHART = {
  blue: "#3577f1",
  teal: "#0ab39c",
  sky: "#299cdb",
  amber: "#f7b84b",
  red: "#f06548",
  violet: "#6559cc",
  slate: "#878a99",
  orange: "#f1963b",
  brand: "#405189",
  grid: "#eef0f3",
  axis: "#878a99",
} as const;

export const AXIS_TICK = { fill: CHART.axis, fontSize: 11 } as const;
export const GRID_PROPS = { stroke: CHART.grid, vertical: false } as const;

/** Sabit yükseklikli, erişilebilir grafik alanı; veri yoksa tasarlanmış boş durum. */
export function ChartFrame({
  height = 280,
  label,
  empty,
  emptyText = "Seçilen filtrelerde gösterilecek veri yok.",
  children,
}: {
  height?: number;
  /** Ekran okuyucu için grafik açıklaması */
  label: string;
  empty: boolean;
  emptyText?: ReactNode;
  children: ReactNode;
}) {
  if (empty) {
    return (
      <div
        style={{ height }}
        className="flex flex-col items-center justify-center rounded-md border border-dashed border-line-strong bg-canvas/40 px-4 text-center"
      >
        <BarChart3 className="mb-2 size-6 text-ink-muted/70" aria-hidden />
        <p className="text-[13px] text-ink-muted">{emptyText}</p>
      </div>
    );
  }
  return (
    <div style={{ height }} role="img" aria-label={label} className="w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

/** Tooltip kutusu: başlık + etiketli satırlar (birimleriyle). */
export function TooltipBox({ title, rows }: { title: ReactNode; rows: { label: ReactNode; value: ReactNode; color?: string }[] }) {
  return (
    <div className="min-w-44 rounded-md border border-line bg-white px-3 py-2 text-xs shadow-(--shadow-pop)">
      <div className="mb-1.5 font-semibold text-ink">{title}</div>
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-ink-muted">
              {r.color ? <span className="size-2 rounded-full" style={{ background: r.color }} aria-hidden /> : null}
              {r.label}
            </span>
            <span className="font-medium text-ink tabular-nums">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Grafik başlığı yanındaki küçük seçim düğmeleri (istemci durumu). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md bg-canvas p-0.5">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={cx(
            "rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap",
            value === v ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** Halka grafik + ortada toplam; dilimler için açıklama listesi yanda. */
export function DonutChart({
  data,
  centerLabel,
  centerValue,
  format,
  height = 220,
  label,
  emptyText = "Gösterilecek değer yok.",
}: {
  data: { name: string; value: number; color: string; hint?: string }[];
  centerLabel: string;
  centerValue: string;
  format: (v: number) => string;
  height?: number;
  label: string;
  emptyText?: string;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const empty = total <= 0;
  const share = (v: number) => `%${((v / total) * 100).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
  // Yerleşim kartın genişliğine göre: dar kartta halka üstte, açıklama altta.
  return (
    <div className="@container">
      <div className="grid items-center gap-4 @min-[420px]:grid-cols-[minmax(0,200px)_1fr]">
        <div className="relative mx-auto w-full max-w-[220px]">
          <ChartFrame height={height} label={label} empty={empty} emptyText={emptyText}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="64%"
                outerRadius="92%"
                paddingAngle={data.filter((d) => d.value > 0).length > 1 ? 2 : 0}
                stroke="none"
                isAnimationActive={false}
              >
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as (typeof data)[number];
                  return (
                    <TooltipBox
                      title={p.name}
                      rows={[
                        { label: "Değer", value: format(p.value), color: p.color },
                        { label: "Pay", value: share(p.value) },
                      ]}
                    />
                  );
                }}
              />
            </PieChart>
          </ChartFrame>
          {!empty ? (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-[11px] text-ink-muted">{centerLabel}</span>
              <span className="text-[15px] font-semibold text-ink tabular-nums">{centerValue}</span>
            </div>
          ) : null}
        </div>
        <ul className="space-y-2.5">
          {data.map((d) => (
            <li key={d.name} className="flex items-start justify-between gap-3 text-[13px]">
              <span className="flex min-w-0 items-start gap-2">
                <span className="mt-1 size-2.5 shrink-0 rounded-sm" style={{ background: d.color }} aria-hidden />
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{d.name}</span>
                  {d.hint ? <span className="block text-xs text-ink-muted">{d.hint}</span> : null}
                </span>
              </span>
              <span className="text-right">
                <span className="block font-semibold text-ink tabular-nums">{format(d.value)}</span>
                <span className="block text-xs text-ink-muted tabular-nums">{total > 0 ? share(d.value) : "—"}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Yatay sütun grafik (ör. en çok satan ürünler). */
export function HBarChart({
  data,
  format,
  axisFormat,
  color = CHART.blue,
  label,
  tooltipRows,
  emptyText,
  valueLabel = "Değer",
  labelWidth = 150,
}: {
  data: { key: string; label: string; value: number }[];
  format: (v: number) => string;
  axisFormat?: (v: number) => string;
  color?: string;
  label: string;
  /** Tooltip'te değerin yanında gösterilecek ek satırlar */
  tooltipRows?: (key: string) => { label: string; value: string }[];
  emptyText?: string;
  /** Tooltip'teki değer satırının birimli etiketi (ör. "Ciro (TL)") */
  valueLabel?: string;
  /** Kategori ekseni genişliği (px); uzun adlar bu genişliğe göre kısaltılır */
  labelWidth?: number;
}) {
  const maxChars = Math.max(12, Math.floor(labelWidth / 6.8));
  const height = Math.max(160, data.length * 34 + 30);
  return (
    <ChartFrame height={height} label={label} empty={data.length === 0} emptyText={emptyText}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap={8}>
        <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={axisFormat ?? format} />
        <YAxis
          type="category"
          dataKey="label"
          width={labelWidth}
          tick={{ ...AXIS_TICK, fill: "#495057" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) => (v.length > maxChars ? `${v.slice(0, maxChars - 1)}…` : v)}
        />
        <Tooltip
          cursor={{ fill: "rgba(64,81,137,0.05)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as (typeof data)[number];
            return (
              <TooltipBox title={p.label} rows={[{ label: valueLabel, value: format(p.value), color }, ...(tooltipRows?.(p.key) ?? [])]} />
            );
          }}
        />
        <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} />
      </BarChart>
    </ChartFrame>
  );
}
