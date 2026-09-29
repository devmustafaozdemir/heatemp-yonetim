import type { Currency } from "@/lib/types";

/** v_product_list satırı (20260929092000_urunler_liste.sql). */
export interface ProductListRow {
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
  variant_count: number;
  active_variant_count: number;
  variant_codes: string | null;
  total_remaining: number;
  heatemp_qty: number;
  mekonsis_qty: number;
  opening_qty: number;
  critical_variant_count: number;
  low_variant_count: number;
  below_target_variant_count: number;
  ok_variant_count: number;
  no_bom_variant_count: number;
  price_override_count: number;
  minutes_override_count: number;
  est_cost_usd_min: number | null;
  est_cost_usd_max: number | null;
  est_cost_try_min: number | null;
  est_cost_try_max: number | null;
  last_cost_usd_min: number | null;
  last_cost_usd_max: number | null;
  last_cost_try_min: number | null;
  last_cost_try_max: number | null;
  last_completed_at: string | null;
  worst_variant_code: string | null;
  worst_stock_status: "critical" | "low" | "below_target" | "ok" | null;
  worst_severity: number | null;
  worst_total_remaining: number | null;
  worst_critical_stock: number | null;
  worst_min_stock: number | null;
  worst_target_stock: number | null;
}

/** v_variant_recipe_cost satırı: 1 adetlik TAHMİNİ reçete maliyeti. */
export interface RecipeCostRow {
  variant_id: string;
  product_id: string;
  bom_line_count: number;
  cost_complete: boolean;
  est_unit_cost_try: number | null;
  est_unit_cost_usd: number | null;
}

export type MovementType =
  | "production_in"
  | "delivery_out"
  | "delivery_in"
  | "sale_out"
  | "sale_return"
  | "delivery_reversal_out"
  | "delivery_reversal_in";

/** stock_movements + ilişkili belge numaraları */
export interface MovementRow {
  id: number;
  movement_date: string;
  movement_type: MovementType;
  location: "heatemp" | "mekonsis";
  qty: number;
  unit_cost_try: number;
  unit_cost_usd: number;
  variant_id: string;
  batch_id: string;
  delivery_id: string | null;
  sale_id: string | null;
  created_at: string;
  production_batches: { batch_no: string; kind: "production" | "opening" } | null;
  deliveries: { delivery_no: string; status: "active" | "cancelled" } | null;
  sales: { sale_no: string; status: "completed" | "cancelled" } | null;
}

/** Maliyet geçmişi grafiği için tamamlanmış üretim partisi noktası */
export interface CostPoint {
  id: string;
  batch_no: string;
  variant_id: string;
  variant_name: string;
  completed_at: string;
  quantity: number;
  unit_cost_usd: number;
  unit_cost_try: number;
}
