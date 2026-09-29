"use client";

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, ChartFrame, GRID_PROPS, TooltipBox } from "@/components/charts/kit";
import { fmtCompactMoney, fmtInt, fmtMoney, fmtPct } from "@/lib/format";
import type { CustomerMonthPoint } from "./types";

const MONTH_LONG = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric", timeZone: "UTC" });
const MONTH_SHORT = new Intl.DateTimeFormat("tr-TR", { month: "short", year: "2-digit", timeZone: "UTC" });
const monthTick = (m: string) => MONTH_SHORT.format(new Date(`${m}-01T12:00:00Z`));

/** Müşterinin aylık cirosu ve brüt kârı (ikisi de TL; yalnız gerçekleşmiş satışlar). */
export function CustomerSalesChart({ series }: { series: CustomerMonthPoint[] }) {
  const empty = !series.some((p) => p.sale_count > 0);
  return (
    <div>
      <ul className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: CHART.blue }} aria-hidden />
          Ciro (TL)
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: CHART.teal }} aria-hidden />
          Brüt kâr (TL)
        </li>
      </ul>
      <ChartFrame
        height={240}
        label="Müşterinin aylık ciro ve brüt kâr grafiği (TL), gerçekleşmiş satışlar"
        empty={empty}
        emptyText="Bu müşteriye henüz gerçekleşmiş satış yok."
      >
        <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%" barGap={2}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis
            dataKey="month"
            tickFormatter={monthTick}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: CHART.grid }}
            interval={series.length <= 6 ? 0 : "preserveStartEnd"}
            minTickGap={4}
          />
          <YAxis tickFormatter={(v: number) => fmtCompactMoney(v, "TRY")} tick={AXIS_TICK} tickLine={false} axisLine={false} width={64} />
          <Tooltip
            cursor={{ fill: "rgba(64,81,137,0.05)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as CustomerMonthPoint;
              return (
                <TooltipBox
                  title={MONTH_LONG.format(new Date(`${p.month}-01T12:00:00Z`))}
                  rows={[
                    { label: "Ciro", value: fmtMoney(p.revenue_try, "TRY"), color: CHART.blue },
                    { label: "Brüt kâr", value: fmtMoney(p.gross_profit_try, "TRY"), color: CHART.teal },
                    { label: "Marj", value: p.revenue_try > 0 ? fmtPct((p.gross_profit_try / p.revenue_try) * 100) : "—" },
                    { label: "Satış", value: `${fmtInt(p.sale_count)} satış · ${fmtInt(p.quantity)} adet` },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="revenue_try" fill={CHART.blue} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          <Bar dataKey="gross_profit_try" fill={CHART.teal} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        </BarChart>
      </ChartFrame>
    </div>
  );
}
