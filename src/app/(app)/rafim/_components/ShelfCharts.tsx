"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, ChartFrame, GRID_PROPS, Segmented, TooltipBox } from "@/components/charts/kit";
import { fmtCompactMoney, fmtInt, fmtMoney, fmtMonth } from "@/lib/format";
import type { MovementPoint, ShelfKind } from "./types";

type Mode = "qty" | "try";

interface Series {
  key: "in" | "in2" | "out" | "rev";
  label: string;
  color: string;
  stack?: string;
}

function seriesFor(kind: ShelfKind, data: MovementPoint[]): Series[] {
  const has = (k: "in2" | "rev") => data.some((d) => d[`${k}Qty`] > 0);
  const list: (Series & { show: boolean })[] =
    kind === "heatemp"
      ? [
          { key: "in", label: "Üretim girişi", color: CHART.teal, stack: "in", show: true },
          { key: "in2", label: "Açılış stoğu girişi", color: CHART.violet, stack: "in", show: has("in2") },
          { key: "out", label: "Mekonsis'e teslimat", color: CHART.blue, show: true },
          { key: "rev", label: "Geri alınan teslimat (dönüş)", color: CHART.amber, show: has("rev") },
        ]
      : [
          { key: "in", label: "Teslimat girişi", color: CHART.blue, stack: "in", show: true },
          { key: "in2", label: "Satış iptali (rafa dönüş)", color: CHART.amber, stack: "in", show: has("in2") },
          { key: "out", label: "Satış çıkışı", color: CHART.teal, show: true },
          { key: "rev", label: "Geri alınan teslimat", color: CHART.slate, show: has("rev") },
        ];
  return list.filter((s) => s.show);
}

/**
 * Son 12 ayda rafa giren ve raftan çıkan mamul (adet veya parti maliyeti TL).
 * Para ve adet aynı eksende gösterilmez; segmentle seçilir.
 * Heatemp rafında açılış stoğu tek seferlik büyük bir giriştir ve ölçeği ezdiği için
 * varsayılan olarak gizlidir; kutucukla gösterilir (eksen görünen serilere göre hesaplanır).
 */
export function ShelfMovementChart({ kind, data }: { kind: ShelfKind; data: MovementPoint[] }) {
  const [mode, setMode] = useState<Mode>("qty");
  const [showOpening, setShowOpening] = useState(false);
  const all = seriesFor(kind, data);
  // Yalnız açılış girişi varsa gizlemenin anlamı yok; kutucuk gösterilmez.
  const onlyOpening = data.every((d) => d.inQty + d.outQty + d.revQty === 0);
  const hasOpening = kind === "heatemp" && all.some((s) => s.key === "in2") && !onlyOpening;
  const hideOpening = hasOpening && !showOpening;
  const series = hideOpening ? all.filter((s) => s.key !== "in2") : all;
  const empty = data.every((d) => d.inQty + d.in2Qty + d.outQty + d.revQty === 0);
  const field = (s: Series) => `${s.key}${mode === "qty" ? "Qty" : "Try"}` as keyof MovementPoint;
  const fmt = (v: number) => (mode === "qty" ? `${fmtInt(v)} adet` : fmtMoney(v, "TRY"));
  const where = kind === "heatemp" ? "Heatemp rafına" : "Mekonsis rafına";
  const openingTotal = data.reduce((s, d) => s + (mode === "qty" ? d.in2Qty : d.in2Try), 0);
  const openingMonths = data.filter((d) => d.in2Qty > 0).map((d) => fmtMonth(d.month));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">{mode === "qty" ? "Adet · ay bazında" : "TL · parti birim maliyetiyle (kayıt değeri)"}</p>
        <div className="flex flex-wrap items-center gap-3">
          {hasOpening ? (
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-ink-soft">
              <input
                type="checkbox"
                className="size-3.5 accent-brand-600"
                checked={showOpening}
                onChange={(e) => setShowOpening(e.target.checked)}
              />
              Açılış stoğunu göster
            </label>
          ) : null}
          <Segmented<Mode>
            label="Gösterim"
            value={mode}
            onChange={setMode}
            options={[
              ["qty", "Adet"],
              ["try", "Maliyet (TL)"],
            ]}
          />
        </div>
      </div>
      <ChartFrame
        height={250}
        label={`Son 12 ayda ${where} giren ve çıkan mamul (${mode === "qty" ? "adet" : "TL"})`}
        empty={empty}
        emptyText="Son 12 ayda bu rafta hareket yok."
      >
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%" barGap={2}>
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
              const p = payload[0].payload as MovementPoint;
              return (
                <TooltipBox
                  title={fmtMonth(p.month)}
                  rows={series.map((s) => ({ label: s.label, value: fmt(Number(p[field(s)])), color: s.color }))}
                />
              );
            }}
          />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={field(s)}
              name={s.label}
              fill={s.color}
              stackId={s.stack}
              radius={s.stack ? undefined : [3, 3, 0, 0]}
              maxBarSize={18}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ChartFrame>
      {!empty ? (
        <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted" aria-label="Grafik açıklaması">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
      {hideOpening ? (
        <p className="mt-1.5 text-xs text-ink-muted">
          Açılış stoğu girişi ({fmt(openingTotal)} · {openingMonths.join(", ")}) tek seferlik olduğu için grafikte gizli; üretim sayılmaz.
        </p>
      ) : null}
    </div>
  );
}
