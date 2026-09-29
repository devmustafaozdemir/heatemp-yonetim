// Türkçe sayı, para, tarih ve süre biçimlendirme.

export type Currency = "USD" | "TRY";

type Num = number | string | null | undefined;

export function toNumber(value: Num): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

const numberFormats = new Map<string, Intl.NumberFormat>();
function nf(min: number, max: number) {
  const key = `${min}-${max}`;
  let f = numberFormats.get(key);
  if (!f) {
    f = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: min, maximumFractionDigits: max });
    numberFormats.set(key, f);
  }
  return f;
}

export function fmtNum(value: Num, maxFraction = 2, minFraction = 0): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return nf(minFraction, maxFraction).format(n);
}

export function fmtInt(value: Num): string {
  return fmtNum(value, 0);
}

const SYMBOL: Record<Currency, string> = { TRY: "₺", USD: "$" };

export function fmtMoney(value: Num, currency: Currency | string = "TRY", fractionDigits = 2): string {
  const n = toNumber(value);
  if (n === null) return "—";
  const symbol = SYMBOL[currency as Currency] ?? `${currency} `;
  const sign = n < 0 ? "−" : "";
  return `${sign}${symbol}${nf(fractionDigits, fractionDigits).format(Math.abs(n))}`;
}

/** Birim maliyet gibi küçük tutarlar için 4 haneye kadar. */
export function fmtUnitMoney(value: Num, currency: Currency | string = "TRY"): string {
  const n = toNumber(value);
  if (n === null) return "—";
  const symbol = SYMBOL[currency as Currency] ?? `${currency} `;
  const sign = n < 0 ? "−" : "";
  return `${sign}${symbol}${nf(2, 4).format(Math.abs(n))}`;
}

export function fmtRate(value: Num): string {
  return fmtNum(value, 4, 4);
}

export function fmtPct(value: Num, withSign = false): string {
  const n = toNumber(value);
  if (n === null) return "—";
  const s = nf(0, 2).format(Math.abs(n));
  if (!withSign) return `%${n < 0 ? "−" : ""}${s}`;
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}%${s}`;
}

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}.${m}.${y}`;
  }
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function fmtMonth(value: string): string {
  const [y, m] = value.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return new Intl.DateTimeFormat("tr-TR", { month: "short", year: "numeric" }).format(date);
}

/** Dakika → "2 sa 15 dk" / "3 gün 4 sa" */
/** Adet başı üretim süresini 100 adetlik süre olarak gösterir (ör. "45 dk / 100 adet"). */
export function fmtMinutes100(perUnit: Num): string {
  const n = toNumber(perUnit);
  return n === null ? "—" : `${fmtMinutes(n * 100)} / 100 adet`;
}

/** Form alanı için 100 adetlik süre (dk); adet başı değer × 100. */
export function minutesPer100(perUnit: Num): string {
  const n = toNumber(perUnit);
  return n === null ? "" : String(Math.round(n * 100 * 100) / 100);
}

export function fmtMinutes(value: Num): string {
  const n = toNumber(value);
  if (n === null) return "—";
  const total = Math.round(n);
  if (total < 60) return `${fmtNum(n, 1)} dk`;
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  if (days > 0) return `${days} gün${hours ? ` ${hours} sa` : ""}`;
  return `${hours} sa${minutes ? ` ${minutes} dk` : ""}`;
}

/** Temel birimdeki miktarı gösterim birimine çevirir. */
export function fmtQty(baseQty: Num, displayFactor: Num, unit: string, maxFraction = 3): string {
  const q = toNumber(baseQty);
  const f = toNumber(displayFactor) ?? 1;
  if (q === null) return "—";
  return `${fmtNum(q / f, maxFraction)} ${unit}`;
}

/** Bugünün tarihi (Türkiye saatiyle) YYYY-MM-DD. */
export function todayTr(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts;
}

/** Grafik eksenleri ve kartlar için kısa tutar: ₺905 bin, ₺1,2 mn, $12,5 bin. */
export function fmtCompactMoney(value: Num, currency: Currency | string = "TRY"): string {
  const n = toNumber(value);
  if (n === null) return "—";
  const symbol = SYMBOL[currency as Currency] ?? `${currency} `;
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}${symbol}${nf(0, 1).format(a / 1_000_000)} mn`;
  if (a >= 10_000) return `${sign}${symbol}${nf(0, 0).format(a / 1_000)} bin`;
  if (a >= 1_000) return `${sign}${symbol}${nf(0, 1).format(a / 1_000)} bin`;
  return `${sign}${symbol}${nf(0, 0).format(a)}`;
}

/**
 * Önceki döneme göre yüzde değişim. Önceki değer 0 veya bilinmiyorsa null döner
 * (yüzde uydurulmaz).
 */
export function pctChange(current: Num, previous: Num): number | null {
  const c = toNumber(current);
  const p = toNumber(previous);
  if (c === null || p === null || p === 0) return null;
  return ((c - p) / Math.abs(p)) * 100;
}

/** Sabit ondalıklı yüzde (marj, pay): "%72,3". Tablolarda yan yana aynı hane sayısı için. */
export function fmtPercent(value: Num, digits = 1): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return `%${n < 0 ? "−" : ""}${nf(digits, digits).format(Math.abs(n))}`;
}

/** Grafik ekseni için kısa gün: "29.09" (tooltip'te fmtDate kullanın). */
export function fmtDayShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

/**
 * Eksen için "güzel" adımlar (1, 2, 2,5, 5 × 10^n): 0/85/170 yerine 0/100/200.
 * Döner: { ticks, max } — YAxis domain=[0, max] ve ticks olarak verin.
 */
export function niceTicks(maxValue: number, count = 4, minValue = 0): { ticks: number[]; min: number; max: number } {
  const span = Math.max(maxValue - minValue, Math.abs(maxValue) * 0.001, 1e-9);
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const min = Math.floor(minValue / step) * step;
  const max = Math.ceil(maxValue / step) * step || step;
  const ticks: number[] = [];
  for (let t = min; t <= max + step / 2; t += step) ticks.push(Number(t.toFixed(10)));
  return { ticks, min, max };
}
