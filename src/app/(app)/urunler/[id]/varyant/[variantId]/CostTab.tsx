import { Clock, Factory, FlaskConical, Tag } from "lucide-react";
import { Card, ErrorState, StatCard } from "@/components/ui";
import type { AuthContext } from "@/lib/auth";
import { fmtDate, fmtMinutes, fmtMoney, fmtUnitMoney } from "@/lib/format";
import { parseListParams, type SearchParams } from "@/lib/list-params";
import { BATCH_SORTABLE, BatchHistoryCard, OpeningBatchesCard, loadCostPoints } from "../../../_components/Batches";
import { priceMinusEstimate } from "../../../_components/bits";
import { CostHistoryChart } from "../../../_components/CostHistoryChart";
import type { VariantPageData } from "./types";

export async function VariantCostTab({ ctx, data, sp }: { ctx: AuthContext; data: VariantPageData; sp: SearchParams }) {
  const { product, variant, effective: e, sim, overview: o } = data;
  const lp = parseListParams(sp, { sortable: BATCH_SORTABLE, defaultSort: "completed_at" });
  const scope = { column: "variant_id" as const, value: variant.id };
  const points = await loadCostPoints(ctx, scope);
  const margin = sim?.has_bom
    ? priceMinusEstimate(e.sale_price, e.currency, { bom_line_count: sim.lines.length, est_unit_cost_usd: sim.unit_cost_usd, est_unit_cost_try: sim.unit_cost_try })
    : null;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tanımlı satış fiyatı"
          value={fmtMoney(e.sale_price, e.currency)}
          icon={Tag}
          tone="blue"
          description={e.price_overridden ? "Varyanta özel fiyat" : "Ürün varsayılanından (miras)"}
        />
        <StatCard
          label="Tahmini reçete maliyeti"
          value={sim?.has_bom ? fmtUnitMoney(sim.unit_cost_usd, "USD") : "—"}
          icon={FlaskConical}
          tone="violet"
          description={
            sim?.has_bom
              ? `${fmtUnitMoney(sim.unit_cost_try, "TRY")} · fiyat − maliyet ${margin ? fmtUnitMoney(margin.diff, e.currency) : "—"}`
              : data.simError ?? "Reçete tanımlı değil"
          }
        />
        <StatCard
          label="Gerçekleşmiş parti maliyeti"
          value={o?.last_batch_no ? fmtUnitMoney(o.last_unit_cost_usd, "USD") : "—"}
          icon={Factory}
          tone="teal"
          delta={o?.last_batch_no ? { pct: o.unit_cost_usd_change_pct, label: "önceki partiye göre", invert: true } : undefined}
          description={
            o?.last_batch_no ? `${o.last_batch_no} · ${fmtDate(o.last_completed_at)} · ${fmtUnitMoney(o.last_unit_cost_try, "TRY")}` : "Tamamlanmış üretim partisi yok"
          }
        />
        <StatCard
          label="Birim üretim süresi"
          value={fmtMinutes(e.unit_production_minutes)}
          icon={Clock}
          tone="amber"
          description={`${e.minutes_overridden ? "Varyanta özel" : "Ürün varsayılanı"}${Number(e.unit_production_minutes) > 0 ? ` · 100 adet ≈ ${fmtMinutes(Number(e.unit_production_minutes) * 100)}` : ""}`}
        />
      </div>

      <Card
        title="Gerçekleşmiş parti birim maliyeti"
        description={`Tamamlanmış üretim partileri (son 120). Kesikli çizgi: güncel tahmini reçete maliyeti. ${product.name} — ${variant.name}`}
      >
        {points.error ? (
          <ErrorState message={points.error} compact />
        ) : (
          <CostHistoryChart
            points={points.data ?? []}
            estimate={sim?.has_bom ? { usd: sim.unit_cost_usd, try: sim.unit_cost_try } : null}
          />
        )}
      </Card>

      <BatchHistoryCard ctx={ctx} scope={scope} basePath={`/urunler/${product.id}/varyant/${variant.id}`} lp={lp} keep={{ sekme: "maliyet" }} showVariant={false} />
      <OpeningBatchesCard ctx={ctx} scope={scope} showVariant={false} />
    </div>
  );
}
