"use client";

import { useSyncExternalStore } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, ChartFrame, TooltipBox } from "@/components/charts/kit";
import { fmtCompactMoney, fmtInt, fmtMoney, fmtPct } from "@/lib/format";

export interface QuoteLinePoint {
  key: string;
  label: string;
  quantity: number;
  revenue_try: number | null;
  cost_try: number;
  profit_try: number | null;
}

const WIDE = "(min-width: 640px)";
function subscribe(cb: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
/** Dar ekranda etiket sütunu daraltılır; çubuklara yer kalır. */
function useWide() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(WIDE).matches, () => true);
}

/** Varyant adı tek satırda; uzunsa kısaltılır, tam ad <title> ile okunur. */
function makeTick(max: number) {
  return function LineTick(props: { x?: number | string; y?: number | string; payload?: { value?: unknown } }) {
    const full = String(props.payload?.value ?? "");
    const short = full.length > max ? `${full.slice(0, max - 1)}…` : full;
    return (
      <text x={props.x} y={props.y} dy={4} textAnchor="end" fill={AXIS_TICK.fill} fontSize={AXIS_TICK.fontSize}>
        <title>{full}</title>
        {short}
      </text>
    );
  };
}
const TICK_WIDE = makeTick(26);
const TICK_NARROW = makeTick(15);

/** Kalem bazında ciro ve maliyet (TL). Aradaki fark brüt kârdır. */
export function QuoteLinesChart({ lines, actual }: { lines: QuoteLinePoint[]; actual: boolean }) {
  const data = lines.filter((l) => l.revenue_try !== null);
  const height = Math.max(150, data.length * 52 + 30);
  const word = actual ? "Gerçekleşen" : "Tahmini";
  const wide = useWide();
  return (
    <div>
      <ul className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: CHART.blue }} aria-hidden />
          {word} ciro (TL)
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: CHART.amber }} aria-hidden />
          {word} maliyet (TL, FIFO)
        </li>
      </ul>
      <ChartFrame
        height={height}
        label={`Kalem bazında ${word.toLocaleLowerCase("tr-TR")} ciro ve maliyet (TL)`}
        empty={data.length === 0}
        emptyText={lines.length ? "Güncel kur olmadığından TL ciro hesaplanamadı." : "Teklifte kalem yok."}
      >
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap={10} barGap={2}>
          <CartesianGrid stroke={CHART.grid} horizontal={false} />
          <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtCompactMoney(v, "TRY")} />
          <YAxis type="category" dataKey="label" width={wide ? 170 : 104} tick={wide ? TICK_WIDE : TICK_NARROW} tickLine={false} axisLine={false} interval={0} />
          <Tooltip
            cursor={{ fill: "rgba(64,81,137,0.05)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as QuoteLinePoint;
              return (
                <TooltipBox
                  title={p.label}
                  rows={[
                    { label: "Adet", value: `${fmtInt(p.quantity)} adet` },
                    { label: `${word} ciro`, value: fmtMoney(p.revenue_try, "TRY"), color: CHART.blue },
                    { label: `${word} maliyet`, value: fmtMoney(p.cost_try, "TRY"), color: CHART.amber },
                    { label: `${word} brüt kâr`, value: fmtMoney(p.profit_try, "TRY") },
                    { label: "Marj", value: p.revenue_try && p.profit_try !== null ? fmtPct((p.profit_try / p.revenue_try) * 100) : "—" },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="revenue_try" fill={CHART.blue} radius={[0, 3, 3, 0]} maxBarSize={16} isAnimationActive={false} />
          <Bar dataKey="cost_try" fill={CHART.amber} radius={[0, 3, 3, 0]} maxBarSize={16} isAnimationActive={false} />
        </BarChart>
      </ChartFrame>
    </div>
  );
}
