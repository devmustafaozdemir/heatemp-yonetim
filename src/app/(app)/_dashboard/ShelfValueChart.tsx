"use client";

import { CHART, DonutChart } from "@/components/charts/kit";
import { fmtCompactMoney, fmtInt, fmtMoney } from "@/lib/format";

/** Heatemp ve Mekonsis raflarının maliyet değeri dağılımı (istemci: biçimlendirme fonksiyonu burada). */
export function ShelfValueChart({
  heatemp,
  mekonsis,
}: {
  heatemp: { qty: number; value: number };
  mekonsis: { qty: number; value: number };
}) {
  const total = heatemp.value + mekonsis.value;
  return (
    <DonutChart
      label={`Raf değeri dağılımı: Heatemp rafı ${fmtMoney(heatemp.value, "TRY")}, Mekonsis rafı ${fmtMoney(mekonsis.value, "TRY")}`}
      centerLabel="Toplam mamul"
      centerValue={fmtCompactMoney(total, "TRY")}
      format={(v) => fmtMoney(v, "TRY")}
      data={[
        { name: "Heatemp rafı", value: heatemp.value, color: CHART.blue, hint: `${fmtInt(heatemp.qty)} adet` },
        { name: "Mekonsis rafı", value: mekonsis.value, color: CHART.teal, hint: `${fmtInt(mekonsis.qty)} adet` },
      ]}
    />
  );
}
