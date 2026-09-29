// Satışlar listesi için dönem seçimi (URL): ?donem=7g|30g|90g|bu-ay|gecen-ay|bu-yil|12a
// veya özel aralık ?bas&bit. Parametre yoksa "Tümü" (tarih kısıtı yok).
import { fmtDate } from "@/lib/format";
import { isoDateOrNull } from "@/lib/list-params";
import { addDays, daysBetween, PERIOD_OPTIONS, resolvePeriod, type Granularity } from "@/lib/period";

export type ListPeriodKey = "tumu" | "ozel" | (typeof PERIOD_OPTIONS)[number]["key"];

export interface ListPeriod {
  key: ListPeriodKey;
  label: string;
  from: string | null;
  to: string | null;
  /** from ve to birlikte biliniyorsa gün sayısı */
  days: number | null;
  /** Aynı uzunlukta önceki dönem (karşılaştırma); açık uçlu aralıkta yok */
  prev: { from: string; to: string } | null;
}

export const PERIOD_PRESETS: { key: Exclude<ListPeriodKey, "ozel">; label: string }[] = [
  { key: "tumu", label: "Tümü" },
  { key: "7g", label: "7 gün" },
  { key: "30g", label: "30 gün" },
  { key: "90g", label: "90 gün" },
  { key: "bu-ay", label: "Bu ay" },
  { key: "gecen-ay", label: "Geçen ay" },
  { key: "bu-yil", label: "Bu yıl" },
  { key: "12a", label: "12 ay" },
];

export function resolveListPeriod(values: Record<string, string>, today: string): ListPeriod {
  let from = isoDateOrNull(values.bas);
  let to = isoDateOrNull(values.bit);
  if (from || to) {
    if (to && to > today) to = today;
    if (from && to && from > to) [from, to] = [to, from];
    const days = from && to ? daysBetween(from, to) : null;
    const prev = from && days ? { from: addDays(from, -days), to: addDays(from, -1) } : null;
    const label = from && to ? `${fmtDate(from)} – ${fmtDate(to)}` : from ? `${fmtDate(from)} ve sonrası` : `${fmtDate(to)} ve öncesi`;
    return { key: "ozel", label, from, to, days, prev };
  }
  const donem = values.donem;
  if (donem && PERIOD_OPTIONS.some((o) => o.key === donem)) {
    const p = resolvePeriod({ donem }, today);
    return { key: p.key as ListPeriodKey, label: p.label, from: p.from, to: p.to, days: p.days, prev: { from: p.prevFrom, to: p.prevTo } };
  }
  return { key: "tumu", label: "Tüm zamanlar", from: null, to: null, days: null, prev: null };
}

/**
 * Özet sorgusu aylık mı gruplansın: yalnız uzunluğu bilinen ve 92 günü aşan dönemlerde.
 * Açık uçlu aralıkta (Tümü, yalnız başlangıç veya bitiş) veri günlük alınır; kırılım,
 * verinin gerçek kapsamı öğrenildikten sonra chartGranularity ile seçilir.
 */
export function monthlyQuery(p: ListPeriod): boolean {
  return p.days !== null && p.days > 92;
}

/** Grafik kırılımı: kapsam 92 güne kadar günlük, daha uzunsa aylık. */
export function chartGranularity(from: string | null, to: string): Granularity {
  return from && from <= to && daysBetween(from, to) <= 92 ? "gunluk" : "aylik";
}
