"use client";

import { Table2, TrendingUp } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, ChartFrame, GRID_PROPS, Segmented, TooltipBox } from "@/components/charts/kit";
import { Card, cx, TableWrap } from "@/components/ui";
import { fmtCompactMoney, fmtDate, fmtInt, fmtMoney, fmtMonth, fmtPct } from "@/lib/format";
import type { Granularity } from "@/lib/period";
import type { SalesPoint } from "./data";

type Metric = "revenue" | "profit" | "quantity";

const METRICS: Record<Metric, { key: keyof SalesPoint; label: string; color: string; money: boolean }> = {
  revenue: { key: "revenue_try", label: "Ciro (TL)", color: CHART.blue, money: true },
  profit: { key: "gross_profit_try", label: "Brüt kâr (TL)", color: CHART.teal, money: true },
  quantity: { key: "quantity", label: "Satılan adet", color: CHART.violet, money: false },
};

const WEEKDAY = new Intl.DateTimeFormat("tr-TR", { weekday: "long", timeZone: "UTC" });
const MONTH_LONG = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric", timeZone: "UTC" });

/** GG.AA–GG.AA: aylık kovanın dönem içindeki gerçek günleri */
function rangeText(p: SalesPoint) {
  return `${fmtDate(p.from).slice(0, 5)}–${fmtDate(p.to).slice(0, 5)}`;
}

function bucketTitle(p: SalesPoint, g: Granularity) {
  if (g === "aylik") {
    const month = MONTH_LONG.format(new Date(`${p.key}-01T12:00:00Z`));
    return p.partial ? `${month} (${rangeText(p)}, kısmi ay)` : month;
  }
  return `${fmtDate(p.key)} ${WEEKDAY.format(new Date(`${p.key}T12:00:00Z`))}`;
}

function tick(key: string, g: Granularity) {
  return g === "aylik" ? fmtMonth(key) : fmtDate(key).slice(0, 5);
}

/**
 * Seçilen dönemin satış trendi. Para ve adet farklı birim olduğundan aynı eksende
 * gösterilmez: Ciro (TL) / Brüt kâr (TL) / Satılan adet arasında seçim yapılır.
 * Tooltip tüm değerleri birimleriyle birlikte gösterir.
 */
export function SalesTrendChart({
  points,
  granularity,
  granularityControl,
  footer,
  periodLabel,
}: {
  points: SalesPoint[];
  granularity: Granularity;
  /** Günlük/aylık kırılım bağlantıları (URL) */
  granularityControl: ReactNode;
  /** Dönem toplamları (MetricRow) */
  footer: ReactNode;
  periodLabel: string;
}) {
  const [metric, setMetric] = useState<Metric>("revenue");
  const [showTable, setShowTable] = useState(false);
  const m = METRICS[metric];
  const empty = !points.some((p) => p.sale_count > 0);
  // Seyrek günlük satışta alan grafiği (eğri) tek günlük satışı komşu günlere yayılmış gibi gösterir;
  // bu yüzden ~3 aya kadar (≤ 100 kova) her gün/ay kendi sütunuyla çizilir. Daha uzun günlük aralıkta
  // sütunlar 2 px'in altına indiğinden doğrusal (eğrisiz) alan kullanılır: satış yalnız kendi gününde tepe yapar.
  const useArea = points.length > 100;
  const unitWord = granularity === "aylik" ? "Aylık" : "Günlük";
  const label = `${unitWord} ${m.label.toLocaleLowerCase("tr-TR")} grafiği, ${periodLabel}`;
  const partials = granularity === "aylik" ? points.filter((p) => p.partial) : [];

  const tooltip = ({ active, payload }: { active?: boolean; payload?: readonly { payload?: unknown }[] }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as SalesPoint;
    const margin = p.revenue_try > 0 ? (p.gross_profit_try / p.revenue_try) * 100 : null;
    return (
      <TooltipBox
        title={bucketTitle(p, granularity)}
        rows={[
          { label: "Satış sayısı", value: fmtInt(p.sale_count) },
          { label: "Satılan adet", value: `${fmtInt(p.quantity)} adet`, color: metric === "quantity" ? m.color : undefined },
          { label: "Ciro", value: fmtMoney(p.revenue_try, "TRY"), color: metric === "revenue" ? m.color : undefined },
          { label: "Brüt kâr", value: fmtMoney(p.gross_profit_try, "TRY"), color: metric === "profit" ? m.color : undefined },
          { label: "Marj", value: fmtPct(margin) },
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
  const yAxis = (
    <YAxis
      tickFormatter={(v: number) => (m.money ? fmtCompactMoney(v, "TRY") : fmtInt(v))}
      tick={AXIS_TICK}
      tickLine={false}
      axisLine={false}
      width={m.money ? 68 : 40}
      allowDecimals={m.money}
    />
  );

  return (
    <Card
      title="Satış ve ciro trendi"
      icon={TrendingUp}
      description="Yalnız gerçekleşmiş Mekonsis satışları; teslimatlar satış değildir."
      actions={
        <>
          {granularityControl}
          <Segmented<Metric>
            value={metric}
            onChange={setMetric}
            label="Gösterilecek ölçü"
            options={[
              ["revenue", "Ciro (TL)"],
              ["profit", "Brüt kâr (TL)"],
              ["quantity", "Satılan adet"],
            ]}
          />
        </>
      }
      padded={false}
      className="h-full"
    >
      <div className="px-4 pt-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0 text-xs text-ink-muted">
            <p>
              <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: m.color }} aria-hidden />
              {m.label} · {unitWord.toLocaleLowerCase("tr-TR")} kırılım
            </p>
            {partials.length ? (
              <p className="mt-0.5">
                Kısmi ay (dönem sınırı):{" "}
                {partials.map((p, i) => (
                  <span key={p.key} className="whitespace-nowrap tabular-nums">
                    {i > 0 ? ", " : ""}
                    {fmtMonth(p.key)} {rangeText(p)}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
          {!empty ? (
            <button
              type="button"
              onClick={() => setShowTable((s) => !s)}
              aria-pressed={showTable}
              className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-ink-muted hover:bg-canvas hover:text-ink"
            >
              <Table2 className="size-3.5" aria-hidden />
              {showTable ? "Grafiği göster" : "Tablo görünümü"}
            </button>
          ) : null}
        </div>
        {showTable && !empty ? (
          <TableWrap className="mb-4 max-h-[280px] overflow-y-auto rounded-md border border-line">
            <table className="table-base table-compact">
              <thead className="sticky top-0">
                <tr>
                  <th>{granularity === "aylik" ? "Ay" : "Gün"}</th>
                  <th className="num">Satış</th>
                  <th className="num">Adet</th>
                  <th className="num">Ciro (TL)</th>
                  <th className="num">Brüt kâr (TL)</th>
                </tr>
              </thead>
              <tbody>
                {points
                  .filter((p) => p.sale_count > 0)
                  .map((p) => (
                    <tr key={p.key}>
                      <td className="whitespace-nowrap">
                        {granularity === "aylik" ? fmtMonth(p.key) : fmtDate(p.key)}
                        {p.partial ? <div className="text-xs text-ink-muted tabular-nums">{rangeText(p)} · kısmi</div> : null}
                      </td>
                      <td className="num">{fmtInt(p.sale_count)}</td>
                      <td className="num">{fmtInt(p.quantity)}</td>
                      <td className="num">{fmtMoney(p.revenue_try, "TRY")}</td>
                      <td className={cx("num", p.gross_profit_try < 0 && "text-chart-red")}>{fmtMoney(p.gross_profit_try, "TRY")}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </TableWrap>
        ) : (
          <div className="pb-3">
            <ChartFrame height={280} label={label} empty={empty} emptyText="Seçilen dönemde gerçekleşmiş satış yok.">
              {useArea ? (
                <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid {...GRID_PROPS} />
                  {xAxis}
                  {yAxis}
                  <Tooltip cursor={{ stroke: CHART.axis, strokeDasharray: "3 3" }} content={tooltip} />
                  <Area
                    type="linear"
                    dataKey={m.key}
                    stroke={m.color}
                    strokeWidth={2}
                    fill={m.color}
                    fillOpacity={0.12}
                    activeDot={{ r: 4, strokeWidth: 2, className: "stroke-white" }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              ) : (
                <BarChart
                  data={points}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                  barCategoryGap={points.length > 45 ? "12%" : "22%"}
                >
                  <CartesianGrid {...GRID_PROPS} />
                  {xAxis}
                  {yAxis}
                  <Tooltip cursor={{ fill: CHART.brand, fillOpacity: 0.06 }} content={tooltip} />
                  <Bar dataKey={m.key} fill={m.color} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                </BarChart>
              )}
            </ChartFrame>
          </div>
        )}
      </div>
      <div className="border-t border-line">{footer}</div>
    </Card>
  );
}
