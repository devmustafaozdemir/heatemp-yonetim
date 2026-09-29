"use client";

import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, ChartFrame, GRID_PROPS, TooltipBox } from "@/components/charts/kit";
import { fmtMonth, fmtNum } from "@/lib/format";

export interface StockFlowPoint {
  month: string; // YYYY-MM
  /** Giriş: alış + parti iptali iadesi (gösterim biriminde) */
  inQty: number;
  /** Çıkış: üretim tüketimi + fire (pozitif, gösterim biriminde) */
  outQty: number;
  /** Ay sonu bakiyesi (gösterim biriminde) */
  balance: number;
}

/** Tek malzeme: aylık giriş/çıkış miktarı ve ay sonu stok (aynı birim, tek eksen). */
export function StockFlowChart({ data, unit }: { data: StockFlowPoint[]; unit: string }) {
  const empty = data.every((d) => d.inQty === 0 && d.outQty === 0 && d.balance === 0);
  const fmt = (v: number) => `${fmtNum(v, 3)} ${unit}`;
  return (
    <div>
      <ChartFrame
        height={240}
        label={`Son 12 ayda aylık giriş, çıkış ve ay sonu stok (${unit})`}
        empty={empty}
        emptyText="Son 12 ayda bu malzemede hareket yok."
      >
        <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="24%" barGap={2}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis
            dataKey="month"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={(m: string) => fmtMonth(m)}
            interval="preserveStartEnd"
            minTickGap={8}
          />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => fmtNum(v, 1)} />
          <Tooltip
            cursor={{ fill: CHART.grid }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as StockFlowPoint;
              return (
                <TooltipBox
                  title={fmtMonth(p.month)}
                  rows={[
                    { label: "Giriş", value: fmt(p.inQty), color: CHART.teal },
                    { label: "Çıkış", value: fmt(p.outQty), color: CHART.amber },
                    { label: "Ay sonu stok", value: fmt(p.balance), color: CHART.violet },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="inQty" name="Giriş" fill={CHART.teal} radius={[3, 3, 0, 0]} maxBarSize={14} isAnimationActive={false} />
          <Bar dataKey="outQty" name="Çıkış" fill={CHART.amber} radius={[3, 3, 0, 0]} maxBarSize={14} isAnimationActive={false} />
          <Line
            dataKey="balance"
            name="Ay sonu stok"
            type="stepAfter"
            stroke={CHART.violet}
            strokeWidth={2}
            dot={{ r: 2.5 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartFrame>
      {!empty ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-chart-teal" aria-hidden />
            Giriş (alış + iptal iadesi)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-chart-amber" aria-hidden />
            Çıkış (üretim + fire)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded bg-chart-violet" aria-hidden />
            Ay sonu stok
          </span>
          <span>Birim: {unit}</span>
        </div>
      ) : null}
    </div>
  );
}
