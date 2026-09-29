import { fmtNum } from "@/lib/format";

/**
 * Kasa ekranındaki yüzdeler (marj, pay) için sabit tek ondalık: "%58,0", "%72,3", "%−4,1".
 * lib/format fmtPct sondaki sıfırı attığı için tablolarda ondalık tutarsız görünür; burada her zaman 1 hane.
 */
export function pct1(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return `%${rounded < 0 ? "−" : ""}${fmtNum(Math.abs(rounded), 1, 1)}`;
}

/** Puan farkı (marj değişimi): "+7,6 puan", "−0,4 puan". */
export function points1(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${fmtNum(Math.abs(rounded), 1, 1)} puan`;
}
