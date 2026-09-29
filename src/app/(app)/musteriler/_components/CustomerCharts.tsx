"use client";

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, ChartFrame, GRID_PROPS, TooltipBox } from "@/components/charts/kit";
import { fmtCompactMoney, fmtInt, fmtMoney, fmtPct } from "@/lib/format";
import type { OverviewPoint } from "./types";

const MONTH_LONG = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric", timeZone: "UTC" });
const MONTH_SHORT = new Intl.DateTimeFormat("tr-TR", { month: "short", year: "2-digit", timeZone: "UTC" });
const monthTick = (m: string) => MONTH_SHORT.format(new Date(`${m}-01T12:00:00Z`));
const monthTitle = (m: string) => MONTH_LONG.format(new Date(`${m}-01T12:00:00Z`));

function Legend({ items }: { items: { label: string; color: string; opacity?: number }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: it.color, opacity: it.opacity ?? 1 }} aria-hidden />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Aylık ciro (TL): kurumsal müşterili satışlar ve müşterisiz satışlar üst üste.
 * Yalnız gerçekleşmiş satışlar; teslimatlar satış değildir.
 */
export function CorporateRevenueChart({ series }: { series: OverviewPoint[] }) {
  const empty = !series.some((p) => p.customer_revenue_try > 0 || p.other_revenue_try > 0);
  return (
    <div>
      <Legend
        items={[
          { label: "Kurumsal müşterili satış", color: CHART.blue },
          { label: "Müşterisiz satış", color: CHART.slate, opacity: 0.35 },
        ]}
      />
      <ChartFrame
        height={260}
        label="Aylık ciro grafiği (TL): kurumsal müşterili ve müşterisiz gerçekleşmiş satışlar"
        empty={empty}
        emptyText="Henüz gerçekleşmiş satış yok."
      >
        <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="24%">
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
              const p = payload[0].payload as OverviewPoint;
              const total = p.customer_revenue_try + p.other_revenue_try;
              return (
                <TooltipBox
                  title={monthTitle(p.month)}
                  rows={[
                    { label: "Kurumsal ciro", value: fmtMoney(p.customer_revenue_try, "TRY"), color: CHART.blue },
                    { label: "Müşterisiz ciro", value: fmtMoney(p.other_revenue_try, "TRY"), color: "rgba(135,138,153,0.45)" },
                    { label: "Toplam ciro", value: fmtMoney(total, "TRY") },
                    { label: "Kurumsal pay", value: total > 0 ? fmtPct((p.customer_revenue_try / total) * 100) : "—" },
                    { label: "Kurumsal brüt kâr", value: fmtMoney(p.customer_profit_try, "TRY") },
                    { label: "Satış (kurumsal / diğer)", value: `${fmtInt(p.customer_sale_count)} / ${fmtInt(p.other_sale_count)}` },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="customer_revenue_try" stackId="ciro" fill={CHART.blue} maxBarSize={34} isAnimationActive={false} />
          <Bar dataKey="other_revenue_try" stackId="ciro" fill={CHART.slate} fillOpacity={0.35} radius={[4, 4, 0, 0]} maxBarSize={34} isAnimationActive={false} />
        </BarChart>
      </ChartFrame>
    </div>
  );
}
