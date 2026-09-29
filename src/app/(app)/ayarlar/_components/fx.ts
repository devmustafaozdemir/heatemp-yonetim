import type { AppSettings, FxRateRow } from "@/lib/types";

// Ayarlar ekranına özel kur yardımcıları (sunucu tarafı).

export const RATE_TYPE_LABEL: Record<string, string> = {
  ForexBuying: "Döviz alış",
  ForexSelling: "Döviz satış",
  Reference: "Referans kur",
  Manual: "Manuel giriş",
};

export const SOURCE_NAME: Record<string, string> = {
  TCMB: "TCMB",
  FRANKFURTER: "ECB (Frankfurter)",
  MANUAL: "Manuel",
};

export const SOURCE_LONG: Record<AppSettings["fx_primary_source"], string> = {
  TCMB: "TCMB (Merkez Bankası)",
  FRANKFURTER: "ECB referans (Frankfurter)",
};

/** Şimdiki zaman (ms). Bileşen gövdesi dışında tutulur. */
export function nowMs(): number {
  return Date.now();
}

/** "12 dk önce", "3 sa önce", "2 gün önce" */
export function ago(ts: string | null | undefined, now: number): string | null {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return null;
  const min = Math.max(0, Math.round((now - t) / 60_000));
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dk önce`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.floor(h / 24);
  return `${d} gün önce`;
}

/** Dakika → "60 dakika", "2 saat", "1 gün" */
export function everyLabel(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440} gün`;
  if (minutes % 60 === 0) return `${minutes / 60} saat`;
  return `${minutes} dakika`;
}

export interface EffectiveRate {
  date: string;
  rate: number;
  source: string;
  rate_type: string;
}

/**
 * Her gün için işlemlerde önerilecek kur (fx_rate_for_date ile aynı öncelik):
 * TCMB'de yalnız ayarlı kur türü; önce birincil kaynak, sonra otomatik kaynaklar, en son manuel; aynıysa en yeni alınan.
 */
export function effectiveDailyRates(
  rows: FxRateRow[],
  settings: Pick<AppSettings, "fx_primary_source" | "fx_tcmb_rate_type">,
): EffectiveRate[] {
  const byDate = new Map<string, FxRateRow>();
  const score = (r: FxRateRow) => [
    r.source === settings.fx_primary_source ? 1 : 0,
    r.source !== "MANUAL" ? 1 : 0,
    new Date(r.fetched_at).getTime(),
  ];
  for (const r of rows) {
    if (r.source === "TCMB" && r.rate_type !== settings.fx_tcmb_rate_type) continue;
    const cur = byDate.get(r.rate_date);
    if (!cur) {
      byDate.set(r.rate_date, r);
      continue;
    }
    const a = score(r);
    const b = score(cur);
    if (a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])))) byDate.set(r.rate_date, r);
  }
  return [...byDate.values()]
    .sort((a, b) => a.rate_date.localeCompare(b.rate_date))
    .map((r) => ({ date: r.rate_date, rate: Number(r.rate), source: r.source, rate_type: r.rate_type }));
}
