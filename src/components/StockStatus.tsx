import { Badge } from "@/components/ui";
import type { VariantOverview } from "@/lib/types";

const MAP = {
  critical: { tone: "red", label: "Kritik", icon: "●" },
  low: { tone: "orange", label: "Minimum altı", icon: "▼" },
  below_target: { tone: "amber", label: "Hedef altı", icon: "◐" },
  ok: { tone: "green", label: "Yeterli", icon: "✓" },
} as const;

export function StockStatusBadge({ row }: { row: Pick<VariantOverview, "stock_status" | "critical_stock" | "min_stock" | "target_stock" | "total_remaining"> }) {
  const s = MAP[row.stock_status];
  return (
    <Badge
      tone={s.tone}
      title={`Toplam kalan ${row.total_remaining} · kritik ≤ ${row.critical_stock}, minimum ≤ ${row.min_stock}, hedef ${row.target_stock}`}
    >
      <span aria-hidden className="mr-1">
        {s.icon}
      </span>
      {s.label}
    </Badge>
  );
}
