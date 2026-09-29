"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, ChartFrame, GRID_PROPS, Segmented, TooltipBox } from "@/components/charts/kit";
import { fmtDate, fmtInt, fmtUnitMoney } from "@/lib/format";

export interface CostHistoryPoint {
  id: string;
  batchNo: string;
  startedAt: string;
  completedAt: string | null;
  usd: number;
  try: number;
  qty: number;
  /** Görüntülenen parti */
  current: boolean;
  /** Görüntülenen parti henüz üretimde (tamamlanmamış) */
  inProduction: boolean;
}

type Cur = "USD" | "TRY";

/** Eksen etiketi: "PRT-2026-00015" → "26-00015" (yıl korunur; tam numara ipucunda). */
function shortBatchNo(batchNo: string): string {
  const m = /(\d{4})-(\d+)$/.exec(batchNo);
  return m ? `${m[1].slice(2)}-${m[2]}` : batchNo;
}

/**
 * Aynı varyantın üretim partilerinin birim maliyeti: tamamlanmış partiler ve
 * görüntülenen parti (üretimdeyse başlangıçta sabitlenen maliyetiyle, ayrı renk ve
 * açıklamayla). Açılış stoğu dahil değildir.
 */
export function UnitCostHistory({ points }: { points: CostHistoryPoint[] }) {
  const [cur, setCur] = useState<Cur>("USD");
  const data = points.map((p) => ({ ...p, value: cur === "USD" ? p.usd : p.try }));
  const currentInProduction = points.some((p) => p.current && p.inProduction);
  const colorOf = (p: CostHistoryPoint) => (p.current ? (p.inProduction ? CHART.amber : CHART.brand) : CHART.sky);
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
      <ChartFrame
        height={180}
        label={`Bu varyantın üretim partilerinin birim maliyeti (${cur}): tamamlanan partiler${currentInProduction ? " ve üretimdeki bu parti" : ""}`}
        empty={points.length === 0}
      >
        <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }} barCategoryGap="24%">
          <CartesianGrid {...GRID_PROPS} />
          <XAxis
            dataKey="batchNo"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: string) => shortBatchNo(v)}
            interval="preserveStartEnd"
          />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={60} tickFormatter={(v: number) => fmtUnitMoney(v, cur)} />
          <Tooltip
            cursor={{ fill: CHART.grid }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof data)[number];
              return (
                <TooltipBox
                  title={`${p.batchNo}${p.current ? (p.inProduction ? " (bu parti · üretimde)" : " (bu parti)") : ""}`}
                  rows={[
                    p.inProduction
                      ? { label: "Başlama", value: fmtDate(p.startedAt) }
                      : { label: "Tamamlanma", value: fmtDate(p.completedAt) },
                    {
                      label: "Birim (USD)",
                      value: fmtUnitMoney(p.usd, "USD"),
                      color: cur === "USD" ? colorOf(p) : undefined,
                    },
                    {
                      label: "Birim (TL)",
                      value: fmtUnitMoney(p.try, "TRY"),
                      color: cur === "TRY" ? colorOf(p) : undefined,
                    },
                    { label: "Adet", value: fmtInt(p.qty) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.id} fill={colorOf(d)} />
            ))}
          </Bar>
        </BarChart>
      </ChartFrame>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        {currentInProduction ? (
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-chart-amber" aria-hidden />
            Bu parti (üretimde · başlangıçta sabitlenen maliyet)
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-brand-600" aria-hidden />
            Bu parti
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-chart-sky" aria-hidden />
          Diğer tamamlanan partiler
        </span>
      </div>
    </div>
  );
}
