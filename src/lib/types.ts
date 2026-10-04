// Görünüm ve tablo satırları. Postgres numeric değerleri PostgREST'ten sayı
// olarak gelir; büyük değerlerde hassasiyet için hesaplar veritabanında yapılır.

export type Currency = "USD" | "TRY";
export type UnitKind = "count" | "mass" | "length" | "area" | "volume";

export interface Unit {
  code: string;
  kind: UnitKind;
  label: string;
  factor_to_base: number;
  is_base: boolean;
  sort_order: number;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  description: string | null;
  image_path: string | null;
  default_sale_price: number | null;
  default_currency: Currency;
  unit_production_minutes: number;
  critical_stock: number;
  min_stock: number;
  target_stock: number;
  is_active: boolean;
  created_at: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  code: string;
  name: string;
  sale_price: number | null;
  currency: Currency | null;
  unit_production_minutes: number | null;
  critical_stock: number | null;
  min_stock: number | null;
  target_stock: number | null;
  is_active: boolean;
}

export interface VariantView {
  id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  variant_code: string;
  variant_name: string;
  display_name: string;
  image_path: string | null;
  sale_price: number | null;
  currency: Currency;
  unit_production_minutes: number;
  critical_stock: number;
  min_stock: number;
  target_stock: number;
  price_overridden: boolean;
  minutes_overridden: boolean;
  thresholds_overridden: boolean;
  is_active: boolean;
  variant_is_active: boolean;
  product_is_active: boolean;
}

export interface MaterialView {
  id: string;
  code: string;
  name: string;
  kind: "raw" | "component";
  unit_kind: UnitKind;
  base_unit: string;
  display_unit: string;
  display_factor: number;
  notes: string | null;
  is_active: boolean;
  qty: number;
  qty_display: number;
  value_try: number;
  value_usd: number;
  avg_cost_try: number | null;
  avg_cost_usd: number | null;
  avg_cost_try_display: number | null;
  avg_cost_usd_display: number | null;
  last_purchase_on: string | null;
}

export interface MaterialMovement {
  id: number;
  material_id: string;
  movement_type: "purchase" | "purchase_reversal" | "production_consume" | "production_return" | "write_off";
  /** purchase_reversal: kapattığı alış hareketi */
  reverses_movement_id?: number | null;
  corrected_at?: string | null;
  supplier_id?: string | null;
  vat_rate?: number | null;
  vat_amount?: number | null;
  movement_date: string;
  qty: number;
  value_try: number;
  value_usd: number;
  unit_cost_try: number;
  unit_cost_usd: number;
  entry_qty: number | null;
  entry_unit: string | null;
  currency: Currency | null;
  unit_price: number | null;
  total_amount: number | null;
  fx_rate: number | null;
  supplier: string | null;
  note: string | null;
  batch_id: string | null;
  balance_qty_after: number;
  balance_value_try_after: number;
  created_at: string;
}

export interface BomItem {
  id: string;
  variant_id: string;
  material_id: string;
  entry_qty: number;
  entry_unit: string;
  qty_per_unit: number;
  note: string | null;
}

export interface SimulationLine {
  material_id: string;
  code: string;
  name: string;
  kind: "raw" | "component";
  base_unit: string;
  display_unit: string;
  display_factor: number;
  qty_per_unit: number;
  required: number;
  available: number;
  shortage: number;
  max_units: number;
  unit_cost_try: number | null;
  unit_cost_usd: number | null;
  cost_basis: "average" | "last_purchase" | "none";
  line_cost_try: number | null;
  line_cost_usd: number | null;
}

export interface Simulation {
  variant: {
    id: string;
    display_name: string;
    product_name: string;
    variant_name: string;
    sale_price: number | null;
    currency: Currency;
    is_active: boolean;
  };
  quantity: number;
  unit_production_minutes: number;
  estimated_minutes: number;
  has_bom: boolean;
  max_producible: number;
  all_available: boolean;
  can_start: boolean;
  cost_complete: boolean;
  total_cost_try: number | null;
  total_cost_usd: number | null;
  unit_cost_try: number | null;
  unit_cost_usd: number | null;
  lines: SimulationLine[];
}

export type BatchStatus = "in_production" | "completed" | "cancelled";

export interface BatchView {
  id: string;
  batch_no: string;
  variant_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  variant_code: string;
  variant_name: string;
  display_name: string;
  current_sale_price: number | null;
  current_currency: Currency;
  quantity: number;
  status: BatchStatus;
  started_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  unit_production_minutes: number;
  estimated_minutes: number;
  elapsed_minutes: number;
  actual_minutes: number | null;
  fx_rate_id: number;
  fx_rate: number;
  total_cost_try: number;
  total_cost_usd: number;
  unit_cost_try: number;
  unit_cost_usd: number;
  sale_price_snapshot: number | null;
  sale_currency_snapshot: Currency | null;
  note: string | null;
  prev_batch_no: string | null;
  prev_unit_cost_usd: number | null;
  prev_unit_cost_try: number | null;
  unit_cost_usd_change_pct: number | null;
  unit_cost_try_change_pct: number | null;
  heatemp_remaining: number | null;
  kind: "production" | "opening";
}

export interface BatchConsumption {
  id: number;
  batch_id: string;
  material_id: string;
  material_code: string;
  material_name: string;
  display_unit: string;
  display_factor: number;
  base_unit: string;
  qty_per_unit: number;
  qty: number;
  unit_cost_try: number;
  unit_cost_usd: number;
  total_try: number;
  total_usd: number;
  returned: boolean;
}

export interface HeatempShelfRow {
  layer_id: string;
  variant_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  variant_code: string;
  variant_name: string;
  display_name: string;
  batch_id: string;
  batch_no: string;
  completed_at: string;
  produced_qty: number;
  delivered_qty: number;
  qty_remaining: number;
  unit_cost_try: number;
  unit_cost_usd: number;
  value_try: number;
  value_usd: number;
  received_on: string;
}

export interface MekonsisShelfRow {
  layer_id: string;
  delivery_id: string;
  delivery_no: string;
  delivered_on: string;
  delivery_status: "active" | "cancelled";
  variant_id: string;
  product_id: string;
  display_name: string;
  product_code: string;
  variant_code: string;
  batch_id: string;
  batch_no: string;
  delivered_qty: number;
  sold_qty: number;
  qty_remaining: number;
  unit_cost_try: number;
  unit_cost_usd: number;
  value_try: number;
  value_usd: number;
}

export interface DeliveryView {
  id: string;
  delivery_no: string;
  delivered_on: string;
  variant_id: string;
  display_name: string;
  product_code: string;
  variant_code: string;
  quantity: number;
  status: "active" | "cancelled";
  note: string | null;
  cancel_reason: string | null;
  sold_qty: number;
  remaining_qty: number;
  delivered_cost_try: number;
  batches: string | null;
}

export interface SaleView {
  id: string;
  sale_no: string;
  sold_on: string;
  customer_id: string | null;
  customer_name: string | null;
  currency: Currency;
  fx_rate_id: number;
  fx_rate: number;
  fx_source: string;
  fx_rate_date: string;
  total_quantity: number;
  total_amount: number;
  revenue_try: number;
  revenue_usd: number;
  cogs_try: number;
  cogs_usd: number;
  gross_profit_try: number;
  gross_profit_usd: number;
  margin_pct: number | null;
  quote_id: string | null;
  status: "completed" | "cancelled";
  cancelled_at: string | null;
  cancel_reason: string | null;
  note: string | null;
  created_at: string;
  items_summary: string | null;
}

export interface SaleItemView {
  id: string;
  sale_id: string;
  variant_id: string;
  display_name: string;
  variant_code: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  revenue_try: number;
  revenue_usd: number;
  cogs_try: number;
  cogs_usd: number;
  gross_profit_try: number;
  gross_profit_usd: number;
  list_price: number | null;
  list_currency: Currency | null;
}

export interface SaleAllocationView {
  id: number;
  sale_id: string;
  sale_item_id: string;
  variant_id: string;
  batch_id: string;
  batch_no: string;
  delivery_id: string;
  delivery_no: string;
  delivered_on: string;
  quantity: number;
  unit_cost_try: number;
  unit_cost_usd: number;
  cost_try: number;
  cost_usd: number;
}

export interface VariantOverview {
  variant_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  variant_code: string;
  variant_name: string;
  display_name: string;
  is_active: boolean;
  sale_price: number | null;
  currency: Currency;
  unit_production_minutes: number;
  critical_stock: number;
  min_stock: number;
  target_stock: number;
  produced_qty: number;
  in_production_qty: number;
  delivered_qty: number;
  sold_qty: number;
  heatemp_qty: number;
  mekonsis_qty: number;
  total_remaining: number;
  stock_status: "critical" | "low" | "below_target" | "ok";
  heatemp_value_try: number;
  heatemp_value_usd: number;
  mekonsis_value_try: number;
  mekonsis_value_usd: number;
  finished_value_try: number;
  finished_value_usd: number;
  production_spend_try: number;
  production_spend_usd: number;
  wip_value_try: number;
  wip_value_usd: number;
  production_minutes: number;
  revenue_try: number;
  revenue_usd: number;
  cogs_try: number;
  cogs_usd: number;
  gross_profit_try: number;
  gross_profit_usd: number;
  margin_pct: number | null;
  last_sold_on: string | null;
  last_batch_no: string | null;
  last_completed_at: string | null;
  last_unit_cost_usd: number | null;
  last_unit_cost_try: number | null;
  prev_batch_no: string | null;
  prev_unit_cost_usd: number | null;
  prev_unit_cost_try: number | null;
  unit_cost_usd_change_pct: number | null;
  unit_cost_try_change_pct: number | null;
  opening_qty: number;
  opening_value_try: number;
}

export interface FinancialSummary {
  revenue_try: number;
  cogs_try: number;
  gross_profit_try: number;
  margin_pct: number | null;
  revenue_usd: number;
  cogs_usd: number;
  gross_profit_usd: number;
  production_spend_try: number;
  production_spend_usd: number;
  wip_value_try: number;
  heatemp_value_try: number;
  heatemp_value_usd: number;
  mekonsis_value_try: number;
  mekonsis_value_usd: number;
  finished_value_try: number;
  finished_value_usd: number;
  material_value_try: number;
  material_value_usd: number;
  produced_qty: number;
  sold_qty: number;
  heatemp_qty: number;
  mekonsis_qty: number;
  in_production_qty: number;
  opening_value_try: number;
}

export interface SalesPeriodRow {
  day?: string;
  month?: string;
  sale_count: number;
  quantity: number;
  revenue_try: number;
  cogs_try: number;
  gross_profit_try: number;
}

export interface Supplier {
  id: string;
  name: string;
  tax_number: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  is_active: boolean;
}

export interface SupplierListRow extends Supplier {
  purchase_count: number;
  material_count: number;
  total_try: number;
  total_usd: number;
  last_purchase_date: string | null;
  /** KDV toplamı (TL, alış günü kuruyla) */
  vat_try: number;
}

/** Alış formlarındaki tedarikçi seçimi */
export type SupplierOption = Pick<Supplier, "id" | "name" | "is_active">;

export interface Mold {
  id: string;
  name: string;
  code: string | null;
  price: number;
  currency: "USD" | "TRY";
  purchased_on: string | null;
  supplier_id: string | null;
  product_id: string | null;
  note: string | null;
  is_active: boolean;
}

export interface Customer {
  id: string;
  name: string;
  tax_number: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  is_active: boolean;
}

export interface QuoteView {
  id: string;
  quote_no: string;
  customer_id: string;
  customer_name: string;
  quote_date: string;
  valid_until: string | null;
  currency: Currency;
  status: "open" | "converted" | "cancelled";
  sale_id: string | null;
  sale_no: string | null;
  note: string | null;
  created_at: string;
  total_quantity: number;
  total_amount: number;
  item_count: number;
}

export interface QuoteEstimateLine {
  id: string;
  variant_id: string;
  display_name: string;
  quantity: number;
  unit_price: number;
  list_price: number | null;
  list_currency: Currency | null;
  discount_pct: number | null;
  line_total: number;
  mekonsis_available: number;
  shortage: number;
  revenue_try: number | null;
  revenue_usd: number | null;
  cost_try: number;
  cost_usd: number;
  cost_unknown: boolean;
  gross_profit_try: number | null;
  margin_pct: number | null;
}

export interface QuoteEstimate {
  quote_id: string;
  currency: Currency;
  fx: { id: number; rate: number; rate_date: string; source: string; is_valid: boolean } | null;
  lines: QuoteEstimateLine[];
  total_amount: number;
  revenue_try: number | null;
  revenue_usd: number | null;
  cost_try: number;
  cost_usd: number;
  gross_profit_try: number | null;
  margin_pct: number | null;
  has_shortage: boolean;
  cost_unknown: boolean;
}

export interface FxRateRow {
  id: number;
  rate: number;
  rate_date: string;
  source: "TCMB" | "FRANKFURTER" | "MANUAL";
  rate_type: string;
  fetched_at: string;
  last_checked_at: string;
  note: string | null;
}

export interface AppSettings {
  company_name: string;
  fx_primary_source: "TCMB" | "FRANKFURTER";
  fx_tcmb_rate_type: "ForexBuying" | "ForexSelling";
  fx_refresh_minutes: number;
  fx_max_age_days: number;
  show_usd_info: boolean;
  updated_at: string;
}
