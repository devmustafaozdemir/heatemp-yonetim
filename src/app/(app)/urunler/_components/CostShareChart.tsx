"use client";

import { CHART, HBarChart } from "@/components/charts/kit";
import { fmtUnitMoney } from "@/lib/format";

/** Reçete satırlarının 1 adetlik tahmini maliyet payı (USD). */
export function CostShareChart({ data, total }: { data: { key: string; label: string; value: number }[]; total: number }) {
  return (
    <HBarChart
      data={data}
      color={CHART.violet}
      format={(v) => fmtUnitMoney(v, "USD")}
      label="Reçete satırlarının tahmini maliyet dağılımı (USD, 1 adet)"
      emptyText="Maliyeti bilinen reçete satırı yok."
      tooltipRows={(key) => {
        const d = data.find((x) => x.key === key);
        return d && total > 0
          ? [{ label: "Pay", value: `%${((d.value / total) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}` }]
          : [];
      }}
    />
  );
}
