"use client";

import { CHART, DonutChart } from "@/components/charts/kit";
import { fmtCompactMoney, fmtInt, fmtMoney } from "@/lib/format";

/** Güncel stok değerlerinin dağılımı (maliyet değeri, TL). */
export function StockValueDonut({
  heatemp,
  mekonsis,
  material,
  wip,
}: {
  heatemp: { qty: number; value: number };
  mekonsis: { qty: number; value: number };
  material: number;
  wip: { qty: number; value: number };
}) {
  const total = heatemp.value + mekonsis.value + material + wip.value;
  return (
    <DonutChart
      label="Güncel stok değeri dağılımı: Heatemp rafı, Mekonsis rafı, hammadde ve üretimdeki partiler (TL)"
      emptyText="Stok değeri yok."
      centerLabel="Toplam stok"
      centerValue={fmtCompactMoney(total, "TRY")}
      format={(v) => fmtMoney(v, "TRY")}
      height={200}
      data={[
        {
          name: "Heatemp rafı",
          value: heatemp.value,
          color: CHART.blue,
          hint: `${fmtInt(heatemp.qty)} adet mamul`,
        },
        {
          name: "Mekonsis rafı",
          value: mekonsis.value,
          color: CHART.teal,
          hint: `${fmtInt(mekonsis.qty)} adet · Heatemp'in varlığı`,
        },
        {
          name: "Hammadde",
          value: material,
          color: CHART.amber,
          hint: "Monte edilmemiş komponentler dahil",
        },
        {
          name: "Üretimdeki partiler",
          value: wip.value,
          color: CHART.violet,
          hint: `${fmtInt(wip.qty)} adet üretimde`,
        },
      ]}
    />
  );
}
