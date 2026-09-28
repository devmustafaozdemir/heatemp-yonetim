"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, ChartFrame, GRID_PROPS, Segmented, TooltipBox } from "@/components/charts/kit";
import { fmtDate, fmtInt, fmtUnitMoney } from "@/lib/format";

export interface CostHistoryPoint {
  id: string;
  batchNo: string;
  completedAt: string | null;
  usd: number;
  try: number;
  qty: number;
  current: boolean;
}

type Cur = "USD" | "TRY";

/**
 * Aynı varyantın tamamlanmış üretim partilerinin birim maliyeti (gerçekleşmiş parti
 * maliyeti). Bu parti koyu renkle vurgulanır. Açılış stoğu dahil değildir.
 */
export function UnitCostHistory({ points }: { points: CostHistoryPoint[] }) {
  const [cur, setCur] = useState<Cur>("USD");
  const data = points.map((p) => ({ ...p, value: cur === "USD" ? p.usd : p.try }));
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">Birim maliyet · {cur === "USD" ? "USD" : "TL (kayıt değeri)"}</p>
        <Segmented<Cur>
          label="Para birimi"
          value={cur}
          onChange={setCur}
          options={[
            ["USD", "USD"],
            ["TRY", "TL"],
          ]}
        />
      </div>
      <ChartFrame height={180} label={`Bu varyantın tamamlanmış üretim partilerinin birim maliyeti (${cur})`} empty={points.length === 0}>
        <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }} barCategoryGap="24%">
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="batchNo" tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v: string) => v.slice(-5)} interval="preserveStartEnd" />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={60} tickFormatter={(v: number) => fmtUnitMoney(v, cur)} />
          <Tooltip
            cursor={{ fill: CHART.grid }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof data)[number];
              return (
                <TooltipBox
                  title={`${p.batchNo}${p.current ? " (bu parti)" : ""}`}
                  rows={[
                    { label: "Tamamlanma", value: fmtDate(p.completedAt) },
                    { label: "Birim (USD)", value: fmtUnitMoney(p.usd, "USD"), color: cur === "USD" ? (p.current ? CHART.brand : CHART.sky) : undefined },
                    { label: "Birim (TL)", value: fmtUnitMoney(p.try, "TRY"), color: cur === "TRY" ? (p.current ? CHART.brand : CHART.sky) : undefined },
                    { label: "Adet", value: fmtInt(p.qty) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.id} fill={d.current ? CHART.brand : CHART.sky} />
            ))}
          </Bar>
        </BarChart>
      </ChartFrame>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-brand-600" aria-hidden />
          Bu parti
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-chart-sky" aria-hidden />
          Diğer tamamlanan partiler
        </span>
      </div>
    </div>
  );
}
