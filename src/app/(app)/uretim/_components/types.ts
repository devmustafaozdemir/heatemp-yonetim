// Üretim ekranı özet tipleri (supabase/migrations/20260929094000_uretim_ozet.sql).

export interface BatchSummary {
  all_batches: number;
  in_production_batches: number;
  in_production_qty: number;
  wip_value_try: number;
  wip_value_usd: number;
  /** Yalnız gerçek üretim partileri (açılış stoğu hariç) */
  completed_batches: number;
  produced_qty: number;
  cancelled_batches: number;
  opening_batches: number;
  opening_qty: number;
  opening_value_try: number;
  opening_value_usd: number;
}

export interface ProductionMonthRow {
  month_start: string;
  started_batches: number;
  started_qty: number;
  completed_batches: number;
  completed_qty: number;
  completed_cost_try: number;
  completed_cost_usd: number;
  completed_estimated_minutes: number;
  completed_actual_minutes: number;
  cancelled_batches: number;
}

export interface ProductionByVariantRow {
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  display_name: string;
  batches: number;
  quantity: number;
  cost_try: number;
  cost_usd: number;
}

/** Grafik noktası (YYYY-MM) */
export interface MonthlyProductionPoint {
  month: string;
  startedQty: number;
  startedBatches: number;
  completedQty: number;
  completedBatches: number;
  costTry: number;
  costUsd: number;
  cancelledBatches: number;
}
