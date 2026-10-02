import { Tag } from "lucide-react";
import { StatCard } from "@/components/ui";
import { fmtDate, fmtInt, fmtMoney, fmtRate } from "@/lib/format";
import type { ShelfSaleSummary } from "./saleValue";

/** Raftaki stoğun satış fiyatıyla değeri (liste fiyatı × kalan adet, KDV hariç). */
export function SaleValueCard({ summary, error }: { summary: ShelfSaleSummary | null; error: string | null }) {
  if (error || !summary) {
    return <StatCard label="Satış değeri" icon={Tag} tone="teal" error={error ?? "Satış fiyatları yüklenemedi."} />;
  }
  const parts = [
    summary.usd > 0 ? fmtMoney(summary.usd, "USD") : null,
    summary.try > 0 ? fmtMoney(summary.try, "TRY") : null,
  ].filter(Boolean);
  return (
    <StatCard
      label="Satış değeri"
      scope="Liste fiyatıyla"
      value={summary.totalTry !== null ? fmtMoney(summary.totalTry, "TRY") : parts.join(" + ") || "—"}
      icon={Tag}
      tone="teal"
      description={
        <>
          {parts.length ? parts.join(" + ") : "Fiyatlı ürün yok"}
          {summary.rate && summary.usd > 0 ? ` · USD/TRY ${fmtRate(summary.rate)} (${fmtDate(summary.rateDate)})` : ""}
          {summary.unpricedVariants > 0 ? (
            <span className="block">
              {fmtInt(summary.unpricedVariants)} varyantın ({fmtInt(summary.unpricedQty)} adet) satış fiyatı tanımsız; hesaba girmedi
            </span>
          ) : null}
        </>
      }
    />
  );
}
