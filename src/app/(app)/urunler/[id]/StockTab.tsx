import { Boxes, PackageOpen, Store, Warehouse } from "lucide-react";
import Link from "next/link";
import { StockStatusBadge } from "@/components/StockStatus";
import { Card, ErrorState, TableWrap } from "@/components/ui";
import type { AuthContext } from "@/lib/auth";
import { fmtInt, fmtMoney } from "@/lib/format";
import { parseListParams, type SearchParams } from "@/lib/list-params";
import { load } from "@/lib/query";
import type { Product, VariantOverview, VariantView } from "@/lib/types";
import { StatTile, StockProgress } from "../_components/bits";
import { MOVEMENT_SORTABLE, StockMovementsCard } from "../_components/Movements";

export async function StockTab({ ctx, product, variants, sp }: { ctx: AuthContext; product: Product; variants: VariantView[]; sp: SearchParams }) {
  const lp = parseListParams(sp, { sortable: MOVEMENT_SORTABLE, defaultSort: "movement_date" });
  const overview = await load(
    ctx.supabase.from("v_variant_overview").select("*").eq("product_id", product.id).order("variant_name").returns<VariantOverview[]>(),
  );
  const rows = overview.data ?? [];
  const total = (k: keyof VariantOverview) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);

  return (
    <div className="grid gap-4">
      {overview.error ? (
        <Card>
          <ErrorState message={overview.error} compact title="Stok özeti yüklenemedi" />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatTile
              label="Heatemp rafı"
              scope="Güncel stok"
              value={fmtInt(total("heatemp_qty"))}
              unit="adet"
              icon={Warehouse}
              tone="blue"
              description={`Parti maliyetiyle ${fmtMoney(total("heatemp_value_try"), "TRY")}`}
            />
            <StatTile
              label="Mekonsis rafı"
              scope="Güncel stok"
              value={fmtInt(total("mekonsis_qty"))}
              unit="adet"
              icon={Store}
              tone="teal"
              description={`Teslim edildi, satılmadı · ${fmtMoney(total("mekonsis_value_try"), "TRY")}`}
            />
            <StatTile
              label="Toplam kalan"
              scope="Güncel stok"
              value={fmtInt(total("total_remaining"))}
              unit="adet"
              icon={Boxes}
              tone="brand"
              description={`Mamul stok değeri ${fmtMoney(total("finished_value_try"), "TRY")}`}
            />
            <StatTile
              label="Açılış stoğu"
              value={fmtInt(total("opening_qty"))}
              unit="adet giriş"
              icon={PackageOpen}
              tone="violet"
              description="Sistem öncesi mevcut stok; üretim sayılmaz"
            />
          </div>

          <Card
            title="Varyant bazında stok"
            description="Toplam = Heatemp + Mekonsis rafı. Üretilen adede açılış stoğu dahil değildir; teslimat satış değildir."
            padded={false}
          >
            <TableWrap className="relative">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Varyant</th>
                    <th className="num whitespace-normal">Heatemp rafı</th>
                    <th className="num whitespace-normal">Mekonsis rafı</th>
                    <th className="num">Toplam</th>
                    <th className="num whitespace-normal">Hedefe göre</th>
                    <th className="whitespace-normal">Stok durumu</th>
                    <th className="num whitespace-normal">Stok değeri (TL)</th>
                    <th className="num whitespace-normal" title="Açılış partileriyle girilen adet (üretim sayılmaz)">
                      Açılış stoğu
                    </th>
                    <th className="num" title="Tamamlanmış üretim partileri (açılış stoğu hariç)">
                      Üretilen
                    </th>
                    <th className="num whitespace-normal">Teslim edilen</th>
                    <th className="num">Satılan</th>
                    <th className="num">Üretimde</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.variant_id}>
                      <td className="min-w-40">
                        <Link href={`/urunler/${product.id}/varyant/${r.variant_id}?sekme=stok`} className="link">
                          {r.variant_name}
                        </Link>
                        <div className="code mt-0.5 text-ink-muted">{r.variant_code}</div>
                      </td>
                      <td className="num">{fmtInt(r.heatemp_qty)}</td>
                      <td className="num">{fmtInt(r.mekonsis_qty)}</td>
                      <td className="num font-semibold text-ink">{fmtInt(r.total_remaining)}</td>
                      <td className="num min-w-24">
                        <span className="text-xs text-ink-muted">
                          {fmtInt(r.total_remaining)} / {fmtInt(r.target_stock)}
                        </span>
                        <div className="mt-1 ml-auto w-20">
                          <StockProgress value={r.total_remaining} max={r.target_stock} status={r.stock_status} label={`${r.variant_name}: stok / hedef`} />
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        <StockStatusBadge row={r} />
                      </td>
                      <td className="num">{fmtMoney(r.finished_value_try, "TRY")}</td>
                      <td className="num">{r.opening_qty > 0 ? fmtInt(r.opening_qty) : <span className="text-ink-muted">—</span>}</td>
                      <td className="num">{fmtInt(r.produced_qty)}</td>
                      <td className="num">{fmtInt(r.delivered_qty)}</td>
                      <td className="num">{fmtInt(r.sold_qty)}</td>
                      <td className="num">{fmtInt(r.in_production_qty)}</td>
                    </tr>
                  ))}
                </tbody>
                {rows.length > 1 ? (
                  <tfoot>
                    <tr>
                      <td>Toplam</td>
                      <td className="num">{fmtInt(total("heatemp_qty"))}</td>
                      <td className="num">{fmtInt(total("mekonsis_qty"))}</td>
                      <td className="num">{fmtInt(total("total_remaining"))}</td>
                      <td />
                      <td />
                      <td className="num">{fmtMoney(total("finished_value_try"), "TRY")}</td>
                      <td className="num">{fmtInt(total("opening_qty"))}</td>
                      <td className="num">{fmtInt(total("produced_qty"))}</td>
                      <td className="num">{fmtInt(total("delivered_qty"))}</td>
                      <td className="num">{fmtInt(total("sold_qty"))}</td>
                      <td className="num">{fmtInt(total("in_production_qty"))}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </TableWrap>
          </Card>
        </>
      )}

      <StockMovementsCard
        ctx={ctx}
        variants={variants.map((v) => ({ id: v.id, name: v.variant_name, code: v.variant_code }))}
        basePath={`/urunler/${product.id}`}
        lp={lp}
        keep={{ sekme: "stok" }}
      />
    </div>
  );
}
