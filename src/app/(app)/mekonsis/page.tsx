import { ArrowRight, CalendarClock, History, Package, PieChart, Receipt, Store, Truck, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DeliveryStatusBadge } from "@/components/status";
import { Alert, Badge, ButtonLink, Card, EmptyState, ErrorState, MetricRow, PageHeader, StatCard, TableWrap } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtInt, fmtMoney, fmtPct, todayTr } from "@/lib/format";
import { buckets } from "@/lib/period";
import { load } from "@/lib/query";
import type { DeliveryView, MekonsisShelfRow } from "@/lib/types";
import { AgingTable } from "../rafim/_components/AgingTable";
import { LocationBanner } from "../rafim/_components/LocationBanner";
import { SellThroughList, SplitBar } from "../rafim/_components/Bars";
import { ShelfMovementChart } from "../rafim/_components/ShelfCharts";
import { SaleValueCard } from "../rafim/_components/SaleValueCard";
import { withSaleValues } from "../rafim/_components/saleValue";
import { ShelfTable } from "../rafim/_components/ShelfTable";
import { daysSince, groupLayers, last12MonthsFrom, toMovementPoints, type MovementRow } from "../rafim/_components/types";

export const metadata: Metadata = { title: "Mekonsis rafı" };

interface OverviewRow {
  variant_id: string;
  product_id: string;
  display_name: string;
  delivered_qty: number;
  sold_qty: number;
  mekonsis_qty: number;
  cogs_try: number | null;
}

export default async function MekonsisPage() {
  const ctx = await requireMember();
  const isAdmin = ctx.role === "admin";
  const today = todayTr();
  const from = last12MonthsFrom(today);

  const [shelf, openings, heatemp, moves, overview, recent] = await Promise.all([
    load(
      ctx.supabase
        .from("v_mekonsis_shelf")
        .select("*")
        .eq("delivery_status", "active")
        .gt("qty_remaining", 0)
        .order("display_name")
        .order("delivered_on")
        // Satış FIFO'su: rafa giriş tarihi, sonra katman kayıt sırası
        .order("received_at")
        .returns<MekonsisShelfRow[]>(),
    ),
    load(ctx.supabase.from("production_batches").select("id").eq("kind", "opening").returns<{ id: string }[]>()),
    load(
      ctx.supabase
        .from("v_heatemp_shelf")
        .select("qty_remaining, value_try")
        .gt("qty_remaining", 0)
        .returns<{ qty_remaining: number; value_try: number }[]>(),
    ),
    load<MovementRow[]>(ctx.supabase.rpc("shelf_monthly_movements", { p_location: "mekonsis", p_from: from, p_to: today })),
    load(
      ctx.supabase
        .from("v_variant_overview")
        .select("variant_id, product_id, display_name, delivered_qty, sold_qty, mekonsis_qty, cogs_try")
        .gt("delivered_qty", 0)
        .order("display_name")
        .returns<OverviewRow[]>(),
    ),
    load(
      ctx.supabase
        .from("v_deliveries")
        .select("*", { count: "exact" })
        .order("delivered_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(8)
        .returns<DeliveryView[]>(),
    ),
  ]);

  const openingIds = new Set((openings.data ?? []).map((o) => o.id));
  const groups = groupLayers(
    (shelf.data ?? []).map((r) => ({
      variant_id: r.variant_id,
      product_id: r.product_id,
      display_name: r.display_name,
      product_code: r.product_code,
      variant_code: r.variant_code,
      layer: {
        layer_id: r.layer_id,
        batch_id: r.batch_id,
        batch_no: r.batch_no,
        opening: openingIds.has(r.batch_id),
        date: r.delivered_on,
        delivery_id: r.delivery_id,
        delivery_no: r.delivery_no,
        in_qty: r.delivered_qty,
        out_qty: r.sold_qty,
        remaining: r.qty_remaining,
        unit_cost_try: Number(r.unit_cost_try),
        unit_cost_usd: Number(r.unit_cost_usd),
        value_try: Number(r.value_try),
        value_usd: Number(r.value_usd),
      },
    })),
  );
  const sale = await withSaleValues(ctx, groups);
  const layers = groups.flatMap((g) => g.layers);
  const totalQty = groups.reduce((s, g) => s + g.remaining, 0);
  const totalTry = groups.reduce((s, g) => s + g.value_try, 0);
  const totalUsd = groups.reduce((s, g) => s + g.value_usd, 0);
  // Rafta en uzun bekleyen: en eski teslimat günü; o gün yapılan tüm teslimatlar (ve parti katmanları) birlikte sayılır.
  const oldestDate = layers.reduce<string | null>((m, l) => (!m || l.date < m ? l.date : m), null);
  const oldestLayers = oldestDate ? layers.filter((l) => l.date === oldestDate) : [];
  const oldestQty = oldestLayers.reduce((s, l) => s + l.remaining, 0);
  const oldestDeliveries = Array.from(new Map(oldestLayers.map((l) => [l.delivery_id, l.delivery_no])).entries());

  const heatempTotals = heatemp.error
    ? null
    : (heatemp.data ?? []).reduce((a, r) => ({ qty: a.qty + r.qty_remaining, value: a.value + Number(r.value_try) }), { qty: 0, value: 0 });

  const ov = overview.data ?? [];
  const delivered = ov.reduce((s, r) => s + r.delivered_qty, 0);
  const sold = ov.reduce((s, r) => s + r.sold_qty, 0);
  const soldCost = ov.reduce((s, r) => s + Number(r.cogs_try ?? 0), 0);
  const onShelf = ov.reduce((s, r) => s + r.mekonsis_qty, 0);
  const sellRate = delivered > 0 ? (sold / delivered) * 100 : null;

  const points = toMovementPoints("mekonsis", buckets(from, today, "aylik"), moves.data ?? []);
  const moveTotals = points.reduce(
    (a, p) => ({ in: a.in + p.inQty, ret: a.ret + p.in2Qty, out: a.out + p.outQty, rev: a.rev + p.revQty }),
    { in: 0, ret: 0, out: 0, rev: 0 },
  );

  return (
    <>
      <PageHeader
        title="Mekonsis rafı"
        meta={
          <Badge tone="green" icon={Store} title="Satıcıdaki stok; satılana kadar Heatemp'in varlığı">
            Satış rafı · Heatemp&apos;in varlığı
          </Badge>
        }
        actions={
          <>
            <ButtonLink href="/teslimatlar" variant="secondary">
              <History aria-hidden />
              Teslimatlar
            </ButtonLink>
            {isAdmin ? (
              <>
                <ButtonLink href="/rafim?islem=teslimat" variant="secondary">
                  <Truck aria-hidden />
                  Yeni teslimat
                </ButtonLink>
                <ButtonLink href="/satislar/yeni">
                  <Receipt aria-hidden />
                  Satış ekle
                </ButtonLink>
              </>
            ) : null}
          </>
        }
      />

      <LocationBanner kind="mekonsis" other={heatempTotals} />

      {shelf.error ? (
        <Card className="mb-4">
          <ErrorState message={shelf.error} title="Mekonsis rafı yüklenemedi" />
        </Card>
      ) : (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-5">
          <StatCard
            label="Raftaki adet"
            scope="Güncel stok"
            value={fmtInt(totalQty)}
            unit="adet"
            icon={Package}
            tone="teal"
            description={`${fmtInt(groups.length)} varyant · ${fmtInt(layers.length)} teslimat katmanı`}
          />
          <StatCard
            label="Maliyet değeri"
            scope="Güncel"
            value={fmtMoney(totalTry, "TRY")}
            icon={Wallet}
            tone="blue"
            description={`Heatemp'in varlığı · USD karşılığı ${fmtMoney(totalUsd, "USD")} (parti kurlarıyla, bilgi)`}
          />
          <SaleValueCard summary={sale.summary} error={sale.error} />
          <StatCard
            label="Satış oranı"
            scope="Bugüne kadar"
            value={overview.error ? "—" : sellRate === null ? "—" : fmtPct(sellRate)}
            icon={PieChart}
            tone="violet"
            description={
              overview.error
                ? "Özet yüklenemedi"
                : delivered > 0
                  ? `Aktif teslimatlardaki ${fmtInt(delivered)} adetin ${fmtInt(sold)} adedi satıldı`
                  : "Henüz teslimat yok"
            }
          />
          <StatCard
            label="En eski teslimat"
            scope="Rafta"
            value={oldestDate ? fmtDate(oldestDate) : "—"}
            icon={CalendarClock}
            tone="amber"
            description={
              !oldestDate
                ? "Rafta bekleyen teslimat yok"
                : `${
                    oldestDeliveries.length === 1 ? oldestDeliveries[0][1] : `${fmtInt(oldestDeliveries.length)} teslimat`
                  } · ${fmtInt(daysSince(oldestDate, today))} gündür rafta · ${fmtInt(oldestQty)} adet kaldı`
            }
            href={
              !oldestDate
                ? undefined
                : oldestDeliveries.length === 1 && oldestDeliveries[0][0]
                  ? `/teslimatlar/${oldestDeliveries[0][0]}`
                  : `/teslimatlar?bas=${oldestDate}&bit=${oldestDate}&satis=kalan`
            }
          />
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <Card title="Raf hareketleri" description="Son 12 ay · teslimat girişi ve satış çıkışı" padded={false}>
          {moves.error ? (
            <ErrorState message={moves.error} compact />
          ) : (
            <>
              <div className="p-4 pb-3">
                <ShelfMovementChart kind="mekonsis" data={points} />
              </div>
              <div className="border-t border-line">
                <MetricRow
                  items={[
                    {
                      label: "Teslimat girişi",
                      value: `${fmtInt(moveTotals.in)} adet`,
                      hint: moveTotals.rev > 0 ? `${fmtInt(moveTotals.rev)} adet geri alındı` : "Satış değildir",
                    },
                    { label: "Satış çıkışı", value: `${fmtInt(moveTotals.out)} adet`, hint: "Satışla düşülen" },
                    { label: "Satış iptali (rafa dönüş)", value: `${fmtInt(moveTotals.ret)} adet` },
                  ]}
                />
              </div>
            </>
          )}
        </Card>
        <Card title="Satış durumu ve bekleme süresi" description="Tüm aktif teslimatlar · adet">
          {overview.error ? (
            <ErrorState message={overview.error} compact />
          ) : (
            <SplitBar
              unit="qty"
              label="Mekonsis'e teslim edilen ürünlerin satış durumu"
              items={[
                {
                  name: "Satılan",
                  value: sold,
                  color: "bg-chart-teal",
                  hint: `Tamamlanan satışlar (iptaller hariç) · satılan ürün maliyeti ${fmtMoney(soldCost, "TRY")}`,
                },
                {
                  name: "Rafta kalan",
                  value: onShelf,
                  color: "bg-chart-blue",
                  hint: shelf.error ? "Heatemp varlığı · maliyet değeri yüklenemedi" : `Heatemp varlığı · ${fmtMoney(totalTry, "TRY")}`,
                },
              ]}
            />
          )}
          {shelf.error ? null : (
            <div className="mt-4 border-t border-line pt-3">
              <AgingTable
                layers={layers}
                today={today}
                dateLabel="Rafta bekleme süresi · teslimat tarihinden bugüne (katman sayısı parantezde)"
              />
            </div>
          )}
        </Card>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Varyant bazında satış durumu" description="Tüm aktif teslimatlar · satılan ve rafta kalan (adet)">
          {overview.error ? (
            <ErrorState message={overview.error} compact />
          ) : (
            <SellThroughList
              rows={ov
                .filter((r) => r.delivered_qty > 0)
                .sort((a, b) => b.delivered_qty - a.delivered_qty)
                .map((r) => ({
                  key: r.variant_id,
                  label: r.display_name,
                  href: `/urunler/${r.product_id}/varyant/${r.variant_id}?sekme=stok`,
                  sold: r.sold_qty,
                  remaining: r.mekonsis_qty,
                }))}
              emptyText="Henüz teslimat yok."
            />
          )}
        </Card>
        <Card
          title="Son teslimatlar"
          description="Heatemp → Mekonsis (satış değildir)"
          padded={false}
          actions={
            <ButtonLink href="/teslimatlar" variant="ghost" size="sm">
              Tümünü gör
              <ArrowRight aria-hidden />
            </ButtonLink>
          }
          footer={
            recent.count ? `Toplam ${fmtInt(recent.count)} teslimat · en yeni ${fmtInt(Math.min(8, recent.count))} tanesi` : undefined
          }
        >
          {recent.error ? (
            <ErrorState message={recent.error} compact />
          ) : (recent.data ?? []).length === 0 ? (
            <EmptyState title="Henüz teslimat yok" icon={Truck} compact>
              Heatemp rafından Mekonsis&apos;e teslimat yapın.
            </EmptyState>
          ) : (
            <TableWrap className="relative">
              <table className="table-base table-compact">
                <thead>
                  <tr>
                    <th>Teslimat</th>
                    <th>Ürün / varyant</th>
                    <th className="num">Adet</th>
                    <th className="num hidden sm:table-cell">Kalan</th>
                    <th className="hidden sm:table-cell xl:hidden min-[87.5rem]:table-cell">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {(recent.data ?? []).map((d) => (
                    <tr key={d.id}>
                      <td className="whitespace-nowrap">
                        <Link href={`/teslimatlar/${d.id}`} className="link font-mono text-xs">
                          {d.delivery_no}
                        </Link>
                        <span className="block text-[11px] text-ink-muted">{fmtDate(d.delivered_on)}</span>
                        {d.status === "cancelled" ? (
                          <span className="mt-0.5 hidden xl:block min-[87.5rem]:hidden">
                            <DeliveryStatusBadge status={d.status} />
                          </span>
                        ) : null}
                      </td>
                      <td className="min-w-[9rem] sm:min-w-[12rem]">{d.display_name}</td>
                      <td className="num">
                        {fmtInt(d.quantity)}
                        <span className="block text-[11px] text-ink-muted sm:hidden">
                          {d.status === "cancelled" ? "geri alındı" : `${fmtInt(d.remaining_qty)} kalan`}
                        </span>
                      </td>
                      <td className="num hidden sm:table-cell">{d.status === "cancelled" ? "—" : fmtInt(d.remaining_qty)}</td>
                      <td className="hidden sm:table-cell xl:hidden min-[87.5rem]:table-cell">
                        <DeliveryStatusBadge status={d.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>

      {shelf.error ? null : (
        <Card
          title="Varyant ve teslimat katmanları"
          description="Varyant satırını açarak raftaki teslimat ve parti katmanlarını görün."
          padded={false}
        >
          {openings.error ? (
            <Alert tone="warning" className="m-4 mb-0">
              Açılış stoğu etiketleri yüklenemedi ({openings.error}); partiler etiketsiz gösteriliyor.
            </Alert>
          ) : null}
          {groups.length === 0 ? (
            <EmptyState
              title="Mekonsis rafı boş"
              icon={Store}
              action={
                isAdmin ? (
                  <ButtonLink href="/rafim?islem=teslimat" size="sm">
                    Teslimat yap
                  </ButtonLink>
                ) : undefined
              }
            >
              Heatemp rafından teslim edilen ürünler satılana kadar burada görünür.
            </EmptyState>
          ) : (
            <ShelfTable kind="mekonsis" groups={sale.groups} />
          )}
        </Card>
      )}
    </>
  );
}
