"use client";

import { LineChart as LineIcon } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, ChartFrame, GRID_PROPS, Segmented, TooltipBox } from "@/components/charts/kit";
import { Card, MetricRow } from "@/components/ui";
import { CostChange } from "@/components/status";
import { fmtDate, fmtInt, fmtUnitMoney, type Currency } from "@/lib/format";

export interface CostBatch {
  id: string;
  batch_no: string;
  product_id: string;
  product_name: string;
  variant_id: string;
  variant_name: string;
  completed_at: string;
  quantity: number;
  unit_cost_usd: number;
  unit_cost_try: number;
  unit_cost_usd_change_pct: number | null;
  unit_cost_try_change_pct: number | null;
}

const DAY = 86_400_000;
const SHORT_DATE = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Europe/Istanbul" });

/**
 * Tamamlanmış ÜRETİM partilerinin (açılış stoğu hariç) birim maliyeti, zamana göre.
 * USD ve TL ayrı seçilir; iki para birimi aynı eksende gösterilmez.
 */
export function BatchCostChart({ batches }: { batches: CostBatch[] }) {
  const selectId = useId();
  const variants = useMemo(() => {
    const map = new Map<string, { id: string; product: string; variant: string; count: number; last: string }>();
    for (const b of batches) {
      const v = map.get(b.variant_id) ?? { id: b.variant_id, product: b.product_name, variant: b.variant_name, count: 0, last: "" };
      v.count += 1;
      if (b.completed_at > v.last) v.last = b.completed_at;
      map.set(b.variant_id, v);
    }
    return [...map.values()];
  }, [batches]);
  const groups = useMemo(() => {
    const g = new Map<string, typeof variants>();
    for (const v of [...variants].sort((a, b) => a.product.localeCompare(b.product, "tr") || a.variant.localeCompare(b.variant, "tr"))) {
      g.set(v.product, [...(g.get(v.product) ?? []), v]);
    }
    return [...g.entries()];
  }, [variants]);
  const defaultId = useMemo(() => [...variants].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))[0]?.id ?? "", [variants]);
  const [variantId, setVariantId] = useState(defaultId);
  const [currency, setCurrency] = useState<Currency>("USD");
  const selected = variants.find((v) => v.id === variantId) ?? variants.find((v) => v.id === defaultId);

  const data = useMemo(
    () =>
      batches
        .filter((b) => b.variant_id === selected?.id)
        .sort((a, b) => a.completed_at.localeCompare(b.completed_at) || a.batch_no.localeCompare(b.batch_no))
        .map((b) => ({ ...b, t: Date.parse(b.completed_at), cost: Number(currency === "USD" ? b.unit_cost_usd : b.unit_cost_try) })),
    [batches, selected?.id, currency],
  );
  const last = data[data.length - 1];
  const costs = data.map((d) => d.cost);
  const min = costs.length ? Math.min(...costs) : null;
  const max = costs.length ? Math.max(...costs) : null;
  const tMin = data.length ? data[0].t : 0;
  const tMax = data.length ? data[data.length - 1].t : 0;
  const pad = tMax - tMin < 6 * DAY ? 3 * DAY : (tMax - tMin) * 0.04;
  const lastPct = last ? (currency === "USD" ? last.unit_cost_usd_change_pct : last.unit_cost_try_change_pct) : null;

  return (
    <Card
      title="Parti birim maliyeti"
      icon={LineIcon}
      description="Tamamlanmış üretim partileri; açılış stoğu partileri dahil değildir."
      actions={
        batches.length ? (
          <Segmented<Currency>
            value={currency}
            onChange={setCurrency}
            label="Para birimi"
            options={[
              ["USD", "USD"],
              ["TRY", "TL"],
            ]}
          />
        ) : undefined
      }
      padded={false}
      className="h-full"
    >
      <div className="px-4 pt-4 pb-3">
        {batches.length ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label htmlFor={selectId} className="text-xs text-ink-muted">
              Ürün / varyant
            </label>
            <select
              id={selectId}
              value={selected?.id ?? ""}
              onChange={(e) => setVariantId(e.target.value)}
              className="input input-sm w-auto max-w-full min-w-0 flex-1 sm:max-w-[26rem]"
            >
              {groups.map(([product, vs]) => (
                <optgroup key={product} label={product}>
                  {vs.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.product} · {v.variant} ({v.count} parti)
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        ) : null}
        <ChartFrame
          height={240}
          label={`${selected ? `${selected.product} ${selected.variant}` : ""} parti birim maliyeti (${currency === "USD" ? "USD" : "TL"}), zamana göre`}
          empty={data.length === 0}
          emptyText="Henüz tamamlanmış üretim partisi yok. Açılış stoğu partileri bu grafiğe dahil edilmez."
        >
          <LineChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis
              type="number"
              dataKey="t"
              scale="time"
              domain={[tMin - pad, tMax + pad]}
              tickFormatter={(t: number) => SHORT_DATE.format(new Date(t))}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: CHART.grid }}
              minTickGap={24}
              tickCount={6}
            />
            <YAxis
              dataKey="cost"
              tickFormatter={(v: number) => fmtUnitMoney(v, currency)}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={72}
              domain={[(dataMin: number) => Math.max(0, dataMin * 0.9), (dataMax: number) => dataMax * 1.1]}
            />
            <Tooltip
              cursor={{ stroke: CHART.axis, strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof data)[number];
                const pct = currency === "USD" ? p.unit_cost_usd_change_pct : p.unit_cost_try_change_pct;
                return (
                  <TooltipBox
                    title={p.batch_no}
                    rows={[
                      { label: "Tamamlanma", value: fmtDate(p.completed_at) },
                      { label: "Adet", value: `${fmtInt(p.quantity)} adet` },
                      {
                        label: "Birim maliyet (USD)",
                        value: fmtUnitMoney(p.unit_cost_usd, "USD"),
                        color: currency === "USD" ? CHART.brand : undefined,
                      },
                      {
                        label: "Birim maliyet (TL)",
                        value: fmtUnitMoney(p.unit_cost_try, "TRY"),
                        color: currency === "TRY" ? CHART.brand : undefined,
                      },
                      {
                        label: "Önceki partiye göre",
                        value:
                          pct === null || pct === undefined
                            ? "—"
                            : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}%${Math.abs(Number(pct)).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`,
                      },
                    ]}
                  />
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="cost"
              stroke={CHART.brand}
              strokeWidth={2}
              dot={{ r: 4, fill: CHART.brand, stroke: "#fff", strokeWidth: 2 }}
              activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartFrame>
      </div>
      {last ? (
        <div className="border-t border-line">
          <MetricRow
            items={[
              {
                label: "Parti sayısı",
                value: fmtInt(data.length),
                hint: `${fmtInt(data.reduce((a, d) => a + d.quantity, 0))} adet üretildi`,
              },
              {
                label: `Son birim maliyet (${currency === "USD" ? "USD" : "TL"})`,
                value: fmtUnitMoney(last.cost, currency),
                hint: (
                  <Link href={`/uretim/${last.id}`} className="link">
                    {last.batch_no}
                  </Link>
                ),
              },
              {
                label: "Önceki partiye göre",
                value: <CostChange pct={lastPct} prev={data.length > 1 ? data[data.length - 2].batch_no : null} />,
                hint: data.length > 1 ? `${data[data.length - 2].batch_no} ile` : "Tek parti: karşılaştırma yok",
              },
              {
                label: "En düşük – en yüksek",
                value: min === max ? fmtUnitMoney(min, currency) : `${fmtUnitMoney(min, currency)} – ${fmtUnitMoney(max, currency)}`,
              },
            ]}
          />
        </div>
      ) : null}
    </Card>
  );
}
