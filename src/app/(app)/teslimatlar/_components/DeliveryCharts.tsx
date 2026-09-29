"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, ChartFrame, GRID_PROPS, Segmented, TooltipBox } from "@/components/charts/kit";
import { fmtCompactMoney, fmtDate, fmtInt, fmtMoney, fmtMonth } from "@/lib/format";

export interface DeliveryPoint {
  /** YYYY-AA-GG (günlük) veya YYYY-AA (aylık) */
  key: string;
  count: number;
  qty: number;
  sold: number;
  remaining: number;
  costTry: number;
  cancelled: number;
}

type Mode = "qty" | "try";

/**
 * Dönemdeki teslimatlar: adet (bugüne kadar satılan + Mekonsis'te kalan olarak bölünmüş)
 * veya taşınan parti maliyeti (TL). Teslimat satış değildir.
 */
export function DeliveryFlowChart({ data, daily }: { data: DeliveryPoint[]; daily: boolean }) {
  const [mode, setMode] = useState<Mode>("qty");
  const empty = data.every((d) => d.qty === 0 && d.cancelled === 0);
  const label = (k: string) => (daily ? fmtDate(k) : fmtMonth(k));
  const tick = (k: string) => (daily ? `${k.slice(8, 10)}.${k.slice(5, 7)}` : fmtMonth(k));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">
          {mode === "qty"
            ? `Adet · ${daily ? "gün" : "ay"} bazında · bugüne kadar satılan / Mekonsis'te kalan`
            : `TL · parti maliyetiyle (satış değildir)`}
        </p>
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
        label={mode === "qty" ? "Dönemdeki teslimat adetleri, satılan ve kalan olarak" : "Dönemde Mekonsis'e taşınan parti maliyeti (TL)"}
        empty={empty}
        emptyText="Seçilen dönemde teslimat yok."
      >
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%">
          <CartesianGrid {...GRID_PROPS} />
          <XAxis
            dataKey="key"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={tick}
            interval="preserveStartEnd"
            minTickGap={10}
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
              const p = payload[0].payload as DeliveryPoint;
              return (
                <TooltipBox
                  title={label(p.key)}
                  rows={[
                    { label: "Teslimat", value: `${fmtInt(p.count)} teslimat` },
                    { label: "Teslim edilen", value: `${fmtInt(p.qty)} adet` },
                    { label: "Satılan (bugüne kadar)", value: `${fmtInt(p.sold)} adet`, color: mode === "qty" ? CHART.teal : undefined },
                    { label: "Mekonsis'te kalan", value: `${fmtInt(p.remaining)} adet`, color: mode === "qty" ? CHART.blue : undefined },
                    { label: "Taşınan maliyet", value: fmtMoney(p.costTry, "TRY"), color: mode === "try" ? CHART.violet : undefined },
                    ...(p.cancelled ? [{ label: "Geri alınan", value: `${fmtInt(p.cancelled)} adet` }] : []),
                  ]}
                />
              );
            }}
          />
          {mode === "qty" ? (
            <>
              <Bar dataKey="sold" name="Satılan" stackId="q" fill={CHART.teal} maxBarSize={22} isAnimationActive={false} />
              <Bar
                dataKey="remaining"
                name="Mekonsis'te kalan"
                stackId="q"
                fill={CHART.blue}
                radius={[3, 3, 0, 0]}
                maxBarSize={22}
                isAnimationActive={false}
              />
            </>
          ) : (
            <Bar
              dataKey="costTry"
              name="Taşınan maliyet (TL)"
              fill={CHART.violet}
              radius={[3, 3, 0, 0]}
              maxBarSize={22}
              isAnimationActive={false}
            />
          )}
        </BarChart>
      </ChartFrame>
      {!empty ? (
        <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted" aria-label="Grafik açıklaması">
          {(mode === "qty"
            ? [
                ["Satılan (bugüne kadar)", CHART.teal],
                ["Mekonsis'te kalan", CHART.blue],
              ]
            : [["Taşınan maliyet (TL)", CHART.violet]]
          ).map(([l, c]) => (
            <li key={l} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: c }} aria-hidden />
              {l}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
