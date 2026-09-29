// Kurumsal müşteriler ekranının veri tipleri (v_customer_list, customers_overview, customer_summary).

export interface CustomerListRow {
  id: string;
  name: string;
  tax_number: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
  quote_count: number;
  open_quote_count: number;
  converted_quote_count: number;
  cancelled_quote_count: number;
  last_quote_date: string | null;
  /** Açık tekliflerin USD tutarı (USD teklif yoksa null) */
  open_amount_usd: number | null;
  /** Açık tekliflerin TL tutarı (TL teklif yoksa null) */
  open_amount_try: number | null;
  /** Yalnız gerçekleşmiş satışlar */
  sale_count: number;
  cancelled_sale_count: number;
  sold_qty: number;
  revenue_try: number;
  revenue_usd: number;
  cogs_try: number;
  gross_profit_try: number;
  margin_pct: number | null;
  first_sold_on: string | null;
  last_sold_on: string | null;
}

export interface OverviewPoint {
  month: string;
  customer_revenue_try: number;
  other_revenue_try: number;
  customer_profit_try: number;
  customer_sale_count: number;
  other_sale_count: number;
}

export interface CustomersOverview {
  /** Tüm müşterilerin özet sayıları (SQL'de toplanır; liste sayfalamasından bağımsız) */
  customers: {
    customer_count: number;
    active_count: number;
    buyer_count: number;
    quote_count: number;
    open_quote_count: number;
    converted_quote_count: number;
    cancelled_quote_count: number;
    open_amount_usd: number | null;
    open_amount_try: number | null;
    /** Müşteri satırlarının cirosu toplamı (gerçekleşmiş satışlar) */
    revenue_try: number;
  };
  /** Ciroya göre ilk 6 müşteri */
  top: Pick<CustomerListRow, "id" | "name" | "sale_count" | "revenue_try" | "gross_profit_try" | "margin_pct">[];
  totals: {
    revenue_try: number;
    customer_revenue_try: number;
    customer_profit_try: number;
    sale_count: number;
    customer_sale_count: number;
  };
  /** Seri dönemi toplamları (tek seferde yuvarlanmış) */
  period: {
    customer_revenue_try: number;
    other_revenue_try: number;
    customer_sale_count: number;
    other_sale_count: number;
  };
  series: OverviewPoint[];
}

export interface CustomerMonthPoint {
  month: string;
  sale_count: number;
  quantity: number;
  revenue_try: number;
  gross_profit_try: number;
}

export interface CustomerVariantRow {
  variant_id: string;
  product_id: string;
  display_name: string;
  sale_count: number;
  quantity: number;
  revenue_try: number;
  gross_profit_try: number;
}

/** quote_estimates(p_quote_ids): teklif başına tahmini kâr özeti (kalemsiz) */
export interface QuoteEstimateSummary {
  quote_id: string;
  revenue_try: number | null;
  cost_try: number | null;
  gross_profit_try: number | null;
  margin_pct: number | null;
  has_shortage: boolean;
  cost_unknown: boolean;
}

/** quote_item_options(p_include): kalem formu önizlemesi için varyant başına tek satır */
export interface QuoteItemOptionRow {
  variant_id: string;
  display_name: string;
  is_active: boolean;
  sale_price: number | null;
  currency: "USD" | "TRY";
  mekonsis_qty: number;
  /** FIFO sırasıyla [kalan adet, birim maliyet TL] */
  layers: [number, number][];
  last_unit_cost_try: number | null;
}

export interface CustomerSummary {
  /** Seri dönemi toplamları (tek seferde yuvarlanmış) */
  period: { sale_count: number; quantity: number; revenue_try: number; gross_profit_try: number };
  series: CustomerMonthPoint[];
  by_variant: CustomerVariantRow[];
  variant_count: number;
}
