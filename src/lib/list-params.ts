// Liste sayfaları için URL parametreleri: arama, filtre, sıralama ve sunucu tarafı sayfalama.
// Tüm liste durumu URL'de tutulur; böylece bağlantı paylaşılabilir ve geri tuşu çalışır.

export type SearchParams = Record<string, string | string[] | undefined>;

export const PAGE_SIZES = [25, 50, 100] as const;

export interface ListParams {
  /** URL'deki tüm tekil değerler (boş olanlar hariç) */
  values: Record<string, string>;
  q: string;
  page: number;
  pageSize: number;
  sort: string | null;
  dir: "asc" | "desc";
  /** Supabase .range(from, to) için */
  from: number;
  to: number;
}

export function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

/**
 * @param sortable izin verilen sıralama anahtarları (URL'den gelen değer doğrulanır)
 */
export function parseListParams(
  sp: SearchParams,
  { sortable = [], defaultSort = null, defaultDir = "desc", defaultPageSize = 25 }: {
    sortable?: string[];
    defaultSort?: string | null;
    defaultDir?: "asc" | "desc";
    defaultPageSize?: number;
  } = {},
): ListParams {
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    const s = first(v);
    if (s) values[k] = s;
  }
  const pageSize = (PAGE_SIZES as readonly number[]).includes(Number(values.adet)) ? Number(values.adet) : defaultPageSize;
  const page = Math.max(1, Math.floor(Number(values.sayfa) || 1));
  const sort = values.sirala && sortable.includes(values.sirala) ? values.sirala : defaultSort;
  const dir = values.yon === "asc" || values.yon === "desc" ? values.yon : defaultDir;
  const from = (page - 1) * pageSize;
  return { values, q: values.q ?? "", page, pageSize, sort, dir, from, to: from + pageSize - 1 };
}

/** Mevcut parametreleri koruyarak yeni bir bağlantı üretir; null/"" değerler kaldırılır. */
export function hrefWith(basePath: string, values: Record<string, string>, overrides: Record<string, string | number | null | undefined> = {}) {
  const params = new URLSearchParams();
  const merged: Record<string, string | number | null | undefined> = { ...values, ...overrides };
  for (const [k, v] of Object.entries(merged)) {
    if (v === null || v === undefined || v === "") continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** PostgREST `ilike` / `or` filtreleri için arama metnini güvenli hale getirir. */
export function searchPattern(q: string): string | null {
  const cleaned = q.replace(/[%_,()*\\]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? `%${cleaned}%` : null;
}

/** YYYY-AA-GG doğrulaması (tarih filtresi) */
export function isoDateOrNull(v: string | undefined): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null;
}
