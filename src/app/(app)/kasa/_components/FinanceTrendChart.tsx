"use client";

import { LineChart as LineChartIcon, Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, ChartFrame, GRID_PROPS, Segmented, TooltipBox } from "@/components/charts/kit";
import { Card, cx, TableWrap } from "@/components/ui";
import { fmtCompactMoney, fmtDate, fmtInt, fmtMoney, fmtMonth } from "@/lib/format";
import type { Granularity } from "@/lib/period";
import type { FinancePoint } from "./data";
import { pct1 } from "./fmt";

type Mode = "tl" | "adet";

const WEEKDAY = new Intl.DateTimeFormat("tr-TR", {
  weekday: "long",
  timeZone: "UTC",
});
const MONTH_LONG = new Intl.DateTimeFormat("tr-TR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function bucketTitle(key: string, g: Granularity) {
  if (g === "aylik") return MONTH_LONG.format(new Date(`${key}-01T12:00:00Z`));
  return `${fmtDate(key)} ${WEEKDAY.format(new Date(`${key}T12:00:00Z`))}`;
}

function tick(key: string, g: Granularity) {
  return g === "aylik" ? fmtMonth(key) : fmtDate(key).slice(0, 5);
}

function LegendItem({ color, label, line = false }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
      <span className={line ? "h-0.5 w-3.5 rounded-full" : "size-2.5 rounded-sm"} style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}

/**
 * Döneme göre ciro ve brüt kâr (aynı TL ekseni: ciro sütun/alan, brüt kâr çizgi) veya
 * satılan adet (ayrı görünüm; para ve adet aynı eksende gösterilmez). Yalnız gerçekleşen satışlar.
 */
export function FinanceTrendChart({
  points,
  granularity,
  granularityControl,
  periodLabel,
}: {
  points: FinancePoint[];
  granularity: Granularity;
  granularityControl: ReactNode;
  periodLabel: string;
}) {
  const [mode, setMode] = useState<Mode>("tl");
  const [showTable, setShowTable] = useState(false);
  const empty = !points.some((p) => p.sale_count > 0);
  const dense = points.length > 45;
  const unitWord = granularity === "aylik" ? "aylık" : "günlük";
  const label =
    mode === "tl"
      ? `${periodLabel} için ${unitWord} ciro ve brüt kâr grafiği (TL)`
      : `${periodLabel} için ${unitWord} satılan adet grafiği`;

  const tooltip = ({ active, payload }: { active?: boolean; payload?: readonly { payload?: unknown }[] }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as FinancePoint;
    const margin = p.revenue_try > 0 ? (p.gross_profit_try / p.revenue_try) * 100 : null;
    return (
      <TooltipBox
        title={bucketTitle(p.key, granularity)}
        rows={[
          {
            label: "Ciro",
            value: fmtMoney(p.revenue_try, "TRY"),
            color: mode === "tl" ? CHART.blue : undefined,
          },
          {
            label: "Brüt kâr",
            value: fmtMoney(p.gross_profit_try, "TRY"),
            color: mode === "tl" ? CHART.teal : undefined,
          },
          { label: "Marj", value: pct1(margin) },
          { label: "Satış sayısı", value: fmtInt(p.sale_count) },
          {
            label: "Satılan adet",
            value: `${fmtInt(p.quantity)} adet`,
            color: mode === "adet" ? CHART.violet : undefined,
          },
        ]}
      />
    );
  };

  const xAxis = (
    <XAxis
      dataKey="key"
      tickFormatter={(k: string) => tick(k, granularity)}
      tick={AXIS_TICK}
      tickLine={false}
      axisLine={{ stroke: CHART.grid }}
      interval="preserveStartEnd"
      minTickGap={18}
    />
  );

  return (
    <Card
      title="Ciro ve brüt kâr"
      icon={LineChartIcon}
      description="Gerçekleşen satışlar. Teslimatlar ciro oluşturmaz."
      actions={
        <>
          {granularityControl}
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            label="Gösterilecek ölçü"
            options={[
              ["tl", "Ciro ve kâr (TL)"],
              ["adet", "Satılan adet"],
            ]}
          />
        </>
      }
      className="h-full"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {mode === "tl" ? (
            <>
              <LegendItem color={CHART.blue} label="Ciro (TL)" />
              <LegendItem color={CHART.teal} label="Brüt kâr (TL)" line />
            </>
          ) : (
            <LegendItem color={CHART.violet} label="Satılan adet" />
          )}
          <span className="text-xs text-ink-muted">· {unitWord} kırılım</span>
        </div>
        {!empty ? (
          <button
            type="button"
            onClick={() => setShowTable((s) => !s)}
            // Etiket duruma göre değişir ("Tablo görünümü" / "Grafiği göster"); aria-pressed ile birlikte çelişkili okunurdu.
            aria-controls="kasa-trend-body"
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-ink-muted hover:bg-canvas hover:text-ink"
          >
            {showTable ? <LineChartIcon className="size-3.5" aria-hidden /> : <Table2 className="size-3.5" aria-hidden />}
            {showTable ? "Grafiği göster" : "Tablo görünümü"}
          </button>
        ) : null}
      </div>

      <div id="kasa-trend-body">
        {showTable && !empty ? (
          <TableWrap className="max-h-[300px] overflow-y-auto rounded-md border border-line">
            <table className="table-base table-compact">
              <thead className="sticky top-0">
                <tr>
                  <th>{granularity === "aylik" ? "Ay" : "Gün"}</th>
                  <th className="num">Satış</th>
                  <th className="num">Adet</th>
                  <th className="num">Ciro (TL)</th>
                  <th className="num">Brüt kâr (TL)</th>
                  <th className="num">Marj</th>
                </tr>
              </thead>
              <tbody>
                {points
                  .filter((p) => p.sale_count > 0)
                  .map((p) => (
                    <tr key={p.key}>
                      <td className="whitespace-nowrap">{granularity === "aylik" ? fmtMonth(p.key) : fmtDate(p.key)}</td>
                      <td className="num">{fmtInt(p.sale_count)}</td>
                      <td className="num">{fmtInt(p.quantity)}</td>
                      <td className="num">{fmtMoney(p.revenue_try, "TRY")}</td>
                      <td className={cx("num", p.gross_profit_try < 0 && "text-chart-red")}>{fmtMoney(p.gross_profit_try, "TRY")}</td>
                      <td className="num">{pct1(p.revenue_try > 0 ? (p.gross_profit_try / p.revenue_try) * 100 : null)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </TableWrap>
        ) : (
          <ChartFrame height={300} label={label} empty={empty} emptyText="Seçilen dönemde gerçekleşmiş satış yok.">
            {mode === "tl" ? (
              <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
                <CartesianGrid {...GRID_PROPS} />
                {xAxis}
                <YAxis
                  tickFormatter={(v: number) => fmtCompactMoney(v, "TRY")}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={68}
                />
                <Tooltip
                  cursor={dense ? { stroke: CHART.axis, strokeDasharray: "3 3" } : { fill: "rgba(64,81,137,0.06)" }}
                  content={tooltip}
                />
                {dense ? (
                  <Area
                    type="monotone"
                    dataKey="revenue_try"
                    name="Ciro"
                    stroke={CHART.blue}
                    strokeWidth={2}
                    fill={CHART.blue}
                    fillOpacity={0.12}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
                    isAnimationActive={false}
                  />
                ) : (
                  <Bar
                    dataKey="revenue_try"
                    name="Ciro"
                    fill={CHART.blue}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={30}
                    isAnimationActive={false}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="gross_profit_try"
                  name="Brüt kâr"
                  stroke={CHART.teal}
                  strokeWidth={2}
                  dot={
                    points.length <= 16
                      ? {
                          r: 3,
                          fill: CHART.teal,
                          stroke: "#fff",
                          strokeWidth: 1.5,
                        }
                      : false
                  }
                  activeDot={{ r: 4.5, strokeWidth: 2, stroke: "#fff" }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            ) : (
              <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
                <CartesianGrid {...GRID_PROPS} />
                {xAxis}
                <YAxis
                  tickFormatter={(v: number) => fmtInt(v)}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  allowDecimals={false}
                />
                <Tooltip cursor={{ fill: "rgba(64,81,137,0.06)" }} content={tooltip} />
                <Bar
                  dataKey="quantity"
                  name="Satılan adet"
                  fill={CHART.violet}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={30}
                  isAnimationActive={false}
                />
              </BarChart>
            )}
          </ChartFrame>
        )}
      </div>
    </Card>
  );
}
