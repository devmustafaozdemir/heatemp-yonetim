"use client";

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, ChartFrame, GRID_PROPS, TooltipBox } from "@/components/charts/kit";
import { fmtCompactMoney, fmtMoney, fmtMonth } from "@/lib/format";

export interface MonthlyFlowPoint {
  month: string; // YYYY-MM
  purchase: number;
  consume: number;
  writeOff: number;
}

const SERIES = [
  { key: "purchase", label: "Alış", color: CHART.blue },
  { key: "consume", label: "Tüketim", color: CHART.amber },
  { key: "writeOff", label: "Fire / sayım", color: CHART.red },
] as const;

/** Tüm malzemeler için aylık hareket değeri (TL, işlem günü değeri). */
export function MonthlyFlowChart({ data }: { data: MonthlyFlowPoint[] }) {
  const empty = data.every((d) => d.purchase === 0 && d.consume === 0 && d.writeOff === 0);
  const hasWriteOff = data.some((d) => d.writeOff !== 0);
  const series = SERIES.filter((s) => s.key !== "writeOff" || hasWriteOff);
  return (
    <div>
      <ChartFrame
        height={250}
        label="Son 12 ayda aylık malzeme alışı, üretim tüketimi ve fire değeri (TL)"
        empty={empty}
        emptyText="Son 12 ayda malzeme hareketi yok."
      >
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%" barGap={2}>
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
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => fmtCompactMoney(v, "TRY")} />
          <Tooltip
            cursor={{ fill: CHART.grid }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as MonthlyFlowPoint;
              return (
                <TooltipBox
                  title={fmtMonth(p.month)}
                  rows={SERIES.map((s) => ({ label: s.label, value: fmtMoney(p[s.key], "TRY"), color: s.color }))}
                />
              );
            }}
          />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              radius={[3, 3, 0, 0]}
              maxBarSize={16}
              isAnimationActive={false}
            />
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
          <span>TL · işlem günü değeri · tüketim: üretime çıkan, iptal iadeleri düşülmüş</span>
        </div>
      ) : null}
    </div>
  );
}
