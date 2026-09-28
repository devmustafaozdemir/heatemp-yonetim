import { AlertOctagon, ArrowDownCircle, CheckCircle2, CircleDashed } from "lucide-react";
import { Badge } from "@/components/ui";
import type { VariantOverview } from "@/lib/types";

export const STOCK_STATUS = {
  critical: { tone: "red", label: "Kritik", icon: AlertOctagon },
  low: { tone: "orange", label: "Minimum altı", icon: ArrowDownCircle },
  below_target: { tone: "amber", label: "Hedef altı", icon: CircleDashed },
  ok: { tone: "green", label: "Yeterli", icon: CheckCircle2 },
} as const;

/** Stok durumu: renk + ikon + metin (yalnız renge dayanmaz). */
export function StockStatusBadge({
  row,
}: {
  row: Pick<VariantOverview, "stock_status" | "critical_stock" | "min_stock" | "target_stock" | "total_remaining">;
}) {
  const s = STOCK_STATUS[row.stock_status];
  return (
    <Badge
      tone={s.tone}
      icon={s.icon}
      title={`Toplam kalan ${row.total_remaining} · kritik ≤ ${row.critical_stock}, minimum ≤ ${row.min_stock}, hedef ${row.target_stock}`}
    >
      {s.label}
    </Badge>
  );
}
