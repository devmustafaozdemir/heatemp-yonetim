import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { StockStatusBadge } from "@/components/StockStatus";
import { Badge, Card, EmptyState, ErrorState, TableWrap } from "@/components/ui";
import type { AuthContext } from "@/lib/auth";
import { fmtInt, fmtMinutes, fmtMoney, fmtUnitMoney } from "@/lib/format";
import { load } from "@/lib/query";
import type { Product, VariantOverview, VariantView } from "@/lib/types";
import { ShelfSplit, SourceTag, StockProgress } from "../_components/bits";
import type { RecipeCostRow } from "../_components/types";

export async function VariantsTab({ ctx, product, variants }: { ctx: AuthContext; product: Product; variants: VariantView[] }) {
  const [overview, recipes] = await Promise.all([
    load(ctx.supabase.from("v_variant_overview").select("*").eq("product_id", product.id).returns<VariantOverview[]>()),
    load(ctx.supabase.from("v_variant_recipe_cost").select("*").eq("product_id", product.id).returns<RecipeCostRow[]>()),
  ]);
  // Hata ≠ boş: yüklenemeyen kaynağa bağlı sütunlar hiç gösterilmez ("Reçete yok" / "—" gibi
  // yanıltıcı değerler üretilmez); tanım sütunları (fiyat, süre, eşik, durum) yine listelenir.
  const hasOv = !overview.error;
  const hasRc = !recipes.error;
  const ov = new Map((overview.data ?? []).map((o) => [o.variant_id, o]));
  const rc = new Map((recipes.data ?? []).map((r) => [r.variant_id, r]));

  return (
    <Card
      title="Varyantlar"
      description="“Miras”: ürünün varsayılan değeri kullanılıyor · “Özel”: varyanta tanımlı değer. Eşikler: kritik / minimum / hedef stok. Stok = Heatemp + Mekonsis rafı."
      padded={false}
      actions={<span className="text-xs text-ink-muted">{fmtInt(variants.length)} varyant</span>}
    >
      {overview.error ? (
        <div className="border-b border-line">
          <ErrorState message={overview.error} compact title="Stok bilgileri yüklenemedi" />
        </div>
      ) : null}
      {recipes.error ? (
        <div className="border-b border-line">
          <ErrorState message={recipes.error} compact title="Reçete ve tahmini maliyet bilgileri yüklenemedi" />
        </div>
      ) : null}
      {variants.length === 0 ? (
        <EmptyState title="Varyant yok" />
      ) : (
        <>
          <TableWrap className="relative hidden xl:block">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Varyant</th>
                  <th className="num">Satış fiyatı</th>
                  <th className="num">Birim süre</th>
                  <th className="num" title="Kritik / minimum / hedef stok eşikleri (K / M / H)">
                    Eşikler
                  </th>
                  {hasOv ? (
                    <>
                      <th className="num">Stok (adet)</th>
                      <th>Stok durumu</th>
                    </>
                  ) : null}
                  {hasRc ? <th>Reçete</th> : null}
                  {hasOv || hasRc ? (
                    <th className="num" title="Son tamamlanan üretim partisinin birim maliyeti ve güncel tahmini reçete maliyeti">
                      Maliyet (USD)
                    </th>
                  ) : null}
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
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="code text-ink-muted">{v.variant_code}</span>
                          {v.is_active ? <Badge tone="green">Aktif</Badge> : <Badge>{v.variant_is_active ? "Ürün pasif" : "Pasif"}</Badge>}
                        </div>
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
                        <div
                          className="whitespace-nowrap"
                          title={`Kritik ${fmtInt(v.critical_stock)} · Minimum ${fmtInt(v.min_stock)} · Hedef ${fmtInt(v.target_stock)}`}
                        >
                          {fmtInt(v.critical_stock)} / {fmtInt(v.min_stock)} / {fmtInt(v.target_stock)}
                        </div>
                        <SourceTag overridden={v.thresholds_overridden} />
                      </td>
                      {hasOv ? (
                        <>
                          <td className="num min-w-28">
                            {o ? (
                              <>
                                <span className="font-semibold text-ink">{fmtInt(o.total_remaining)}</span>
                                <span className="text-xs text-ink-muted"> / hedef {fmtInt(o.target_stock)}</span>
                                <div className="mt-1 ml-auto w-24">
                                  <StockProgress value={o.total_remaining} max={o.target_stock} status={o.stock_status} label={`${v.variant_name}: stok / hedef`} />
                                </div>
                                <div className="mt-0.5 text-[11px] leading-4 whitespace-nowrap text-ink-muted">Heatemp {fmtInt(o.heatemp_qty)}</div>
                                <div className="text-[11px] leading-4 whitespace-nowrap text-ink-muted">Mekonsis {fmtInt(o.mekonsis_qty)}</div>
                              </>
                            ) : (
                              <span className="text-xs text-ink-muted">Stok kaydı yok</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap">{o ? <StockStatusBadge row={o} /> : null}</td>
                        </>
                      ) : null}
                      {hasRc ? (
                        <td className="whitespace-nowrap">
                          {r && r.bom_line_count > 0 ? (
                            <Link href={href} className="text-[13px] text-ink hover:text-brand-600 hover:underline">
                              {fmtInt(r.bom_line_count)} kalem
                            </Link>
                          ) : (
                            <Badge tone="amber" icon={AlertTriangle}>
                              Reçete yok
                            </Badge>
                          )}
                        </td>
                      ) : null}
                      {hasOv || hasRc ? (
                        <td className="num">
                          {(!hasOv || o?.last_unit_cost_usd == null) && (!hasRc || r?.est_unit_cost_usd == null) ? (
                            // Hiç maliyet verisi yoksa iki etiketli "—" yerine tek bir "—".
                            <span className="text-ink-muted" title="Tamamlanmış üretim partisi ve reçete maliyeti yok">
                              —
                            </span>
                          ) : (
                            <dl className="ml-auto grid w-max grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-right">
                              {hasOv ? (
                                <>
                                  <dt className="text-[11px] text-ink-muted">Son parti</dt>
                                  <dd className="font-medium text-ink">{fmtUnitMoney(o?.last_unit_cost_usd, "USD")}</dd>
                                </>
                              ) : null}
                              {hasRc ? (
                                <>
                                  <dt className="text-[11px] text-ink-muted">Tahmini reçete</dt>
                                  <dd>
                                    {fmtUnitMoney(r?.est_unit_cost_usd, "USD")}
                                    {r && r.bom_line_count > 0 && !r.cost_complete ? (
                                      <AlertTriangle className="ml-1 inline size-3.5 text-amber-600" aria-label="Bazı malzemelerin maliyeti yok" />
                                    ) : null}
                                  </dd>
                                </>
                              ) : null}
                            </dl>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>

          {/* 1280 px altı: kart listesi (tablette iki sütun); stok/hedef, durum ve reçete ilk bakışta görünür. */}
          <ul className="-mb-px grid grid-cols-1 sm:grid-cols-2 xl:hidden">
            {variants.map((v) => {
              const o = ov.get(v.id);
              const r = rc.get(v.id);
              const href = `/urunler/${product.id}/varyant/${v.id}`;
              return (
                <li key={v.id} className="min-w-0 border-b border-line px-4 py-3 sm:odd:border-r">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={href} className="link break-words">
                        {v.variant_name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="code text-ink-muted">{v.variant_code}</span>
                        {v.is_active ? <Badge tone="green">Aktif</Badge> : <Badge>{v.variant_is_active ? "Ürün pasif" : "Pasif"}</Badge>}
                      </div>
                    </div>
                    {hasOv && o ? (
                      <span className="shrink-0">
                        <StockStatusBadge row={o} />
                      </span>
                    ) : null}
                  </div>
                  {hasOv ? (
                    o ? (
                      <div className="mt-2.5">
                        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                          <span className="text-ink-muted">
                            Stok <strong className="text-[13px] font-semibold text-ink tabular-nums">{fmtInt(o.total_remaining)}</strong> / hedef{" "}
                            <span className="tabular-nums">{fmtInt(o.target_stock)}</span>
                          </span>
                          <span className="text-ink-muted tabular-nums">
                            <ShelfSplit heatemp={o.heatemp_qty} mekonsis={o.mekonsis_qty} />
                          </span>
                        </div>
                        <StockProgress value={o.total_remaining} max={o.target_stock} status={o.stock_status} label={`${v.variant_name}: stok / hedef`} />
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-ink-muted">Stok kaydı yok</p>
                    )
                  ) : null}
                  <dl className="mt-2.5 grid grid-cols-3 gap-x-3 gap-y-2 text-[13px]">
                    <div className="min-w-0">
                      <dt className="text-xs text-ink-muted">Satış fiyatı</dt>
                      <dd className="tabular-nums">{fmtMoney(v.sale_price, v.currency)}</dd>
                      <dd>
                        <SourceTag overridden={v.price_overridden} />
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-ink-muted">Birim süre</dt>
                      <dd className="tabular-nums">{fmtMinutes(v.unit_production_minutes)}</dd>
                      <dd>
                        <SourceTag overridden={v.minutes_overridden} />
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-ink-muted" title="Kritik / minimum / hedef stok">
                        Eşikler
                      </dt>
                      <dd className="tabular-nums" title={`Kritik ${fmtInt(v.critical_stock)} · Minimum ${fmtInt(v.min_stock)} · Hedef ${fmtInt(v.target_stock)}`}>
                        {fmtInt(v.critical_stock)} / {fmtInt(v.min_stock)} / {fmtInt(v.target_stock)}
                      </dd>
                      <dd>
                        <SourceTag overridden={v.thresholds_overridden} />
                      </dd>
                    </div>
                    {hasRc ? (
                      <div className="min-w-0">
                        <dt className="text-xs text-ink-muted">Reçete</dt>
                        <dd>
                          {r && r.bom_line_count > 0 ? (
                            <Link href={href} className="text-ink hover:text-brand-600 hover:underline">
                              {fmtInt(r.bom_line_count)} kalem
                            </Link>
                          ) : (
                            <Badge tone="amber" icon={AlertTriangle}>
                              Reçete yok
                            </Badge>
                          )}
                        </dd>
                      </div>
                    ) : null}
                    {hasOv ? (
                      <div className="min-w-0">
                        <dt className="text-xs text-ink-muted">Son parti</dt>
                        <dd className="tabular-nums">{fmtUnitMoney(o?.last_unit_cost_usd, "USD")}</dd>
                      </div>
                    ) : null}
                    {hasRc ? (
                      <div className="min-w-0">
                        <dt className="text-xs text-ink-muted">Tahmini reçete</dt>
                        <dd className="tabular-nums">
                          {fmtUnitMoney(r?.est_unit_cost_usd, "USD")}
                          {r && r.bom_line_count > 0 && !r.cost_complete ? (
                            <AlertTriangle className="ml-1 inline size-3.5 text-amber-600" aria-label="Bazı malzemelerin maliyeti yok" />
                          ) : null}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
