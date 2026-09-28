// Dashboard ve Kasa için tarih aralığı seçimi (URL: ?donem=30g | 7g | 90g | bu-ay | gecen-ay | bu-yil | 12a | ozel&bas&bit,
// ?gorunum=gunluk | aylik). Tüm tarihler Türkiye saatine göre YYYY-AA-GG.

export type PeriodKey = "7g" | "30g" | "90g" | "bu-ay" | "gecen-ay" | "bu-yil" | "12a" | "ozel";
export type Granularity = "gunluk" | "aylik";

export const PERIOD_OPTIONS: { key: Exclude<PeriodKey, "ozel">; label: string }[] = [
  { key: "7g", label: "Son 7 gün" },
  { key: "30g", label: "Son 30 gün" },
  { key: "90g", label: "Son 90 gün" },
  { key: "bu-ay", label: "Bu ay" },
  { key: "gecen-ay", label: "Geçen ay" },
  { key: "bu-yil", label: "Bu yıl" },
  { key: "12a", label: "Son 12 ay" },
];

export interface Period {
  key: PeriodKey;
  label: string;
  from: string;
  to: string;
  days: number;
  /** Aynı uzunlukta, hemen önceki dönem (karşılaştırma için) */
  prevFrom: string;
  prevTo: string;
  granularity: Granularity;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
}

function monthStart(iso: string, offset = 0): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + offset, 1, 12)).toISOString().slice(0, 10);
}

const valid = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export function resolvePeriod(
  params: { donem?: string; bas?: string; bit?: string; gorunum?: string },
  today: string,
  defaultKey: Exclude<PeriodKey, "ozel"> = "30g",
): Period {
  let key = (params.donem as PeriodKey) ?? defaultKey;
  let from: string;
  let to = today;
  switch (key) {
    case "7g":
      from = addDays(today, -6);
      break;
    case "90g":
      from = addDays(today, -89);
      break;
    case "bu-ay":
      from = monthStart(today);
      break;
    case "gecen-ay":
      from = monthStart(today, -1);
      to = addDays(monthStart(today), -1);
      break;
    case "bu-yil":
      from = `${today.slice(0, 4)}-01-01`;
      break;
    case "12a":
      from = monthStart(today, -11);
      break;
    case "ozel":
      if (valid(params.bas) && valid(params.bit) && params.bas! <= params.bit!) {
        from = params.bas!;
        to = params.bit! > today ? today : params.bit!;
        break;
      }
      key = defaultKey;
      from = addDays(today, -29);
      break;
    case "30g":
    default:
      key = key === "30g" ? key : defaultKey;
      from = addDays(today, -29);
  }
  const days = daysBetween(from, to);
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  const granularity: Granularity =
    params.gorunum === "gunluk" || params.gorunum === "aylik" ? params.gorunum : days > 92 ? "aylik" : "gunluk";
  const label =
    key === "ozel" ? `${fmt(from)} – ${fmt(to)}` : (PERIOD_OPTIONS.find((o) => o.key === key)?.label ?? "Son 30 gün");
  return { key, label, from, to, days, prevFrom, prevTo, granularity };
}

function fmt(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** Aralıktaki tüm günler veya aylar (grafikte boş günler 0 ile doldurulur). */
export function buckets(from: string, to: string, granularity: Granularity): string[] {
  const out: string[] = [];
  if (granularity === "gunluk") {
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  } else {
    for (let m = monthStart(from); m <= to; m = monthStart(m, 1)) out.push(m.slice(0, 7));
  }
  return out;
}
