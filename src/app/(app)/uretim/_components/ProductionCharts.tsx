"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, ChartFrame, GRID_PROPS, HBarChart, Segmented, TooltipBox } from "@/components/charts/kit";
import { fmtCompactMoney, fmtInt, fmtMoney, fmtMonth } from "@/lib/format";
import type { MonthlyProductionPoint, ProductionByVariantRow } from "./types";

type Mode = "qty" | "cost";

/**
 * Son 12 ayın üretimi: adet (başlatılan / tamamlanan) veya tamamlanan partilerin
 * maliyeti (TL). Para ve adet aynı eksende gösterilmez; segmentle seçilir.
 * Açılış stoğu dahil değildir.
 */
export function MonthlyProductionChart({ data }: { data: MonthlyProductionPoint[] }) {
  const [mode, setMode] = useState<Mode>("qty");
  const empty = data.every((d) => d.startedQty === 0 && d.completedQty === 0);
  const series =
    mode === "qty"
      ? [
          { key: "startedQty" as const, label: "Başlatılan (adet)", color: CHART.blue },
          { key: "completedQty" as const, label: "Tamamlanan (adet)", color: CHART.teal },
        ]
      : [{ key: "costTry" as const, label: "Tamamlanan parti maliyeti (TL)", color: CHART.violet }];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">{mode === "qty" ? "Adet · ay bazında" : "TL · tamamlanma ayına göre (kayıt değeri)"}</p>
        <Segmented<Mode>
          label="Gösterim"
          value={mode}
          onChange={setMode}
          options={[
            ["qty", "Adet"],
            ["cost", "Maliyet (TL)"],
          ]}
        />
      </div>
      <ChartFrame
        height={240}
        label={mode === "qty" ? "Son 12 ayda başlatılan ve tamamlanan üretim adedi" : "Son 12 ayda tamamlanan üretim partilerinin maliyeti (TL)"}
        empty={empty}
        emptyText="Son 12 ayda üretim partisi yok. Açılış stoğu üretim sayılmaz."
      >
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%" barGap={2}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="month" tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(m: string) => fmtMonth(m)} interval="preserveStartEnd" minTickGap={8} />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={mode === "qty" ? 44 : 64}
            allowDecimals={false}
            tickFormatter={(v: number) => (mode === "qty" ? fmtInt(v) : fmtCompactMoney(v, "TRY"))}
          />
          <Tooltip
            cursor={{ fill: CHART.grid }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as MonthlyProductionPoint;
              return (
                <TooltipBox
                  title={fmtMonth(p.month)}
                  rows={[
                    { label: "Başlatılan", value: `${fmtInt(p.startedQty)} adet · ${fmtInt(p.startedBatches)} parti`, color: mode === "qty" ? CHART.blue : undefined },
                    { label: "Tamamlanan", value: `${fmtInt(p.completedQty)} adet · ${fmtInt(p.completedBatches)} parti`, color: mode === "qty" ? CHART.teal : undefined },
                    { label: "Maliyet (TL)", value: fmtMoney(p.costTry, "TRY"), color: mode === "cost" ? CHART.violet : undefined },
                    { label: "Maliyet (USD)", value: fmtMoney(p.costUsd, "USD") },
                    ...(p.cancelledBatches ? [{ label: "İptal edilen", value: `${fmtInt(p.cancelledBatches)} parti` }] : []),
                  ]}
                />
              );
            }}
          />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          ))}
        </BarChart>
      </ChartFrame>
      {!empty ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
              {s.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Son 12 ayda en çok üretilen varyantlar (tamamlanan üretim partileri, adet). */
export function TopProducedChart({ rows }: { rows: ProductionByVariantRow[] }) {
  const top = rows.slice(0, 8);
  const byId = new Map(top.map((r) => [r.variant_id, r]));
  return (
    <HBarChart
      data={top.map((r) => ({ key: r.variant_id, label: r.display_name, value: Number(r.quantity) }))}
      format={(v) => `${fmtInt(v)} adet`}
      axisFormat={(v) => fmtInt(v)}
      color={CHART.teal}
      label="Son 12 ayda en çok üretilen varyantlar (adet)"
      emptyText="Son 12 ayda tamamlanan üretim partisi yok."
      tooltipRows={(key) => {
        const r = byId.get(key);
        return r
          ? [
              { label: "Parti", value: fmtInt(r.batches) },
              { label: "Maliyet (TL)", value: fmtMoney(r.cost_try, "TRY") },
              { label: "Maliyet (USD)", value: fmtMoney(r.cost_usd, "USD") },
            ]
          : [];
      }}
    />
  );
}
