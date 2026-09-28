"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, ChartFrame, GRID_PROPS, Segmented, TooltipBox } from "@/components/charts/kit";
import { fmtDate, fmtInt, fmtUnitMoney } from "@/lib/format";
import type { CostPoint } from "./types";

const COLORS = [CHART.blue, CHART.teal, CHART.violet, CHART.amber, CHART.sky, CHART.red, CHART.brand];

type Cur = "USD" | "TRY";

/**
 * Tamamlanmış üretim partilerinin birim maliyet geçmişi (gerçekleşmiş parti maliyeti).
 * Varyant başına bir çizgi; isteğe bağlı yatay çizgi güncel tahmini reçete maliyetidir.
 */
export function CostHistoryChart({
  points,
  estimate,
  height = 260,
}: {
  points: CostPoint[];
  /** Tek varyant sayfasında: güncel tahmini reçete maliyeti (karşılaştırma çizgisi) */
  estimate?: { usd: number | null; try: number | null } | null;
  height?: number;
}) {
  const [cur, setCur] = useState<Cur>("USD");
  const series = useMemo(() => {
    const byVariant = new Map<string, { name: string; data: { t: number; v: number; p: CostPoint }[] }>();
    for (const p of points) {
      const s = byVariant.get(p.variant_id) ?? { name: p.variant_name, data: [] };
      s.data.push({ t: Date.parse(p.completed_at), v: Number(cur === "USD" ? p.unit_cost_usd : p.unit_cost_try), p });
      byVariant.set(p.variant_id, s);
    }
    return [...byVariant.entries()].map(([id, s], i) => ({ id, ...s, color: COLORS[i % COLORS.length] }));
  }, [points, cur]);
  const est = estimate ? (cur === "USD" ? estimate.usd : estimate.try) : null;
  const times = points.map((p) => Date.parse(p.completed_at));
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const pad = minT === maxT ? 86_400_000 * 3 : (maxT - minT) * 0.04;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
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
      <ChartFrame
        height={height}
        label={`Tamamlanmış üretim partilerinin birim maliyet geçmişi (${cur})`}
        empty={points.length === 0}
        emptyText="Henüz tamamlanmış üretim partisi yok. Açılış stoğu üretim sayılmaz."
      >
        <LineChart margin={{ top: 8, right: 16, bottom: 0, left: 4 }}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[minT - pad, maxT + pad]}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: CHART.grid }}
            tickFormatter={(v: number) => fmtDate(new Date(v)).slice(0, 5)}
            minTickGap={24}
          />
          <YAxis
            dataKey="v"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={68}
            domain={[0, "auto"]}
            tickFormatter={(v: number) => fmtUnitMoney(v, cur)}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = (payload[0].payload as { p: CostPoint }).p;
              return (
                <TooltipBox
                  title={`${p.batch_no} · ${fmtDate(p.completed_at)}`}
                  rows={[
                    { label: "Varyant", value: p.variant_name },
                    { label: "Birim maliyet (USD)", value: fmtUnitMoney(p.unit_cost_usd, "USD"), color: cur === "USD" ? (payload[0].color as string) : undefined },
                    { label: "Birim maliyet (TL)", value: fmtUnitMoney(p.unit_cost_try, "TRY"), color: cur === "TRY" ? (payload[0].color as string) : undefined },
                    { label: "Adet", value: fmtInt(p.quantity) },
                  ]}
                />
              );
            }}
          />
          {est !== null && est !== undefined ? (
            <ReferenceLine
              y={Number(est)}
              stroke={CHART.amber}
              strokeDasharray="5 4"
              label={{ value: "Tahmini reçete maliyeti", position: "insideTopRight", fill: CHART.axis, fontSize: 11 }}
            />
          ) : null}
          {series.map((s) => (
            <Line
              key={s.id}
              data={s.data}
              dataKey="v"
              name={s.name}
              type="monotone"
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 3, fill: s.color, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          ))}
          {series.length > 1 ? <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} /> : null}
        </LineChart>
      </ChartFrame>
    </div>
  );
}
