"use client";

import { LineChart as LineIcon } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, CHART, ChartFrame, GRID_PROPS, Segmented, TooltipBox } from "@/components/charts/kit";
import { Card, MetricRow } from "@/components/ui";
import { CostChange } from "@/components/status";
import { fmtDate, fmtInt, fmtMoney, fmtUnitMoney, type Currency } from "@/lib/format";

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

const SHORT_DATE = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Europe/Istanbul" });

/** 1, 2, 2,5, 5 × 10^n adımlarından en yakını ("nice number"). */
function niceStep(raw: number): number {
  const exp = Math.floor(Math.log10(raw));
  const f = raw / 10 ** exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * 10 ** exp;
}

/**
 * Y ekseni için yuvarlak sınırlar ve eşit aralıklı çizgiler (ör. 4,00 / 4,25 / 4,50 / 4,75 / 5,00).
 * Veri en üst/alt çizgiye yapışmasın diye aralığın %10'u kadar pay bırakılır; alt sınır 0'ın altına inmez.
 */
function niceAxis(min: number, max: number, count = 5): { domain: [number, number]; ticks: number[] } {
  const span = max - min;
  const pad = span > 0 ? span * 0.1 : Math.abs(max) * 0.1 || 1;
  const lo0 = Math.max(0, min - pad);
  const hi0 = max + pad;
  const step = niceStep((hi0 - lo0) / (count - 1));
  const lo = Math.max(0, Math.floor(lo0 / step) * step);
  const hi = Math.ceil(hi0 / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return { domain: [ticks[0], ticks[ticks.length - 1]], ticks };
}

/** X ekseni etiketi: parti no ve altında tamamlanma tarihi (partiler tamamlanma sırasıyla eşit aralıklı). */
function BatchTick(props: { x?: number | string; y?: number | string; payload?: { value?: unknown }; dates: Map<string, string> }) {
  const no = String(props.payload?.value ?? "");
  const date = props.dates.get(no);
  return (
    <g transform={`translate(${Number(props.x)},${Number(props.y)})`}>
      <text textAnchor="middle" dy={10} fontSize={11} fill={CHART.axis}>
        {no}
      </text>
      {date ? (
        <text textAnchor="middle" dy={24} fontSize={10.5} fill={CHART.axis}>
          {date}
        </text>
      ) : null}
    </g>
  );
}

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
        .map((b) => ({ ...b, cost: Number(currency === "USD" ? b.unit_cost_usd : b.unit_cost_try) })),
    [batches, selected?.id, currency],
  );
  const last = data[data.length - 1];
  const costs = data.map((d) => d.cost);
  const min = costs.length ? Math.min(...costs) : null;
  const max = costs.length ? Math.max(...costs) : null;
  const axis = min !== null && max !== null ? niceAxis(min, max) : null;
  // Eksen etiketleri: adım 1 ve üstüyse tam sayı, değilse en az 2 (adım gerektiriyorsa 4'e kadar) ondalık.
  const step = axis && axis.ticks.length > 1 ? axis.ticks[1] - axis.ticks[0] : 1;
  const tickDigits = step >= 1 ? 0 : Math.min(4, Math.max(2, (String(Number(step.toFixed(6))).split(".")[1] ?? "").length));
  const dates = useMemo(() => new Map(data.map((d) => [d.batch_no, SHORT_DATE.format(new Date(d.completed_at))])), [data]);
  const lastPct = last ? (currency === "USD" ? last.unit_cost_usd_change_pct : last.unit_cost_try_change_pct) : null;

  return (
    <Card
      title="Parti birim maliyeti"
      icon={LineIcon}
      description="Tamamlanmış üretim partileri, tamamlanma sırasıyla (eksende parti no ve tarih); açılış stoğu partileri dahil değildir."
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
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <label htmlFor={selectId} className="text-xs text-ink-muted sm:shrink-0">
              Ürün / varyant
            </label>
            <select
              id={selectId}
              value={selected?.id ?? ""}
              onChange={(e) => setVariantId(e.target.value)}
              className="input input-sm w-full min-w-0 sm:w-auto sm:max-w-[26rem] sm:flex-1"
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
          height={250}
          label={`${selected ? `${selected.product} ${selected.variant}` : ""} parti birim maliyeti (${currency === "USD" ? "USD" : "TL"}), tamamlanma sırasına göre`}
          empty={data.length === 0}
          emptyText="Henüz tamamlanmış üretim partisi yok. Açılış stoğu partileri bu grafiğe dahil edilmez."
        >
          <LineChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis
              type="category"
              dataKey="batch_no"
              tick={(p: { x?: number | string; y?: number | string; payload?: { value?: unknown } }) => <BatchTick {...p} dates={dates} />}
              tickLine={false}
              axisLine={{ stroke: CHART.grid }}
              interval="preserveStartEnd"
              minTickGap={16}
              height={36}
              padding={{ left: 24, right: 24 }}
            />
            <YAxis
              dataKey="cost"
              tickFormatter={(v: number) => fmtMoney(v, currency, tickDigits)}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={72}
              domain={axis?.domain ?? [0, "auto"]}
              ticks={axis?.ticks}
              interval={0}
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
              dot={{ r: 4, fill: CHART.brand, strokeWidth: 2, className: "stroke-white" }}
              activeDot={{ r: 6, strokeWidth: 2, className: "stroke-white" }}
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
