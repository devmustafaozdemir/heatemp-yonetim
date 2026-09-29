"use client";

import { HBarChart, SERIES } from "@/components/charts/kit";
import { fmtCompactMoney, fmtInt, fmtMoney } from "@/lib/format";

export interface SupplierSpendRow {
  key: string;
  label: string;
  /** Toplam alış tutarı, KDV dahil TL (alış günü kuruyla) */
  value: number;
  /** KDV, TL */
  vat: number;
  usd: number;
  count: number;
}

/** Tedarikçilere ödenen toplam alış tutarı (KDV dahil TL); tooltip'te KDV, USD karşılığı (KDV hariç) ve alış sayısı. */
export function SupplierSpendChart({ data }: { data: SupplierSpendRow[] }) {
  const byKey = new Map(data.map((d) => [d.key, d]));
  return (
    <HBarChart
      data={data}
      color={SERIES.cost}
      label="Tedarikçilere ödenen toplam alış tutarı (KDV dahil TL)"
      valueLabel="Ödenen (KDV dahil)"
      format={(v) => fmtMoney(v, "TRY")}
      axisFormat={(v) => fmtCompactMoney(v, "TRY")}
      emptyText="Tedarikçi seçilerek yapılmış alış yok."
      labelWidth={170}
      tooltipRows={(key) => {
        const d = byKey.get(key);
        return d
          ? [
              { label: "KDV", value: fmtMoney(d.vat, "TRY") },
              { label: "USD (KDV hariç)", value: fmtMoney(d.usd, "USD") },
              { label: "Alış sayısı", value: fmtInt(d.count) },
            ]
          : [];
      }}
    />
  );
}
