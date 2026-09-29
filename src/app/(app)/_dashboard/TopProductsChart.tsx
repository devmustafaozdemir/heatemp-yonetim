"use client";

import { Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Bar, BarChart, LabelList, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, ChartFrame, Segmented, TooltipBox } from "@/components/charts/kit";
import { Card } from "@/components/ui";
import { fmtCompactMoney, fmtInt, fmtMoney, fmtPct } from "@/lib/format";
import type { ProductSales } from "./data";

type Metric = "quantity" | "revenue";
const TOP = 8;

/**
 * Seçilen dönemde en çok satan ürünler (varyantlar ürün bazında toplanır). Adet veya ciro
 * seçilir; ilk 8 ürün gösterilir, kalanlar not olarak özetlenir.
 */
export function TopProductsChart({ rows, periodLabel, salesHref }: { rows: ProductSales[]; periodLabel: string; salesHref: string }) {
  const [metric, setMetric] = useState<Metric>("revenue");
  const money = metric === "revenue";
  const value = (r: ProductSales) => (money ? r.revenue_try : r.quantity);
  const sorted = [...rows].filter((r) => value(r) > 0).sort((a, b) => value(b) - value(a));
  const top = sorted.slice(0, TOP);
  const rest = sorted.slice(TOP);
  const total = sorted.reduce((a, r) => a + value(r), 0);
  const restValue = rest.reduce((a, r) => a + value(r), 0);
  const data = top.map((r) => ({ ...r, value: value(r) }));
  const color = money ? CHART.blue : CHART.violet;
  const fmt = (v: number) => (money ? fmtMoney(v, "TRY") : `${fmtInt(v)} adet`);
  const fmtShort = (v: number) => (money ? fmtCompactMoney(v, "TRY") : fmtInt(v));

  const height = Math.max(180, data.length * 46 + 8);

  return (
    <Card
      title="Ürün bazlı satış"
      icon={Trophy}
      description={`${periodLabel} · en çok satan ürünler (varyantlar ürün bazında toplanır)`}
      actions={
        <Segmented<Metric>
          value={metric}
          onChange={setMetric}
          label="Sıralama ölçüsü"
          options={[
            ["revenue", "Ciro (TL)"],
            ["quantity", "Adet"],
          ]}
        />
      }
      className="h-full"
      footer={
        sorted.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Dönem toplamı özet kartında (v_sales_daily) gösterilir; burada tekrar edilmez (kuruş yuvarlaması farkı olmasın). */}
            <span>
              {rest.length > 0
                ? `İlk ${TOP} ürün gösteriliyor; diğer ${fmtInt(rest.length)} ürün: ${fmt(restValue)} (${fmtPct(total > 0 ? (restValue / total) * 100 : null)}).`
                : `Dönemde satılan ${fmtInt(sorted.length)} ürünün tamamı gösteriliyor.`}
            </span>
            <Link href={salesHref} className="link">
              Dönemin satışları
            </Link>
          </div>
        ) : undefined
      }
    >
      <div>
        <ChartFrame
          height={data.length ? height : 280}
          label={`${periodLabel} en çok satan ürünler, ${money ? "ciro" : "adet"} sırasıyla`}
          empty={data.length === 0}
          emptyText="Seçilen dönemde gerçekleşmiş satış yok."
        >
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: money ? 76 : 44, bottom: 0, left: 0 }} barCategoryGap={0}>
            <XAxis type="number" hide domain={[0, "dataMax"]} />
            <YAxis type="category" dataKey="product_name" hide width={0} />
            <Tooltip
              cursor={{ fill: CHART.brand, fillOpacity: 0.05 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof data)[number];
                const margin = p.revenue_try > 0 ? (p.gross_profit_try / p.revenue_try) * 100 : null;
                return (
                  <TooltipBox
                    title={p.product_name}
                    rows={[
                      { label: "Ciro", value: fmtMoney(p.revenue_try, "TRY"), color: money ? color : undefined },
                      { label: "Satılan adet", value: `${fmtInt(p.quantity)} adet`, color: money ? undefined : color },
                      { label: "Brüt kâr", value: fmtMoney(p.gross_profit_try, "TRY") },
                      { label: "Marj", value: fmtPct(margin) },
                      { label: "Pay", value: fmtPct(total > 0 ? (p.value / total) * 100 : null) },
                      { label: "Satılan varyant", value: fmtInt(p.variants) },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} barSize={14} minPointSize={2} isAnimationActive={false}>
              {/* Ürün adı çubuğun üstünde, tam genişlikte (uzun adlar kesilmez) */}
              <LabelList
                dataKey="product_name"
                content={(props) => {
                  const { x, y, value } = props as { x?: number | string; y?: number | string; value?: unknown };
                  return (
                    <text x={Number(x)} y={Number(y) - 6} className="fill-ink-soft" fontSize={12} fontWeight={500}>
                      {String(value ?? "")}
                    </text>
                  );
                }}
              />
              {/* Değer çubuğun ucunda */}
              <LabelList
                dataKey="value"
                content={(props) => {
                  const { x, y, width, height, value } = props as {
                    x?: number | string;
                    y?: number | string;
                    width?: number | string;
                    height?: number | string;
                    value?: unknown;
                  };
                  return (
                    <text
                      x={Number(x) + Number(width) + 6}
                      y={Number(y) + Number(height) / 2}
                      dominantBaseline="central"
                      className="fill-ink-soft tabular-nums"
                      fontSize={11.5}
                      fontWeight={600}
                    >
                      {fmtShort(Number(value))}
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ChartFrame>
      </div>
    </Card>
  );
}
