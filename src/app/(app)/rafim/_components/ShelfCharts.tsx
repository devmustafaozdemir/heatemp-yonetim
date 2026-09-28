"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, ChartFrame, DonutChart, GRID_PROPS, Segmented, TooltipBox } from "@/components/charts/kit";
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
 */
export function ShelfMovementChart({ kind, data }: { kind: ShelfKind; data: MovementPoint[] }) {
  const [mode, setMode] = useState<Mode>("qty");
  const series = seriesFor(kind, data);
  const empty = data.every((d) => d.inQty + d.in2Qty + d.outQty + d.revQty === 0);
  const field = (s: Series) => `${s.key}${mode === "qty" ? "Qty" : "Try"}` as keyof MovementPoint;
  const fmt = (v: number) => (mode === "qty" ? `${fmtInt(v)} adet` : fmtMoney(v, "TRY"));
  const where = kind === "heatemp" ? "Heatemp rafına" : "Mekonsis rafına";
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">{mode === "qty" ? "Adet · ay bazında" : "TL · parti birim maliyetiyle (kayıt değeri)"}</p>
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
      <ChartFrame
        height={250}
        label={`Son 12 ayda ${where} giren ve çıkan mamul (${mode === "qty" ? "adet" : "TL"})`}
        empty={empty}
        emptyText="Son 12 ayda bu rafta hareket yok."
      >
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%" barGap={2}>
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
    </div>
  );
}

/** Halka grafik (TL veya adet biçimli). */
export function ShelfDonut({
  data,
  unit,
  centerLabel,
  label,
}: {
  data: { name: string; value: number; color: keyof typeof CHART; hint?: string }[];
  unit: "try" | "qty";
  centerLabel: string;
  label: string;
}) {
  const fmt = (v: number) => (unit === "try" ? fmtMoney(v, "TRY") : `${fmtInt(v)} adet`);
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <DonutChart
      data={data.map((d) => ({ name: d.name, value: d.value, color: CHART[d.color], hint: d.hint }))}
      centerLabel={centerLabel}
      centerValue={unit === "try" ? fmtCompactMoney(total, "TRY") : fmtInt(total)}
      format={fmt}
      height={190}
      label={label}
    />
  );
}

export interface SellThroughRow {
  key: string;
  label: string;
  sold: number;
  remaining: number;
}

/** Varyant bazında Mekonsis'e teslim edilenlerin satılan / rafta kalan dağılımı (adet). */
export function SellThroughChart({ rows }: { rows: SellThroughRow[] }) {
  const height = Math.max(170, rows.length * 30 + 36);
  return (
    <div>
      <ChartFrame height={height} label="Varyant bazında teslim edilen ürünlerin satılan ve rafta kalan adetleri" empty={rows.length === 0} emptyText="Henüz teslimat yok.">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }} barCategoryGap={7}>
          <CartesianGrid stroke={CHART.grid} horizontal={false} />
          <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={(v: number) => fmtInt(v)} />
          <YAxis
            type="category"
            dataKey="label"
            width={140}
            tick={{ ...AXIS_TICK, fill: "#495057" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: string) => (v.length > 21 ? `${v.slice(0, 20)}…` : v)}
          />
          <Tooltip
            cursor={{ fill: "rgba(64,81,137,0.05)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as SellThroughRow;
              const delivered = p.sold + p.remaining;
              return (
                <TooltipBox
                  title={p.label}
                  rows={[
                    { label: "Teslim edilen", value: `${fmtInt(delivered)} adet` },
                    { label: "Satılan", value: `${fmtInt(p.sold)} adet`, color: CHART.teal },
                    { label: "Rafta kalan", value: `${fmtInt(p.remaining)} adet`, color: CHART.blue },
                    {
                      label: "Satış oranı",
                      value: delivered > 0 ? `%${((p.sold / delivered) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}` : "—",
                    },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="sold" name="Satılan" stackId="a" fill={CHART.teal} maxBarSize={18} isAnimationActive={false} />
          <Bar dataKey="remaining" name="Rafta kalan" stackId="a" fill={CHART.blue} radius={[0, 3, 3, 0]} maxBarSize={18} isAnimationActive={false} />
        </BarChart>
      </ChartFrame>
      {rows.length > 0 ? (
        <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted" aria-label="Grafik açıklaması">
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: CHART.teal }} aria-hidden />
            Satılan
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: CHART.blue }} aria-hidden />
            Rafta kalan
          </li>
        </ul>
      ) : null}
    </div>
  );
}
