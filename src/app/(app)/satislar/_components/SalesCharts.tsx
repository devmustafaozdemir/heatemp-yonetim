"use client";

import { Table2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, ChartFrame, GRID_PROPS, Segmented, TooltipBox } from "@/components/charts/kit";
import { cx, TableWrap } from "@/components/ui";
import { fmtCompactMoney, fmtDate, fmtInt, fmtMoney, fmtMonth } from "@/lib/format";
import type { Granularity } from "@/lib/period";
import { fmtRatio, marginPct } from "./fmt";

export interface TrendPoint {
  key: string;
  sale_count: number;
  quantity: number;
  revenue_try: number;
  cogs_try: number;
  gross_profit_try: number;
}

const WEEKDAY = new Intl.DateTimeFormat("tr-TR", { weekday: "long", timeZone: "UTC" });
const MONTH_LONG = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric", timeZone: "UTC" });

function bucketTitle(key: string, g: Granularity) {
  if (g === "aylik") return MONTH_LONG.format(new Date(`${key}-01T12:00:00Z`));
  return `${fmtDate(key)} ${WEEKDAY.format(new Date(`${key}T12:00:00Z`))}`;
}

function bucketTick(key: string, g: Granularity) {
  return g === "aylik" ? fmtMonth(key) : fmtDate(key).slice(0, 5);
}

type Mode = "tl" | "adet";

/**
 * Dönem trendi. Ciro ve brüt kâr aynı birimde (TL) olduğundan aynı eksende; satılan adet
 * ayrı görünümde gösterilir (para ve adet tek eksende karıştırılmaz).
 */
export function SalesTrendChart({ points, granularity, periodLabel }: { points: TrendPoint[]; granularity: Granularity; periodLabel: string }) {
  const [mode, setMode] = useState<Mode>("tl");
  const [table, setTable] = useState(false);
  const empty = !points.some((p) => p.sale_count > 0);
  const dense = points.length > 45;
  const unit = granularity === "aylik" ? "aylık" : "günlük";
  const label = mode === "tl" ? `${periodLabel} dönemi ${unit} ciro ve brüt kâr grafiği (TL)` : `${periodLabel} dönemi ${unit} satılan adet grafiği`;

  const tooltip = ({ active, payload }: { active?: boolean; payload?: readonly { payload?: unknown }[] }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as TrendPoint;
    return (
      <TooltipBox
        title={bucketTitle(p.key, granularity)}
        rows={[
          { label: "Ciro", value: fmtMoney(p.revenue_try, "TRY"), color: mode === "tl" ? CHART.blue : undefined },
          { label: "Brüt kâr", value: fmtMoney(p.gross_profit_try, "TRY"), color: mode === "tl" ? CHART.teal : undefined },
          { label: "Marj", value: fmtRatio(marginPct(p.gross_profit_try, p.revenue_try)) },
          { label: "Satılan adet", value: `${fmtInt(p.quantity)} adet`, color: mode === "adet" ? CHART.violet : undefined },
          { label: "Satış sayısı", value: fmtInt(p.sale_count) },
        ]}
      />
    );
  };

  const xAxis = (
    <XAxis
      dataKey="key"
      tickFormatter={(k: string) => bucketTick(k, granularity)}
      tick={AXIS_TICK}
      tickLine={false}
      axisLine={{ stroke: CHART.grid }}
      interval="preserveStartEnd"
      minTickGap={18}
    />
  );
  const yAxis = (
    <YAxis
      tickFormatter={(v: number) => (mode === "tl" ? fmtCompactMoney(v, "TRY") : fmtInt(v))}
      tick={AXIS_TICK}
      tickLine={false}
      axisLine={false}
      width={mode === "tl" ? 64 : 36}
      allowDecimals={false}
    />
  );

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          label="Gösterilecek ölçü"
          options={[
            ["tl", "Ciro ve kâr (TL)"],
            ["adet", "Satılan adet"],
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          {!table && !empty ? (
            <ul className="flex items-center gap-3 text-xs text-ink-soft" aria-label="Seriler">
              {mode === "tl" ? (
                <>
                  <li className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm" style={{ background: CHART.blue }} aria-hidden />
                    Ciro
                  </li>
                  <li className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm" style={{ background: CHART.teal }} aria-hidden />
                    Brüt kâr
                  </li>
                </>
              ) : (
                <li className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm" style={{ background: CHART.violet }} aria-hidden />
                  Satılan adet
                </li>
              )}
            </ul>
          ) : null}
          {!empty ? (
            <button
              type="button"
              onClick={() => setTable((t) => !t)}
              aria-pressed={table}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-ink-muted hover:bg-canvas hover:text-ink"
            >
              <Table2 className="size-3.5" aria-hidden />
              {table ? "Grafiği göster" : "Tablo görünümü"}
            </button>
          ) : null}
        </div>
      </div>
      {table && !empty ? (
        <TableWrap className="max-h-[260px] overflow-y-auto rounded-md border border-line">
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
                    <td className="num">{fmtRatio(marginPct(p.gross_profit_try, p.revenue_try))}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </TableWrap>
      ) : (
        <ChartFrame height={260} label={label} empty={empty} emptyText="Seçilen dönem ve filtrelerde gerçekleşmiş satış yok.">
          {dense ? (
            <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID_PROPS} />
              {xAxis}
              {yAxis}
              <Tooltip cursor={{ stroke: CHART.axis, strokeDasharray: "3 3" }} content={tooltip} />
              {mode === "tl" ? (
                <>
                  <Area
                    type="monotone"
                    dataKey="revenue_try"
                    name="Ciro"
                    stroke={CHART.blue}
                    strokeWidth={2}
                    fill={CHART.blue}
                    fillOpacity={0.1}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="gross_profit_try"
                    name="Brüt kâr"
                    stroke={CHART.teal}
                    strokeWidth={2}
                    fill={CHART.teal}
                    fillOpacity={0.1}
                    isAnimationActive={false}
                  />
                </>
              ) : (
                <Area
                  type="monotone"
                  dataKey="quantity"
                  name="Satılan adet"
                  stroke={CHART.violet}
                  strokeWidth={2}
                  fill={CHART.violet}
                  fillOpacity={0.12}
                  isAnimationActive={false}
                />
              )}
            </AreaChart>
          ) : (
            <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%" barGap={2}>
              <CartesianGrid {...GRID_PROPS} />
              {xAxis}
              {yAxis}
              <Tooltip cursor={{ fill: CHART.brand, fillOpacity: 0.06 }} content={tooltip} />
              {mode === "tl" ? (
                <>
                  <Bar dataKey="revenue_try" name="Ciro" fill={CHART.blue} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                  <Bar dataKey="gross_profit_try" name="Brüt kâr" fill={CHART.teal} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                </>
              ) : (
                <Bar dataKey="quantity" name="Satılan adet" fill={CHART.violet} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              )}
            </BarChart>
          )}
        </ChartFrame>
      )}
    </div>
  );
}

export interface BreakdownRow {
  key: string;
  label: string;
  href: string;
  revenue_try: number;
  gross_profit_try: number;
  quantity: number;
  sale_count: number;
}

type BreakdownMode = "musteri" | "varyant";

/**
 * Müşteri / varyant kırılımı: ciroya göre sıralı yatay çubuklar (tek renk; pay = ciro payı).
 * Satır adı listeyi o müşteri veya varyanta göre filtreler.
 */
export function SalesBreakdown({ customers, variants, total }: { customers: BreakdownRow[]; variants: BreakdownRow[]; total: number }) {
  const [mode, setMode] = useState<BreakdownMode>("musteri");
  const rows = (mode === "musteri" ? customers : variants).slice(0, 7);
  const all = mode === "musteri" ? customers : variants;
  const rest = all.slice(7);
  const restRevenue = rest.reduce((s, r) => s + r.revenue_try, 0);
  const max = Math.max(0, ...rows.map((r) => r.revenue_try));

  return (
    <div className="min-w-0">
      <div className="mb-3">
        <Segmented<BreakdownMode>
          value={mode}
          onChange={setMode}
          label="Kırılım"
          options={[
            ["musteri", `Müşteri (${fmtInt(customers.length)})`],
            ["varyant", `Varyant (${fmtInt(variants.length)})`],
          ]}
        />
      </div>
      {rows.length === 0 ? (
        <ChartFrame height={220} label="Kırılım" empty emptyText="Seçilen dönem ve filtrelerde gerçekleşmiş satış yok.">
          <div />
        </ChartFrame>
      ) : (
        <ul className="space-y-3" aria-label={mode === "musteri" ? "Müşterilere göre ciro" : "Varyantlara göre ciro"}>
          {rows.map((r) => {
            const share = total > 0 ? (r.revenue_try / total) * 100 : 0;
            const margin = marginPct(r.gross_profit_try, r.revenue_try);
            return (
              <li key={r.key} className="min-w-0">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <Link
                    href={r.href}
                    scroll={false}
                    className="min-w-0 truncate font-medium text-ink hover:text-brand-600 hover:underline"
                    title={`${r.label} — listeyi filtrele`}
                  >
                    {r.label}
                  </Link>
                  <span className="shrink-0 font-semibold text-ink tabular-nums">{fmtMoney(r.revenue_try, "TRY")}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-canvas" aria-hidden>
                  <div
                    className="h-full rounded-full bg-chart-blue"
                    style={{ width: `${max > 0 ? Math.max(2, (r.revenue_try / max) * 100) : 0}%` }}
                  />
                </div>
                <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-[11.5px] text-ink-muted tabular-nums">
                  <span>
                    {fmtInt(r.sale_count)} satış · {fmtInt(r.quantity)} adet · marj {fmtRatio(margin)}
                  </span>
                  <span>ciro payı {fmtRatio(share)}</span>
                </div>
              </li>
            );
          })}
          {rest.length > 0 ? (
            <li className="flex justify-between gap-3 border-t border-dashed border-line pt-2 text-xs text-ink-muted tabular-nums">
              <span>
                Diğer {fmtInt(rest.length)} {mode === "musteri" ? "müşteri" : "varyant"}
              </span>
              <span>
                {fmtMoney(restRevenue, "TRY")} · {fmtRatio(total > 0 ? (restRevenue / total) * 100 : 0)}
              </span>
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
