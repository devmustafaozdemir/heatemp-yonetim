// Satışlar ekranlarında oranların tutarlı gösterimi (lib/format ile aynı Türkçe biçim).
import { fmtNum, toNumber } from "@/lib/format";

/** Marj / pay gibi oranlar: her zaman 1 ondalık ("%63,7", "%90,0", "%−4,2"). */
export function fmtRatio(value: number | string | null | undefined): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return `%${n < 0 ? "−" : ""}${fmtNum(Math.abs(n), 1, 1)}`;
}

/** İşaretli oran ("+%4,5", "−%12,0"); liste fiyatı farkı gibi yerlerde. */
export function fmtRatioSigned(value: number | string | null | undefined): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}%${fmtNum(Math.abs(n), 1, 1)}`;
}

/**
 * Brüt marj (%), kâr / ciro'dan tek adımda hesaplanıp 1 ondalığa yuvarlanır.
 * v_sales.margin_pct zaten 2 ondalığa yuvarlı olduğundan onu tekrar yuvarlamak (70,345 → 70,35 → %70,4)
 * aynı satışta farklı değerler üretir; satış, kalem ve toplamlarda hep bu işlev kullanılır.
 * Maliyet payı için 100 − marj kullanılırsa ikisinin toplamı her zaman %100,0 olur.
 */
export function marginPct(profit: number | string | null | undefined, revenue: number | string | null | undefined): number | null {
  const p = toNumber(profit);
  const r = toNumber(revenue);
  if (p === null || r === null || r <= 0) return null;
  return Math.round((p / r) * 1000) / 10;
}
