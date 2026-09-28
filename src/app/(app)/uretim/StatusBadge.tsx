import { Badge } from "@/components/ui";
import type { BatchStatus } from "@/lib/types";

export function BatchStatusBadge({ status, kind }: { status: BatchStatus; kind?: "production" | "opening" }) {
  if (kind === "opening") return <Badge tone="blue">Açılış stoğu</Badge>;
  if (status === "completed") return <Badge tone="green">Tamamlandı</Badge>;
  if (status === "cancelled") return <Badge tone="gray">İptal</Badge>;
  return <Badge tone="amber">Üretimde</Badge>;
}

export function CostChange({ pct, prev }: { pct: number | null; prev: string | null }) {
  if (pct === null || pct === undefined) return <span className="text-xs text-slate-400">{prev ? "—" : "ilk parti"}</span>;
  const n = Number(pct);
  const tone = n > 0 ? "text-red-700" : n < 0 ? "text-emerald-700" : "text-slate-600";
  return (
    <span className={`tabular-nums ${tone}`} title={prev ? `Önceki tamamlanan parti: ${prev}` : undefined}>
      {n > 0 ? "▲ +" : n < 0 ? "▼ −" : ""}%{Math.abs(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}
    </span>
  );
}
