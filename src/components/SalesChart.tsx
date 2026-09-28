"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cx } from "@/components/ui";
import { fmtDate, fmtInt, fmtMoney, fmtMonth } from "@/lib/format";

export interface SalesPoint {
  key: string; // YYYY-MM-DD (gün) veya YYYY-MM (ay)
  quantity: number;
  revenue_try: number;
  gross_profit_try: number;
}

type Period = "daily" | "monthly";
type Metric = "revenue" | "quantity";

const SERIES = "#2a78d6";
const GRID = "#e7e7e3";
const AXIS_TEXT = "#6b6a66";

function compactTry(n: number) {
  if (Math.abs(n) >= 1_000_000) return `₺${(n / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} mn`;
  if (Math.abs(n) >= 1_000) return `₺${(n / 1_000).toLocaleString("tr-TR", { maximumFractionDigits: 0 })} bin`;
  return `₺${n.toLocaleString("tr-TR")}`;
}

/**
 * Günlük / aylık satış grafiği. Tek seri, tek eksen: ciro (TL) veya adet
 * seçilir; iki farklı ölçü aynı grafikte çift eksenle gösterilmez.
 */
export function SalesChart({ daily, monthly }: { daily: SalesPoint[]; monthly: SalesPoint[] }) {
  const [period, setPeriod] = useState<Period>("daily");
  const [metric, setMetric] = useState<Metric>("revenue");
  const [showTable, setShowTable] = useState(false);
  const data = period === "daily" ? daily : monthly;
  const dataKey = metric === "revenue" ? "revenue_try" : "quantity";
  const hasData = useMemo(() => data.some((d) => d.quantity > 0), [data]);
  const label = (k: string) => (period === "daily" ? fmtDate(k).slice(0, 5) : fmtMonth(k));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          value={period}
          onChange={(v) => setPeriod(v as Period)}
          options={[
            ["daily", "Son 30 gün"],
            ["monthly", "Son 12 ay"],
          ]}
        />
        <Segmented
          value={metric}
          onChange={(v) => setMetric(v as Metric)}
          options={[
            ["revenue", "Ciro (TL)"],
            ["quantity", "Satılan adet"],
          ]}
        />
        <button type="button" className="ml-auto text-xs text-slate-500 hover:text-slate-800" onClick={() => setShowTable((s) => !s)}>
          {showTable ? "Grafiği göster" : "Tablo görünümü"}
        </button>
      </div>

      {!hasData ? (
        <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-slate-200 text-sm text-slate-500">
          Bu dönemde satış yok.
        </div>
      ) : showTable ? (
        <div className="max-h-72 overflow-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>{period === "daily" ? "Gün" : "Ay"}</th>
                <th className="num">Adet</th>
                <th className="num">Ciro (TL)</th>
                <th className="num">Brüt kâr (TL)</th>
              </tr>
            </thead>
            <tbody>
              {data
                .filter((d) => d.quantity > 0)
                .map((d) => (
                  <tr key={d.key}>
                    <td>{period === "daily" ? fmtDate(d.key) : fmtMonth(d.key)}</td>
                    <td className="num">{fmtInt(d.quantity)}</td>
                    <td className="num">{fmtMoney(d.revenue_try, "TRY")}</td>
                    <td className="num">{fmtMoney(d.gross_profit_try, "TRY")}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-64" role="img" aria-label={`${period === "daily" ? "Günlük" : "Aylık"} ${metric === "revenue" ? "ciro" : "satış adedi"} grafiği`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis
                dataKey="key"
                tickFormatter={label}
                tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: GRID }}
                interval="preserveStartEnd"
                minTickGap={16}
              />
              <YAxis
                tickFormatter={(v: number) => (metric === "revenue" ? compactTry(v) : fmtInt(v))}
                tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={72}
                allowDecimals={metric === "revenue"}
              />
              <Tooltip
                cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as SalesPoint;
                  return (
                    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
                      <div className="mb-1 font-medium text-slate-800">{period === "daily" ? fmtDate(p.key) : fmtMonth(p.key)}</div>
                      <div className="text-slate-600">
                        Adet: <span className="tabular-nums text-slate-900">{fmtInt(p.quantity)}</span>
                      </div>
                      <div className="text-slate-600">
                        Ciro: <span className="tabular-nums text-slate-900">{fmtMoney(p.revenue_try, "TRY")}</span>
                      </div>
                      <div className="text-slate-600">
                        Brüt kâr: <span className="tabular-nums text-slate-900">{fmtMoney(p.gross_profit_try, "TRY")}</span>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey={dataKey} fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="inline-flex rounded-md bg-slate-100 p-0.5">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={cx(
            "rounded px-2.5 py-1 text-xs font-medium",
            value === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
