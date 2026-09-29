import { AlertOctagon, ArrowDownCircle, CheckCircle2, CircleDashed, CircleSlash } from "lucide-react";
import { Badge } from "@/components/ui";
import type { VariantOverview } from "@/lib/types";

export const STOCK_STATUS = {
  none: { tone: "gray", label: "Stok girişi yok", icon: CircleSlash },
  critical: { tone: "red", label: "Kritik", icon: AlertOctagon },
  low: { tone: "orange", label: "Minimum altı", icon: ArrowDownCircle },
  below_target: { tone: "amber", label: "Hedef altı", icon: CircleDashed },
  ok: { tone: "green", label: "Yeterli", icon: CheckCircle2 },
} as const;

export type DisplayStockStatus = keyof typeof STOCK_STATUS;

type StockRow = Pick<VariantOverview, "stock_status" | "critical_stock" | "min_stock" | "target_stock" | "total_remaining"> &
  Partial<Pick<VariantOverview, "produced_qty" | "opening_qty" | "in_production_qty" | "delivered_qty">>;

/**
 * Ekranda gösterilecek stok durumu. Hiç stok girişi olmamış (üretim, açılış stoğu, üretimde parti
 * ve teslimat yok) varyant "Kritik" yerine "Stok girişi yok" olarak ayrılır; böylece gerçek kritik
 * stoklar uyarı kalabalığında kaybolmaz. Eşik mantığı (v_variant_overview.stock_status) değişmez.
 */
export function displayStockStatus(row: StockRow): DisplayStockStatus {
  const never =
    row.total_remaining === 0 &&
    row.produced_qty !== undefined &&
    (row.produced_qty ?? 0) === 0 &&
    (row.opening_qty ?? 0) === 0 &&
    (row.in_production_qty ?? 0) === 0 &&
    (row.delivered_qty ?? 0) === 0;
  return never ? "none" : row.stock_status;
}

/** Stok durumu: renk + ikon + metin (yalnız renge dayanmaz). */
export function StockStatusBadge({ row }: { row: StockRow }) {
  const key = displayStockStatus(row);
  const s = STOCK_STATUS[key];
  return (
    <Badge
      tone={s.tone}
      icon={s.icon}
      title={
        key === "none"
          ? "Bu varyant için henüz üretim, açılış stoğu veya teslimat kaydı yok"
          : `Toplam kalan ${row.total_remaining} · kritik ≤ ${row.critical_stock}, minimum ≤ ${row.min_stock}, hedef ${row.target_stock}`
      }
    >
      {s.label}
    </Badge>
  );
}
