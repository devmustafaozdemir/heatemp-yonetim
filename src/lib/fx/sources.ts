// USD/TRY kur kaynakları. Ayrıştırma fonksiyonları saf tutulur (birim testli).
//
// TCMB: Türkiye Cumhuriyet Merkez Bankası gösterge niteliğindeki kurlar.
//   Bugün: https://www.tcmb.gov.tr/kurlar/today.xml
//   Geçmiş gün: https://www.tcmb.gov.tr/kurlar/YYYYMM/DDMMYYYY.xml
//   Hafta sonu / resmî tatilde bülten yayımlanmaz (404) → önceki iş günü denenir.
// Frankfurter (ECB referans kurları, yedek kaynak):
//   https://api.frankfurter.dev/v1/{YYYY-MM-DD|latest}?base=USD&symbols=TRY

export type TcmbRateType = "ForexBuying" | "ForexSelling";

export interface FetchedRate {
  source: "TCMB" | "FRANKFURTER";
  rateType: TcmbRateType | "Reference";
  rate: number;
  rateDate: string; // YYYY-MM-DD
  raw: Record<string, unknown>;
}

export class FxSourceError extends Error {
  constructor(
    message: string,
    readonly notPublished = false,
  ) {
    super(message);
  }
}

export function tcmbUrl(date: string | null): string {
  if (!date) return "https://www.tcmb.gov.tr/kurlar/today.xml";
  const [y, m, d] = date.split("-");
  return `https://www.tcmb.gov.tr/kurlar/${y}${m}/${d}${m}${y}.xml`;
}

export function parseTcmbXml(xml: string, rateType: TcmbRateType): FetchedRate {
  const header = xml.match(/<Tarih_Date[^>]*\bTarih="(\d{2})\.(\d{2})\.(\d{4})"[^>]*>/);
  if (!header) throw new FxSourceError("TCMB yanıtında bülten tarihi bulunamadı.");
  const rateDate = `${header[3]}-${header[2]}-${header[1]}`;

  const block = xml.match(/<Currency\b[^>]*\bCurrencyCode="USD"[^>]*>([\s\S]*?)<\/Currency>/);
  if (!block) throw new FxSourceError("TCMB yanıtında USD kuru bulunamadı.");
  const read = (tag: string) => {
    const m = block[1].match(new RegExp(`<${tag}>\\s*([0-9.,]+)\\s*</${tag}>`));
    return m ? Number(m[1].replace(",", ".")) : null;
  };
  const unit = read("Unit") ?? 1;
  const value = read(rateType);
  if (!value || !Number.isFinite(value) || value <= 0) {
    throw new FxSourceError(`TCMB yanıtında USD ${rateType} değeri geçersiz.`);
  }
  const bulletin = xml.match(/Bulten_No="([^"]+)"/)?.[1] ?? null;
  return {
    source: "TCMB",
    rateType,
    rate: value / unit,
    rateDate,
    raw: {
      bulletin,
      unit,
      forexBuying: read("ForexBuying"),
      forexSelling: read("ForexSelling"),
    },
  };
}

export function frankfurterUrl(date: string | null): string {
  return `https://api.frankfurter.dev/v1/${date ?? "latest"}?base=USD&symbols=TRY`;
}

export function parseFrankfurter(json: unknown): FetchedRate {
  const data = json as { date?: string; rates?: { TRY?: number }; base?: string };
  const rate = data?.rates?.TRY;
  if (!data?.date || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) || typeof rate !== "number" || rate <= 0) {
    throw new FxSourceError("Frankfurter yanıtı beklenen biçimde değil.");
  }
  return { source: "FRANKFURTER", rateType: "Reference", rate, rateDate: data.date, raw: { base: data.base ?? "USD" } };
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

async function fetchText(fetcher: Fetcher, url: string, timeoutMs: number) {
  const res = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (res.status === 404) throw new FxSourceError("Bu tarih için bülten yayımlanmamış.", true);
  if (!res.ok) throw new FxSourceError(`Kur servisi ${res.status} yanıtı verdi.`);
  return res.text();
}

function previousDay(date: string, days = 1): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * TCMB'den kur alır. Tarih verilirse o gün yayımlanmamışsa (hafta sonu/tatil)
 * en fazla `lookbackDays` gün geriye gider.
 */
export async function fetchTcmb(
  date: string | null,
  rateType: TcmbRateType,
  { fetcher = fetch, timeoutMs = 6000, lookbackDays = 7 }: { fetcher?: Fetcher; timeoutMs?: number; lookbackDays?: number } = {},
): Promise<FetchedRate> {
  if (!date) {
    return parseTcmbXml(await fetchText(fetcher, tcmbUrl(null), timeoutMs), rateType);
  }
  let lastError: unknown = null;
  for (let i = 0; i <= lookbackDays; i++) {
    const day = previousDay(date, i);
    try {
      return parseTcmbXml(await fetchText(fetcher, tcmbUrl(day), timeoutMs), rateType);
    } catch (err) {
      lastError = err;
      if (!(err instanceof FxSourceError && err.notPublished)) throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new FxSourceError("TCMB kuru bulunamadı.");
}

export async function fetchFrankfurter(
  date: string | null,
  { fetcher = fetch, timeoutMs = 6000 }: { fetcher?: Fetcher; timeoutMs?: number } = {},
): Promise<FetchedRate> {
  const res = await fetcher(frankfurterUrl(date), { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!res.ok) throw new FxSourceError(`Frankfurter ${res.status} yanıtı verdi.`);
  return parseFrankfurter(await res.json());
}
