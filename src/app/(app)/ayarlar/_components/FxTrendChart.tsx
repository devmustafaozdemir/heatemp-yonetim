"use client";

import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, ChartFrame, GRID_PROPS, TooltipBox } from "@/components/charts/kit";
import { fmtDate, fmtRate } from "@/lib/format";

export interface FxPoint {
  date: string;
  rate: number;
  sourceLabel: string;
}

/** Günlük önerilen USD/TRY kuru (tek seri; eksen sıfırdan başlamaz, değişimi okunur kılmak için). */
export function FxTrendChart({ points, label }: { points: FxPoint[]; label: string }) {
  return (
    <ChartFrame height={220} label={label} empty={points.length === 0} emptyText="Bu aralıkta kayıtlı kur yok.">
      <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => fmtDate(d).slice(0, 5)}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: CHART.grid }}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          domain={["auto", "auto"]}
          tickFormatter={(v: number) => v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={52}
        />
        <Tooltip
          cursor={{ stroke: CHART.axis, strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as FxPoint;
            return (
              <TooltipBox
                title={fmtDate(p.date)}
                rows={[
                  { label: "USD/TRY", value: fmtRate(p.rate), color: CHART.blue },
                  { label: "Kaynak", value: p.sourceLabel },
                ]}
              />
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="rate"
          stroke={CHART.blue}
          strokeWidth={2}
          dot={points.length <= 20 ? { r: 3, fill: CHART.blue, stroke: "#fff", strokeWidth: 1.5 } : false}
          activeDot={{ r: 4.5, strokeWidth: 2, stroke: "#fff" }}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartFrame>
  );
}
