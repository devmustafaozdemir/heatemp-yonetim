"use client";

import { Bar, BarChart, Cell, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, ChartFrame, DonutChart, TooltipBox } from "@/components/charts/kit";
import { fmtCompactMoney, fmtInt, fmtMoney, fmtNum } from "@/lib/format";

export interface BottleneckRow {
  key: string;
  label: string;
  maxUnits: number;
  /** Biçimlenmiş mevcut miktar (birimli) */
  available: string;
  /** Biçimlenmiş 1 adet ihtiyacı (birimli) */
  perUnit: string;
}

/** 0'dan başlayan "yuvarlak" eksen işaretleri (1-2-2,5-5 × 10ⁿ adımlarla, en fazla ~5 aralık). */
export function niceTicks(max: number, target = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const raw = max / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const unit = Math.max(1, step); // adet tam sayıdır
  const count = Math.ceil(max / unit);
  return Array.from({ length: count + 1 }, (_, i) => i * unit);
}

/** Eksen için kısa adet: 250 bin, 1,2 mn. */
function compactInt(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${fmtNum(v / 1_000_000, 2)} mn`;
  if (a >= 10_000) return `${fmtNum(v / 1_000, 0)} bin`;
  return fmtInt(v);
}

/**
 * Darboğaz analizi: her malzemenin mevcut stoğuyla (yalnız o malzeme dikkate
 * alınarak) kaç adet üretilebileceği. Kesikli çizgi istenen adettir; çizginin
 * altında kalan malzemeler kırmızıdır.
 */
export function BottleneckChart({ rows, requested }: { rows: BottleneckRow[]; requested: number }) {
  const height = Math.max(150, rows.length * 38 + 44);
  const data = rows.map((r) => ({ ...r, value: r.maxUnits }));
  const maxValue = Math.max(requested, ...data.map((d) => d.value));
  // Küçük pay: istenen adet çizgisi ve etiketi eksenin tam ucuna düşüp kesilmesin.
  const ticks = niceTicks(maxValue * 1.04);
  return (
    <div>
      <ChartFrame
        height={height}
        label={`Malzeme bazında üretilebilir adet; istenen adet ${fmtInt(requested)}`}
        empty={rows.length === 0}
        emptyText="Reçetede malzeme yok."
      >
        <BarChart data={data} layout="vertical" margin={{ top: 18, right: 24, bottom: 4, left: 4 }} barCategoryGap={8}>
          <XAxis
            type="number"
            domain={[0, ticks[ticks.length - 1]]}
            ticks={ticks}
            interval="preserveStartEnd"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tickFormatter={(v: number) => compactInt(v)}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={130}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: string) => (v.length > 19 ? `${v.slice(0, 18)}…` : v)}
          />
          <Tooltip
            cursor={{ fill: CHART.grid }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof data)[number];
              const ok = p.value >= requested;
              return (
                <TooltipBox
                  title={p.label}
                  rows={[
                    { label: "Bu malzemeyle en fazla", value: `${fmtInt(p.value)} adet`, color: ok ? CHART.teal : CHART.red },
                    { label: "Mevcut", value: p.available },
                    { label: "1 adet için", value: p.perUnit },
                    { label: "Durum", value: ok ? "Yeterli" : "Eksik" },
                  ]}
                />
              );
            }}
          />
          <ReferenceLine
            x={requested}
            stroke={CHART.brand}
            strokeDasharray="4 3"
            label={{ value: `İstenen ${fmtInt(requested)}`, position: "top", fill: CHART.axis, fontSize: 11 }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.key} fill={d.value >= requested ? CHART.teal : CHART.red} />
            ))}
          </Bar>
        </BarChart>
      </ChartFrame>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-chart-teal" aria-hidden />
          İstenen adede yetiyor
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-chart-red" aria-hidden />
          Yetmiyor (darboğaz)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-3.5 border-t-2 border-dashed border-brand-600" aria-hidden />
          İstenen adet
        </span>
      </div>
    </div>
  );
}

const SLICE_COLORS = [CHART.blue, CHART.teal, CHART.amber, CHART.violet, CHART.sky, CHART.red, CHART.slate];

/** Tahmini maliyetin malzemelere dağılımı (TL, kayıt değeri). En büyük 5 kalem + diğerleri. */
export function CostShareDonut({ rows, total }: { rows: { name: string; valueTry: number; valueUsd: number }[]; total: number }) {
  const sorted = [...rows].filter((r) => r.valueTry > 0).sort((a, b) => b.valueTry - a.valueTry);
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5);
  const slices = [
    ...top.map((r, i) => ({ name: r.name, value: r.valueTry, color: SLICE_COLORS[i], hint: fmtMoney(r.valueUsd, "USD") })),
    ...(rest.length
      ? [
          {
            name: `Diğer ${rest.length} malzeme`,
            value: rest.reduce((s, r) => s + r.valueTry, 0),
            color: SLICE_COLORS[6],
            hint: fmtMoney(
              rest.reduce((s, r) => s + r.valueUsd, 0),
              "USD",
            ),
          },
        ]
      : []),
  ];
  return (
    <DonutChart
      data={slices}
      centerLabel="Toplam"
      centerValue={total >= 1_000_000 ? fmtCompactMoney(total, "TRY") : fmtMoney(total, "TRY", 0)}
      format={(v) => fmtMoney(v, "TRY")}
      height={190}
      label="Tahmini üretim maliyetinin malzemelere göre dağılımı (TL)"
    />
  );
}
