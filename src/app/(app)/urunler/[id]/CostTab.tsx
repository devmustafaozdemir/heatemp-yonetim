import Link from "next/link";
import { CostChange } from "@/components/status";
import { Card, ErrorState, TableWrap } from "@/components/ui";
import type { AuthContext } from "@/lib/auth";
import { fmtDate, fmtMinutes, fmtMoney, fmtPct, fmtUnitMoney } from "@/lib/format";
import { parseListParams, type SearchParams } from "@/lib/list-params";
import { load } from "@/lib/query";
import type { Product, VariantOverview, VariantView } from "@/lib/types";
import { BATCH_SORTABLE, BatchHistoryCard, OpeningBatchesCard, loadCostPoints } from "../_components/Batches";
import { SourceTag, priceMinusEstimate } from "../_components/bits";
import { CostHistoryChart } from "../_components/CostHistoryChart";
import type { RecipeCostRow } from "../_components/types";

export async function CostTab({ ctx, product, variants, sp }: { ctx: AuthContext; product: Product; variants: VariantView[]; sp: SearchParams }) {
  const lp = parseListParams(sp, { sortable: BATCH_SORTABLE, defaultSort: "completed_at" });
  const scope = { column: "product_id" as const, value: product.id };
  const [overview, recipes, points] = await Promise.all([
    load(
      ctx.supabase
        .from("v_variant_overview")
        .select("variant_id, last_batch_no, last_completed_at, last_unit_cost_usd, last_unit_cost_try, prev_batch_no, unit_cost_usd_change_pct")
        .eq("product_id", product.id)
        .returns<VariantOverview[]>(),
    ),
    load(ctx.supabase.from("v_variant_recipe_cost").select("*").eq("product_id", product.id).returns<RecipeCostRow[]>()),
    loadCostPoints(ctx, scope),
  ]);
  const ov = new Map((overview.data ?? []).map((o) => [o.variant_id, o]));
  const rc = new Map((recipes.data ?? []).map((r) => [r.variant_id, r]));
  const lastBatchId = new Map<string, string>();
  for (const p of points.data ?? []) lastBatchId.set(`${p.variant_id}:${p.batch_no}`, p.id);
  const error = overview.error ?? recipes.error;

  return (
    <div className="grid gap-4">
      <Card
        title="Fiyat ve maliyet karşılaştırması (1 adet)"
        description="Üç farklı kavram ayrı gösterilir: tanımlı satış fiyatı, tahmini reçete maliyeti ve gerçekleşmiş parti maliyeti."
        padded={false}
        footer={
          <span>
            <strong className="text-ink-soft">Tanımlı satış fiyatı</strong>: ürün/varyant kartındaki fiyat ·{" "}
            <strong className="text-ink-soft">Tahmini reçete maliyeti</strong>: güncel ortalama malzeme maliyetiyle ·{" "}
            <strong className="text-ink-soft">Gerçekleşmiş parti maliyeti</strong>: tamamlanmış son üretim partisine sabitlenen maliyet
            (açılış stoğu hariç).
          </span>
        }
      >
        {error ? (
          <ErrorState message={error} compact />
        ) : (
          <TableWrap className="relative">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Varyant</th>
                  <th className="num whitespace-normal">Tanımlı satış fiyatı</th>
                  <th className="num whitespace-normal">Tahmini reçete maliyeti</th>
                  <th className="num whitespace-normal">Gerçekleşmiş parti maliyeti</th>
                  <th className="num" title="Son iki tamamlanmış üretim partisi arasındaki USD birim maliyet değişimi">
                    Son değişim
                  </th>
                  <th className="num whitespace-normal" title="Tanımlı satış fiyatı ile tahmini reçete maliyeti arasındaki fark (fiyatın para biriminde)">
                    Fiyat − tahmini maliyet
                  </th>
                  <th className="num whitespace-normal">Birim üretim süresi</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => {
                  const o = ov.get(v.id);
                  const r = rc.get(v.id);
                  const m = priceMinusEstimate(v.sale_price, v.currency, r);
                  const batchId = o?.last_batch_no ? lastBatchId.get(`${v.id}:${o.last_batch_no}`) : undefined;
                  return (
                    <tr key={v.id}>
                      <td className="min-w-40">
                        <Link href={`/urunler/${product.id}/varyant/${v.id}?sekme=maliyet`} className="link">
                          {v.variant_name}
                        </Link>
                        <div className="code mt-0.5 text-ink-muted">{v.variant_code}</div>
                      </td>
                      <td className="num">
                        <div>{fmtMoney(v.sale_price, v.currency)}</div>
                        <SourceTag overridden={v.price_overridden} />
                      </td>
                      <td className="num">
                        {r && r.bom_line_count > 0 ? (
                          <>
                            {fmtUnitMoney(r.est_unit_cost_usd, "USD")}
                            <div className="text-xs text-ink-muted">{fmtUnitMoney(r.est_unit_cost_try, "TRY")}</div>
                            {!r.cost_complete ? <div className="text-xs text-amber-700">bazı malzemelerin maliyeti yok</div> : null}
                          </>
                        ) : (
                          <span className="text-xs text-ink-muted">Reçete yok</span>
                        )}
                      </td>
                      <td className="num">
                        {o?.last_batch_no ? (
                          <>
                            {fmtUnitMoney(o.last_unit_cost_usd, "USD")}
                            <div className="text-xs text-ink-muted">{fmtUnitMoney(o.last_unit_cost_try, "TRY")}</div>
                            <div className="text-xs">
                              {batchId ? (
                                <Link href={`/uretim/${batchId}`} className="link font-mono">
                                  {o.last_batch_no}
                                </Link>
                              ) : (
                                <span className="code">{o.last_batch_no}</span>
                              )}
                            </div>
                            <div className="text-xs text-ink-muted">{fmtDate(o.last_completed_at)}</div>
                          </>
                        ) : (
                          <span className="text-xs text-ink-muted">Tamamlanmış üretim yok</span>
                        )}
                      </td>
                      <td className="num">{o?.last_batch_no ? <CostChange pct={o.unit_cost_usd_change_pct} prev={o.prev_batch_no} /> : "—"}</td>
                      <td className="num">
                        {m ? (
                          <>
                            <span className={m.diff < 0 ? "font-medium text-red-600" : "font-medium text-ink"}>{fmtUnitMoney(m.diff, v.currency)}</span>
                            {m.pct !== null ? <div className="text-xs text-ink-muted">fiyata göre {fmtPct(m.pct)}</div> : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="num">
                        <div>{fmtMinutes(v.unit_production_minutes)}</div>
                        <SourceTag overridden={v.minutes_overridden} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Card
        title="Gerçekleşmiş parti birim maliyeti"
        description="Tamamlanmış üretim partileri (son 120), tamamlanma tarihine göre. Varyant başına bir çizgi."
      >
        {points.error ? <ErrorState message={points.error} compact /> : <CostHistoryChart points={points.data ?? []} />}
      </Card>

      <BatchHistoryCard ctx={ctx} scope={scope} basePath={`/urunler/${product.id}`} lp={lp} keep={{ sekme: "maliyet" }} showVariant={variants.length > 1} />
      <OpeningBatchesCard ctx={ctx} scope={scope} showVariant={variants.length > 1} />
    </div>
  );
}
