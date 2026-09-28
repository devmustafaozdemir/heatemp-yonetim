import { AlertTriangle, ChevronRight } from "lucide-react";
import Link from "next/link";
import { StockStatusBadge } from "@/components/StockStatus";
import { Badge, Card, EmptyState, ErrorState, ProgressBar, TableWrap, buttonClass, cx } from "@/components/ui";
import type { AuthContext } from "@/lib/auth";
import { fmtInt, fmtMinutes, fmtMoney, fmtUnitMoney } from "@/lib/format";
import { load } from "@/lib/query";
import type { Product, VariantOverview, VariantView } from "@/lib/types";
import { SourceTag } from "../_components/bits";
import type { RecipeCostRow } from "../_components/types";

export async function VariantsTab({ ctx, product, variants }: { ctx: AuthContext; product: Product; variants: VariantView[] }) {
  const [overview, recipes] = await Promise.all([
    load(ctx.supabase.from("v_variant_overview").select("*").eq("product_id", product.id).returns<VariantOverview[]>()),
    load(ctx.supabase.from("v_variant_recipe_cost").select("*").eq("product_id", product.id).returns<RecipeCostRow[]>()),
  ]);
  const ov = new Map((overview.data ?? []).map((o) => [o.variant_id, o]));
  const rc = new Map((recipes.data ?? []).map((r) => [r.variant_id, r]));
  const error = overview.error ?? recipes.error;

  return (
    <Card
      title="Varyantlar"
      description="“Miras”: ürünün varsayılan değeri kullanılıyor · “Özel”: varyanta tanımlı değer. Stok = Heatemp + Mekonsis rafı."
      padded={false}
      actions={<span className="text-xs text-ink-muted">{fmtInt(variants.length)} varyant</span>}
    >
      {error ? <ErrorState message={error} compact /> : null}
      {variants.length === 0 ? (
        <EmptyState title="Varyant yok" />
      ) : (
        <TableWrap className="relative">
          <table className="table-base">
            <thead>
              <tr>
                <th>Varyant</th>
                <th className="num">Satış fiyatı</th>
                <th className="num">Birim süre</th>
                <th className="num" title="Kritik / minimum / hedef stok eşikleri">
                  Eşikler (K / M / H)
                </th>
                <th className="num">Stok (adet)</th>
                <th>Stok durumu</th>
                <th>Reçete</th>
                <th className="num" title="Son tamamlanan üretim partisinin birim maliyeti ve güncel tahmini reçete maliyeti">
                  Maliyet (USD)
                </th>
                <th>Durum</th>
                <th aria-label="İşlemler" />
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => {
                const o = ov.get(v.id);
                const r = rc.get(v.id);
                const href = `/urunler/${product.id}/varyant/${v.id}`;
                return (
                  <tr key={v.id}>
                    <td className="min-w-44">
                      <Link href={href} className="link">
                        {v.variant_name}
                      </Link>
                      <div className="code mt-0.5 text-ink-muted">{v.variant_code}</div>
                    </td>
                    <td className="num">
                      <div>{fmtMoney(v.sale_price, v.currency)}</div>
                      <SourceTag overridden={v.price_overridden} />
                    </td>
                    <td className="num">
                      <div>{fmtMinutes(v.unit_production_minutes)}</div>
                      <SourceTag overridden={v.minutes_overridden} />
                    </td>
                    <td className="num">
                      <div>
                        {fmtInt(v.critical_stock)} / {fmtInt(v.min_stock)} / {fmtInt(v.target_stock)}
                      </div>
                      <SourceTag overridden={v.thresholds_overridden} />
                    </td>
                    <td className="num min-w-32">
                      {o ? (
                        <>
                          <span className="font-semibold text-ink">{fmtInt(o.total_remaining)}</span>
                          <span className="text-xs text-ink-muted"> / hedef {fmtInt(o.target_stock)}</span>
                          <div className="mt-1 ml-auto w-24">
                            <ProgressBar
                              value={o.total_remaining}
                              max={o.target_stock}
                              tone={o.stock_status === "ok" ? "teal" : o.stock_status === "critical" ? "red" : "amber"}
                              label={`${v.variant_name}: stok / hedef`}
                            />
                          </div>
                          <div className="mt-0.5 text-[11px] text-ink-muted">
                            Heatemp {fmtInt(o.heatemp_qty)} · Mekonsis {fmtInt(o.mekonsis_qty)}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap">{o ? <StockStatusBadge row={o} /> : "—"}</td>
                    <td className="whitespace-nowrap">
                      {r && r.bom_line_count > 0 ? (
                        <span className="text-[13px]">{fmtInt(r.bom_line_count)} kalem</span>
                      ) : (
                        <Badge tone="amber" icon={AlertTriangle}>
                          Reçete yok
                        </Badge>
                      )}
                    </td>
                    <td className="num">
                      <dl className="ml-auto grid w-max grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-right">
                        <dt className="text-[11px] text-ink-muted">Son parti</dt>
                        <dd className="font-medium text-ink">{fmtUnitMoney(o?.last_unit_cost_usd, "USD")}</dd>
                        <dt className="text-[11px] text-ink-muted">Tahmini reçete</dt>
                        <dd>
                          {fmtUnitMoney(r?.est_unit_cost_usd, "USD")}
                          {r && r.bom_line_count > 0 && !r.cost_complete ? (
                            <AlertTriangle className="ml-1 inline size-3.5 text-amber-600" aria-label="Bazı malzemelerin maliyeti yok" />
                          ) : null}
                        </dd>
                      </dl>
                    </td>
                    <td>{v.is_active ? <Badge tone="green">Aktif</Badge> : <Badge>{v.variant_is_active ? "Ürün pasif" : "Pasif"}</Badge>}</td>
                    <td className="text-right">
                      <Link href={href} className={cx(buttonClass("ghost", "sm"), "size-8 px-0")} title="Varyant detayı" aria-label={`${v.variant_code} detayı`}>
                        <ChevronRight aria-hidden />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}
