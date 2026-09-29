import { buckets, type Granularity, type Period } from "@/lib/period";
import { load, type Loaded } from "@/lib/query";
import type { SalesPeriodRow, VariantOverview } from "@/lib/types";

// Kasa ekranına özel veri yardımcıları (sunucu tarafı). Tüm hesaplar Dashboard ile aynı
// görünümlerden türetilir: v_sales_daily, sales_by_variant, v_variant_overview, v_financial_summary.

type PageResult<T> = { data: T[] | null; error: unknown };

/**
 * PostgREST satır sınırını (max_rows) aşabilecek sorgular için sayfalı okuma.
 * Sorgu deterministik sıralanmış olmalıdır. Herhangi bir sayfada hata varsa sonuç hatadır.
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

/** Türkiye günü (UTC+3) başlangıcının UTC karşılığı: timestamptz filtreleri için. */
export function trDayStartUtc(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00+03:00`);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Dönem toplamları ve grafik kovaları (yalnız status = completed satışlar)
// ---------------------------------------------------------------------------
export interface SalesTotals {
  sales: number;
  quantity: number;
  revenue: number;
  cogs: number;
  profit: number;
}

export function sumSales(rows: SalesPeriodRow[], from: string, to: string): SalesTotals {
  const acc: SalesTotals = {
    sales: 0,
    quantity: 0,
    revenue: 0,
    cogs: 0,
    profit: 0,
  };
  for (const r of rows) {
    const day = r.day ?? "";
    if (day < from || day > to) continue;
    acc.sales += Number(r.sale_count ?? 0);
    acc.quantity += Number(r.quantity ?? 0);
    acc.revenue += Number(r.revenue_try ?? 0);
    acc.cogs += Number(r.cogs_try ?? 0);
    acc.profit += Number(r.gross_profit_try ?? 0);
  }
  return acc;
}

/**
 * Dönem toplamları sales_by_variant sonucundan (4 ondalık). Kartlar ve karşılaştırma tablosu bu toplamı
 * kullanır; böylece ürün tablosunun Toplam satırı ve tüm zamanlar özetiyle kuruşu kuruşuna aynıdır
 * (v_sales_daily her günü 2 ondalığa yuvarladığından günlük toplamların toplamı birkaç kuruş sapabilir).
 * Satış sayısı varyant satırlarından toplanamaz (çok kalemli satış birden çok varyantta sayılır);
 * bu yüzden v_sales_daily'den gelen satış sayısı ayrıca verilir.
 */
export function totalsFromVariants(rows: VariantSalesRow[], saleCount: number): SalesTotals {
  const acc: SalesTotals = { sales: saleCount, quantity: 0, revenue: 0, cogs: 0, profit: 0 };
  for (const r of rows) {
    acc.quantity += Number(r.quantity ?? 0);
    acc.revenue += Number(r.revenue_try ?? 0);
    acc.cogs += Number(r.cogs_try ?? 0);
    acc.profit += Number(r.gross_profit_try ?? 0);
  }
  return acc;
}

export function marginOf(t: { revenue: number; profit: number }): number | null {
  return t.revenue > 0 ? (t.profit / t.revenue) * 100 : null;
}

export interface FinancePoint {
  /** YYYY-MM-DD (günlük) veya YYYY-MM (aylık) */
  key: string;
  sale_count: number;
  quantity: number;
  revenue_try: number;
  cogs_try: number;
  gross_profit_try: number;
}

/** Seçilen dönemin tüm günleri/ayları; satış olmayan kovalar 0 ile doldurulur. */
export function financeSeries(rows: SalesPeriodRow[], period: Period, granularity: Granularity): FinancePoint[] {
  const keys = buckets(period.from, period.to, granularity);
  const map = new Map<string, FinancePoint>(
    keys.map((k) => [
      k,
      {
        key: k,
        sale_count: 0,
        quantity: 0,
        revenue_try: 0,
        cogs_try: 0,
        gross_profit_try: 0,
      },
    ]),
  );
  for (const r of rows) {
    const day = r.day ?? "";
    if (day < period.from || day > period.to) continue;
    const p = map.get(granularity === "gunluk" ? day : day.slice(0, 7));
    if (!p) continue;
    p.sale_count += Number(r.sale_count ?? 0);
    p.quantity += Number(r.quantity ?? 0);
    p.revenue_try += Number(r.revenue_try ?? 0);
    p.cogs_try += Number(r.cogs_try ?? 0);
    p.gross_profit_try += Number(r.gross_profit_try ?? 0);
  }
  return keys.map((k) => map.get(k)!);
}

// ---------------------------------------------------------------------------
// Üretim: seçilen dönemde başlatılan / tamamlanan gerçek üretim partileri
// ---------------------------------------------------------------------------
export interface ProductionBatchRow {
  id: string;
  status: "in_production" | "completed" | "cancelled";
  quantity: number;
  total_cost_try: number | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface ProductionTotals {
  startedBatches: number;
  startedQty: number;
  /** Başlatılan (iptal edilmemiş) partilerin malzeme maliyeti */
  startedCost: number;
  completedBatches: number;
  completedQty: number;
}

export function sumProduction(rows: ProductionBatchRow[], from: string, to: string): ProductionTotals {
  const lo = trDayStartUtc(from);
  const hi = trDayStartUtc(nextDay(to));
  const inRange = (ts: string | null) => {
    if (!ts) return false;
    const iso = new Date(ts).toISOString();
    return iso >= lo && iso < hi;
  };
  const acc: ProductionTotals = {
    startedBatches: 0,
    startedQty: 0,
    startedCost: 0,
    completedBatches: 0,
    completedQty: 0,
  };
  for (const b of rows) {
    if (b.status === "cancelled") continue;
    if (inRange(b.started_at)) {
      acc.startedBatches += 1;
      acc.startedQty += Number(b.quantity);
      acc.startedCost += Number(b.total_cost_try ?? 0);
    }
    if (b.status === "completed" && inRange(b.completed_at)) {
      acc.completedBatches += 1;
      acc.completedQty += Number(b.quantity);
    }
  }
  return acc;
}

function nextDay(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Ürün bazlı finans tablosu: dönem satışları (sales_by_variant) + güncel stok/üretim
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
  revenue_usd: number;
  cogs_try: number;
  cogs_usd: number;
  gross_profit_try: number;
  gross_profit_usd: number;
}

export interface FinanceRow {
  variant_id: string;
  product_id: string;
  product_name: string;
  product_code: string;
  variant_name: string;
  variant_code: string;
  is_active: boolean;
  // Seçilen dönem
  sale_count: number;
  quantity: number;
  revenue: number;
  cogs: number;
  profit: number;
  profit_usd: number;
  revenue_usd: number;
  margin: number | null;
  // Tüm zamanlar / güncel
  produced_qty: number;
  opening_qty: number;
  in_production_qty: number;
  heatemp_qty: number;
  mekonsis_qty: number;
  total_remaining: number;
  stock_value: number;
}

export const FINANCE_SORTABLE = ["urun", "adet", "ciro", "maliyet", "kar", "marj", "uretilen", "acilis", "kalan", "stok"] as const;
export type FinanceSort = (typeof FINANCE_SORTABLE)[number];

/** Tabloya ait URL anahtarları (dönem değişirken korunur). */
export const FINANCE_TABLE_KEYS = ["kapsam", "sirala", "yon"] as const;

function hasHistory(r: VariantOverview) {
  return r.produced_qty > 0 || r.opening_qty > 0 || r.total_remaining > 0 || r.sold_qty > 0 || r.in_production_qty > 0;
}

export function buildFinanceRows(sales: VariantSalesRow[], overview: VariantOverview[], scope: "donem" | "tumu"): FinanceRow[] {
  const bySales = new Map(sales.map((s) => [s.variant_id, s]));
  const rows: FinanceRow[] = [];
  const seen = new Set<string>();
  for (const o of overview) {
    const s = bySales.get(o.variant_id);
    if (scope === "donem" ? !s : !s && !hasHistory(o)) continue;
    seen.add(o.variant_id);
    rows.push(toRow(s ?? null, o));
  }
  // Görünümde bulunmayan (olağan dışı) satış satırları da gösterilir; satış kaybolmaz.
  for (const s of sales) if (!seen.has(s.variant_id)) rows.push(toRow(s, null));
  return rows;
}

function toRow(s: VariantSalesRow | null, o: VariantOverview | null): FinanceRow {
  const revenue = Number(s?.revenue_try ?? 0);
  const profit = Number(s?.gross_profit_try ?? 0);
  return {
    variant_id: (s?.variant_id ?? o?.variant_id)!,
    product_id: (s?.product_id ?? o?.product_id)!,
    product_name: (s?.product_name ?? o?.product_name)!,
    product_code: (s?.product_code ?? o?.product_code)!,
    variant_name: (s?.variant_name ?? o?.variant_name)!,
    variant_code: (s?.variant_code ?? o?.variant_code)!,
    is_active: o?.is_active ?? true,
    sale_count: Number(s?.sale_count ?? 0),
    quantity: Number(s?.quantity ?? 0),
    revenue,
    cogs: Number(s?.cogs_try ?? 0),
    profit,
    profit_usd: Number(s?.gross_profit_usd ?? 0),
    revenue_usd: Number(s?.revenue_usd ?? 0),
    margin: revenue > 0 ? (profit / revenue) * 100 : null,
    produced_qty: Number(o?.produced_qty ?? 0),
    opening_qty: Number(o?.opening_qty ?? 0),
    in_production_qty: Number(o?.in_production_qty ?? 0),
    heatemp_qty: Number(o?.heatemp_qty ?? 0),
    mekonsis_qty: Number(o?.mekonsis_qty ?? 0),
    total_remaining: Number(o?.total_remaining ?? 0),
    stock_value: Number(o?.finished_value_try ?? 0),
  };
}

/** Şirket geneli güncel stok ve tüm zamanlar üretim toplamları (tüm varyantlar). */
export interface StockTotals {
  variants: number;
  produced: number;
  opening: number;
  heatemp: number;
  mekonsis: number;
  remaining: number;
  stock: number;
}

export function stockTotals(overview: VariantOverview[]): StockTotals {
  const acc: StockTotals = { variants: overview.length, produced: 0, opening: 0, heatemp: 0, mekonsis: 0, remaining: 0, stock: 0 };
  for (const o of overview) {
    acc.produced += Number(o.produced_qty ?? 0);
    acc.opening += Number(o.opening_qty ?? 0);
    acc.heatemp += Number(o.heatemp_qty ?? 0);
    acc.mekonsis += Number(o.mekonsis_qty ?? 0);
    acc.remaining += Number(o.total_remaining ?? 0);
    acc.stock += Number(o.finished_value_try ?? 0);
  }
  return acc;
}

const SORT_VALUE: Record<Exclude<FinanceSort, "urun">, (r: FinanceRow) => number> = {
  adet: (r) => r.quantity,
  ciro: (r) => r.revenue,
  maliyet: (r) => r.cogs,
  kar: (r) => r.profit,
  marj: (r) => r.margin ?? Number.NEGATIVE_INFINITY,
  uretilen: (r) => r.produced_qty,
  acilis: (r) => r.opening_qty,
  kalan: (r) => r.total_remaining,
  stok: (r) => r.stock_value,
};

const byName = (a: FinanceRow, b: FinanceRow) =>
  a.product_name.localeCompare(b.product_name, "tr") || a.variant_name.localeCompare(b.variant_name, "tr");

export function sortFinanceRows(rows: FinanceRow[], sort: string | null, dir: "asc" | "desc"): FinanceRow[] {
  const key = (FINANCE_SORTABLE as readonly string[]).includes(sort ?? "") ? (sort as FinanceSort) : "ciro";
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "urun") return sign * byName(a, b);
    const get = SORT_VALUE[key];
    return sign * (get(a) - get(b)) || byName(a, b);
  });
}
