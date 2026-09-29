import { load, type Loaded } from "@/lib/query";
import { buckets, type Granularity, type Period } from "@/lib/period";
import type { SalesPeriodRow, VariantOverview } from "@/lib/types";

// Dashboard'a özel veri yardımcıları (sunucu tarafı). Tüm hesaplar mevcut görünümlerden
// (v_sales_daily, v_variant_overview, v_batches, sales_by_variant) türetilir.

type PageResult<T> = { data: T[] | null; error: unknown };

/**
 * PostgREST satır sınırını (max_rows = 1000) aşabilecek sorgular için sayfalı okuma.
 * Sorgu deterministik sıralanmış olmalıdır. Hata varsa tüm sonuç hata olarak döner.
 */
export async function loadAll<T>(
  make: (from: number, to: number) => PromiseLike<PageResult<T>>,
  { pageSize = 1000, maxRows = 20_000 }: { pageSize?: number; maxRows?: number } = {},
): Promise<Loaded<T[]>> {
  const out: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const r = await load<T[]>(make(from, from + pageSize - 1));
    if (r.error) return { data: null, error: r.error, count: null };
    const rows = r.data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return { data: out, error: null, count: out.length };
}

// ---------------------------------------------------------------------------
// Satış dönem toplamları ve grafik kovaları
// ---------------------------------------------------------------------------
export interface SalesTotals {
  sales: number;
  quantity: number;
  revenue: number;
  profit: number;
}

export interface SalesPoint {
  /** YYYY-MM-DD (günlük) veya YYYY-MM (aylık) */
  key: string;
  /** Kovanın seçilen dönem içindeki gerçek ilk ve son günü (YYYY-AA-GG) */
  from: string;
  to: string;
  /** Aylık kırılımda ay dönem sınırında kesiliyorsa (ayın tamamı sayılmıyorsa) true */
  partial: boolean;
  sale_count: number;
  quantity: number;
  revenue_try: number;
  gross_profit_try: number;
}

const ZERO: SalesTotals = { sales: 0, quantity: 0, revenue: 0, profit: 0 };

export function sumSales(rows: SalesPeriodRow[], from: string, to: string): SalesTotals {
  return rows.reduce<SalesTotals>((acc, r) => {
    const day = r.day ?? "";
    if (day < from || day > to) return acc;
    return {
      sales: acc.sales + Number(r.sale_count ?? 0),
      quantity: acc.quantity + Number(r.quantity ?? 0),
      revenue: acc.revenue + Number(r.revenue_try ?? 0),
      profit: acc.profit + Number(r.gross_profit_try ?? 0),
    };
  }, ZERO);
}

/** Ayın son günü (YYYY-AA-GG); ay anahtarı YYYY-AA. */
function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0, 12)).toISOString().slice(0, 10);
}

/**
 * Seçilen dönemin tüm günleri/ayları; satış olmayan kovalar 0 ile doldurulur. Aylık kırılımda
 * dönemin ilk ve son ayı yalnız dönem içindeki günleri kapsar (from/to, partial).
 */
export function salesSeries(rows: SalesPeriodRow[], period: Period, granularity: Granularity): SalesPoint[] {
  const keys = buckets(period.from, period.to, granularity);
  const map = new Map<string, SalesPoint>(
    keys.map((k) => {
      let from = k;
      let to = k;
      let partial = false;
      if (granularity === "aylik") {
        const start = `${k}-01`;
        const end = monthEnd(k);
        from = start < period.from ? period.from : start;
        to = end > period.to ? period.to : end;
        partial = from !== start || to !== end;
      }
      return [k, { key: k, from, to, partial, sale_count: 0, quantity: 0, revenue_try: 0, gross_profit_try: 0 }];
    }),
  );
  for (const r of rows) {
    const day = r.day ?? "";
    if (day < period.from || day > period.to) continue;
    const p = map.get(granularity === "gunluk" ? day : day.slice(0, 7));
    if (!p) continue;
    p.sale_count += Number(r.sale_count ?? 0);
    p.quantity += Number(r.quantity ?? 0);
    p.revenue_try += Number(r.revenue_try ?? 0);
    p.gross_profit_try += Number(r.gross_profit_try ?? 0);
  }
  return keys.map((k) => map.get(k)!);
}

// ---------------------------------------------------------------------------
// Ürün bazlı satış (sales_by_variant → ürün)
// ---------------------------------------------------------------------------
export interface VariantSalesRow {
  variant_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  variant_code: string;
  variant_name: string;
  display_name: string;
  sale_count: number;
  quantity: number;
  revenue_try: number;
  gross_profit_try: number;
}

export interface ProductSales {
  product_id: string;
  product_name: string;
  product_code: string;
  variants: number;
  quantity: number;
  revenue_try: number;
  gross_profit_try: number;
}

export function salesByProduct(rows: VariantSalesRow[]): ProductSales[] {
  const map = new Map<string, ProductSales>();
  for (const r of rows) {
    const p = map.get(r.product_id) ?? {
      product_id: r.product_id,
      product_name: r.product_name,
      product_code: r.product_code,
      variants: 0,
      quantity: 0,
      revenue_try: 0,
      gross_profit_try: 0,
    };
    p.variants += 1;
    p.quantity += Number(r.quantity ?? 0);
    p.revenue_try += Number(r.revenue_try ?? 0);
    p.gross_profit_try += Number(r.gross_profit_try ?? 0);
    map.set(r.product_id, p);
  }
  return [...map.values()];
}

// ---------------------------------------------------------------------------
// Ürün durumu tablosu: URL filtreleri (sunucuda, bellekte; varyant sayısı sınırlı)
// ---------------------------------------------------------------------------
export const STOCK_SORTABLE = [
  "product_name",
  "opening_qty",
  "produced_qty",
  "heatemp_qty",
  "mekonsis_qty",
  "sold_qty",
  "total_remaining",
] as const;
type StockSort = (typeof STOCK_SORTABLE)[number];

export const STOCK_TABLE_KEYS = ["q", "durum", "kapsam", "sayfa", "adet", "sirala", "yon"] as const;

const SEVERITY: Record<VariantOverview["stock_status"], number> = { critical: 0, low: 1, below_target: 2, ok: 3 };

export function hasHistory(r: VariantOverview) {
  return (
    r.produced_qty > 0 || r.opening_qty > 0 || r.total_remaining > 0 || r.sold_qty > 0 || r.in_production_qty > 0 || r.delivered_qty > 0
  );
}

const byName = (a: VariantOverview, b: VariantOverview) =>
  a.product_name.localeCompare(b.product_name, "tr") || a.variant_name.localeCompare(b.variant_name, "tr");

export function filterStockRows(
  all: VariantOverview[],
  v: Record<string, string>,
  sort: string | null,
  dir: "asc" | "desc",
): VariantOverview[] {
  const kapsam = v.kapsam ?? "";
  const q = (v.q ?? "").toLocaleLowerCase("tr-TR").trim();
  const durum = v.durum ?? "";
  const rows = all.filter((r) => {
    if (kapsam === "aktif" && !r.is_active) return false;
    if (kapsam === "" && !hasHistory(r)) return false;
    if (durum === "risk" && r.stock_status !== "critical" && r.stock_status !== "low") return false;
    if (durum && durum !== "risk" && r.stock_status !== durum) return false;
    if (q) {
      const hay = `${r.product_name} ${r.variant_name} ${r.product_code} ${r.variant_code}`.toLocaleLowerCase("tr-TR");
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  const key = (STOCK_SORTABLE as readonly string[]).includes(sort ?? "") ? (sort as StockSort) : "product_name";
  const sign = dir === "asc" ? 1 : -1;
  return rows.sort((a, b) => {
    if (key === "product_name") return sign * byName(a, b);
    return sign * (Number(a[key]) - Number(b[key])) || byName(a, b);
  });
}

/** Operasyon listesi için kritik/minimum altı aktif varyantlar: önce en ciddi, sonra hareketi olanlar. */
export function riskRows(all: VariantOverview[]): VariantOverview[] {
  return all
    .filter((r) => r.is_active && (r.stock_status === "critical" || r.stock_status === "low"))
    .sort(
      (a, b) =>
        SEVERITY[a.stock_status] - SEVERITY[b.stock_status] ||
        Number(hasHistory(b)) - Number(hasHistory(a)) ||
        a.total_remaining - b.total_remaining ||
        byName(a, b),
    );
}

/** Tarih dizisinin (YYYY-AA-GG) en küçük ve en büyüğü. */
export function dateSpan(dates: string[]): { min: string; max: string } | null {
  const valid = dates.filter(Boolean).sort();
  return valid.length ? { min: valid[0], max: valid[valid.length - 1] } : null;
}
