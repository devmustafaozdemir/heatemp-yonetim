import type { MaterialView, UnitKind } from "@/lib/types";

/** v_material_list satırı (20260929093000_hammadde_ozet.sql). */
export type MaterialStockState = "out_used" | "short" | "out" | "ok";

export interface MaterialListRow extends MaterialView {
  created_at: string;
  /** Malzemeyi kullanan aktif reçete (aktif ürünün aktif varyantı) sayısı */
  active_bom_count: number;
  /** Aktif reçetelerdeki en büyük 1 adetlik ihtiyaç (temel birim) */
  max_qty_per_unit: number | null;
  /** Mevcut stok, en çok kullanan aktif reçetede (yalnız bu malzemeyle) kaç adete yeter */
  min_units_coverable: number | null;
  stock_state: MaterialStockState;
  state_rank: number;
}

/** Stok girişi / düşümü formlarının ihtiyaç duyduğu malzeme bilgisi. */
export interface MaterialOption {
  id: string;
  code: string;
  name: string;
  unit_kind: UnitKind;
  base_unit: string;
  display_unit: string;
  display_factor: number;
  qty: number;
  qty_display: number;
  value_try: number;
  avg_cost_try_display: number | null;
  avg_cost_usd_display: number | null;
  /** Önerilen KDV oranı (%); yüklenmediyse 20 varsayılır */
  vat_rate?: number;
}

export function toOption(m: MaterialView): MaterialOption {
  return {
    id: m.id,
    code: m.code,
    name: m.name,
    unit_kind: m.unit_kind,
    base_unit: m.base_unit,
    display_unit: m.display_unit,
    display_factor: Number(m.display_factor),
    qty: Number(m.qty),
    qty_display: Number(m.qty_display),
    value_try: Number(m.value_try),
    avg_cost_try_display: m.avg_cost_try_display === null ? null : Number(m.avg_cost_try_display),
    avg_cost_usd_display: m.avg_cost_usd_display === null ? null : Number(m.avg_cost_usd_display),
  };
}

/** material_monthly_flows() satırı */
export interface MonthlyFlowRow {
  month_start: string;
  movement_type: "purchase" | "production_consume" | "production_return" | "write_off";
  movement_count: number;
  qty: number;
  value_try: number;
  value_usd: number;
}
