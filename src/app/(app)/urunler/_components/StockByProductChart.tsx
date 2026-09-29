"use client";

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, ChartFrame, TooltipBox } from "@/components/charts/kit";
import { fmtInt } from "@/lib/format";

export interface StockBarRow {
  key: string;
  label: string;
  code: string;
  heatemp: number;
  mekonsis: number;
}

/** Ürün bazında mamul stok: Heatemp rafı + Mekonsis rafı (adet, yığılmış). */
export function StockByProductChart({ data }: { data: StockBarRow[] }) {
  const height = Math.max(180, data.length * 30 + 36);
  return (
    <div>
      <ChartFrame height={height} label="Ürün bazında Heatemp ve Mekonsis raflarındaki mamul stok (adet)" empty={data.length === 0} emptyText="Rafta mamul stok yok.">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap={7}>
          <CartesianGrid stroke={CHART.grid} horizontal={false} />
          <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={(v: number) => fmtInt(v)} />
          <YAxis
            type="category"
            dataKey="code"
            width={96}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)}
          />
          <Tooltip
            cursor={{ fill: CHART.grid }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as StockBarRow;
              return (
                <TooltipBox
                  title={`${p.label} (${p.code})`}
                  rows={[
                    { label: "Heatemp rafı", value: `${fmtInt(p.heatemp)} adet`, color: CHART.blue },
                    { label: "Mekonsis rafı", value: `${fmtInt(p.mekonsis)} adet`, color: CHART.teal },
                    { label: "Toplam", value: `${fmtInt(p.heatemp + p.mekonsis)} adet` },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="heatemp" name="Heatemp rafı" stackId="s" fill={CHART.blue} maxBarSize={18} isAnimationActive={false} />
          <Bar dataKey="mekonsis" name="Mekonsis rafı" stackId="s" fill={CHART.teal} radius={[0, 3, 3, 0]} maxBarSize={18} isAnimationActive={false} />
        </BarChart>
      </ChartFrame>
      {data.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-chart-blue" aria-hidden />
            Heatemp rafı
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-chart-teal" aria-hidden />
            Mekonsis rafı
          </span>
          <span>Adet · Mekonsis rafındaki stok da Heatemp&apos;in varlığıdır</span>
        </div>
      ) : null}
    </div>
  );
}
