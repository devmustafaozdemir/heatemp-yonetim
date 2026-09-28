"use client";

import { Bar, BarChart, Cell, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, ChartFrame, DonutChart, TooltipBox } from "@/components/charts/kit";
import { fmtInt, fmtMoney } from "@/lib/format";

export interface BottleneckRow {
  key: string;
  label: string;
  maxUnits: number;
  /** Biçimlenmiş mevcut miktar (birimli) */
  available: string;
  /** Biçimlenmiş 1 adet ihtiyacı (birimli) */
  perUnit: string;
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
            domain={[0, Math.ceil(maxValue * 1.08) || 1]}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tickFormatter={(v: number) => fmtInt(v)}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={130}
            tick={{ ...AXIS_TICK, fill: "#495057" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: string) => (v.length > 19 ? `${v.slice(0, 18)}…` : v)}
          />
          <Tooltip
            cursor={{ fill: "rgba(64,81,137,0.05)" }}
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
      centerValue={fmtMoney(total, "TRY", 0)}
      format={(v) => fmtMoney(v, "TRY")}
      height={190}
      label="Tahmini üretim maliyetinin malzemelere göre dağılımı (TL)"
    />
  );
}
