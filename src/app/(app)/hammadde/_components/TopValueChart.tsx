"use client";

import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis, type YAxisTickContentProps } from "recharts";
import { AXIS_TICK, CHART, ChartFrame, TooltipBox } from "@/components/charts/kit";
import { fmtCompactMoney, fmtMoney } from "@/lib/format";

export interface TopValueRow {
  key: string;
  name: string;
  code: string;
  value: number;
  valueUsd: number;
  qty: string;
  kind: "raw" | "component";
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** En değerli malzemeler (stok değeri, TL). Eksen etiketinde ad + kod birlikte gösterilir. */
export function TopValueChart({ data, total }: { data: TopValueRow[]; total: number }) {
  const byKey = new Map(data.map((d) => [d.key, d]));
  const height = Math.max(170, data.length * 40 + 28);
  return (
    <div>
      <ChartFrame
        height={height}
        label="Stok değerine göre en değerli malzemeler (TL)"
        empty={data.length === 0}
        emptyText="Stokta değeri olan malzeme yok."
      >
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap={10}>
          <CartesianGrid stroke={CHART.grid} horizontal={false} />
          <XAxis
            type="number"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => fmtCompactMoney(v, "TRY")}
          />
          <YAxis
            type="category"
            dataKey="key"
            width={128}
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={({ x, y, payload }: YAxisTickContentProps) => {
              const row = byKey.get(String(payload.value));
              return (
                <g transform={`translate(${x},${y})`}>
                  <text x={-8} y={-2} textAnchor="end" fontSize={11.5} fontWeight={500} className="fill-ink-soft">
                    {truncate(row?.name ?? "", 18)}
                  </text>
                  <text x={-8} y={11} textAnchor="end" fontSize={10} className="fill-ink-muted font-mono">
                    {truncate(row?.code ?? "", 18)}
                  </text>
                </g>
              );
            }}
          />
          <Tooltip
            cursor={{ fill: CHART.grid }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as TopValueRow;
              return (
                <TooltipBox
                  title={`${p.name} (${p.code})`}
                  rows={[
                    {
                      label: "Stok değeri",
                      value: fmtMoney(p.value, "TRY"),
                      color: p.kind === "component" ? CHART.teal : CHART.blue,
                    },
                    {
                      label: "USD karşılığı",
                      value: fmtMoney(p.valueUsd, "USD"),
                    },
                    { label: "Miktar", value: p.qty },
                    {
                      label: "Toplam içindeki pay",
                      value: total > 0 ? `%${((p.value / total) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}` : "—",
                    },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.key} fill={d.kind === "component" ? CHART.teal : CHART.blue} />
            ))}
          </Bar>
        </BarChart>
      </ChartFrame>
      {data.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-chart-blue" aria-hidden />
            Hammadde
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-chart-teal" aria-hidden />
            Komponent
          </span>
          <span>TL · alış kurlarıyla tarihsel değer</span>
        </div>
      ) : null}
    </div>
  );
}
