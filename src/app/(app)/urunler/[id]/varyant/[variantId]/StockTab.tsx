import { Boxes, PackageOpen, Store, Warehouse } from "lucide-react";
import { StockStatusBadge } from "@/components/StockStatus";
import { Card, ErrorState, MetricRow } from "@/components/ui";
import type { AuthContext } from "@/lib/auth";
import { fmtInt, fmtMoney } from "@/lib/format";
import { parseListParams, type SearchParams } from "@/lib/list-params";
import { StatTile, StockProgress } from "../../../_components/bits";
import { MOVEMENT_SORTABLE, StockMovementsCard } from "../../../_components/Movements";
import type { VariantPageData } from "./types";

export async function VariantStockTab({ ctx, data, sp }: { ctx: AuthContext; data: VariantPageData; sp: SearchParams }) {
  const { product, variant, effective: e, overview: o } = data;
  const lp = parseListParams(sp, { sortable: MOVEMENT_SORTABLE, defaultSort: "movement_date" });

  return (
    <div className="grid gap-4">
      {data.overviewError || !o ? (
        <Card>
          <ErrorState message={data.overviewError ?? "Stok özeti bulunamadı."} compact title="Stok özeti yüklenemedi" />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatTile
              label="Heatemp rafı"
              scope="Güncel stok"
              value={fmtInt(o.heatemp_qty)}
              unit="adet"
              icon={Warehouse}
              tone="blue"
              description={`Parti maliyetiyle ${fmtMoney(o.heatemp_value_try, "TRY")}`}
            />
            <StatTile
              label="Mekonsis rafı"
              scope="Güncel stok"
              value={fmtInt(o.mekonsis_qty)}
              unit="adet"
              icon={Store}
              tone="teal"
              description={`Teslim edildi, satılmadı · ${fmtMoney(o.mekonsis_value_try, "TRY")}`}
            />
            <StatTile
              label="Toplam kalan"
              scope="Güncel stok"
              value={fmtInt(o.total_remaining)}
              unit="adet"
              icon={Boxes}
              tone="brand"
              description={`Mamul stok değeri ${fmtMoney(o.finished_value_try, "TRY")}`}
            />
            <StatTile
              label="Açılış stoğu"
              value={fmtInt(o.opening_qty)}
              unit="adet giriş"
              icon={PackageOpen}
              tone="violet"
              description={o.opening_qty > 0 ? `Giriş değeri ${fmtMoney(o.opening_value_try, "TRY")} · üretim sayılmaz` : "Açılış stoğu girişi yok"}
            />
          </div>

          <Card
            title="Stok akışı"
            description="Tüm zamanlar. Üretilen adede açılış stoğu dahil değildir; teslimat satış değildir."
            padded={false}
            actions={<StockStatusBadge row={o} />}
          >
            <MetricRow
              items={[
                { label: "Açılış stoğu girişi", value: `${fmtInt(o.opening_qty)} adet`, hint: "Üretim sayılmaz" },
                { label: "Üretilen (tamamlanan)", value: `${fmtInt(o.produced_qty)} adet`, hint: "Açılış stoğu hariç" },
                { label: "Üretimde", value: `${fmtInt(o.in_production_qty)} adet`, hint: "Devam eden partiler" },
                { label: "Mekonsis'e teslim", value: `${fmtInt(o.delivered_qty)} adet`, hint: "Satış değildir" },
                { label: "Mekonsis satışı", value: `${fmtInt(o.sold_qty)} adet`, hint: "Gerçekleşen satışlar" },
              ]}
            />
            <div className="border-t border-line px-4 py-3">
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
                <span className="text-ink-soft">
                  Toplam kalan / hedef stok
                  <span className="ml-1.5 text-xs text-ink-muted">
                    (kritik ≤ {fmtInt(e.critical_stock)}, minimum ≤ {fmtInt(e.min_stock)})
                  </span>
                </span>
                <span className="font-semibold text-ink tabular-nums">
                  {fmtInt(o.total_remaining)} / {fmtInt(e.target_stock)} adet
                </span>
              </div>
              <StockProgress value={o.total_remaining} max={e.target_stock} status={o.stock_status} label="Toplam kalan stoğun hedef stoğa oranı" />
            </div>
          </Card>
        </>
      )}

      <StockMovementsCard
        ctx={ctx}
        variants={[{ id: variant.id, name: variant.name, code: variant.code }]}
        basePath={`/urunler/${product.id}/varyant/${variant.id}`}
        lp={lp}
        keep={{ sekme: "stok" }}
      />
    </div>
  );
}
