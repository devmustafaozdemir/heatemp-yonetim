import { CalendarClock, History, Layers, Package, PackageOpen, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { Alert, Badge, ButtonLink, Card, EmptyState, ErrorState, MetricRow, PageHeader, StatCard } from "@/components/ui";
import { Drawer } from "@/components/ui/dialog";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtInt, fmtMoney, todayTr } from "@/lib/format";
import { first, type SearchParams } from "@/lib/list-params";
import { buckets } from "@/lib/period";
import { load } from "@/lib/query";
import type { HeatempShelfRow } from "@/lib/types";
import { AgingTable } from "./_components/AgingTable";
import { DeliveryDrawer, DeliveryProvider } from "./_components/DeliveryDrawer";
import { LocationBanner } from "./_components/LocationBanner";
import { SplitBar } from "./_components/Bars";
import { ShelfMovementChart } from "./_components/ShelfCharts";
import { SaleValueCard } from "./_components/SaleValueCard";
import { withSaleValues } from "./_components/saleValue";
import { ShelfTable } from "./_components/ShelfTable";
import { daysSince, groupLayers, last12MonthsFrom, toMovementPoints, type DeliverOption, type MovementRow } from "./_components/types";
import { OpeningStockForm } from "./OpeningStockForm";

export const metadata: Metadata = { title: "Heatemp rafı" };

export default async function HeatempShelfPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const varyant = first(sp.varyant) || undefined;
  const islem = first(sp.islem);
  const ctx = await requireMember();
  const isAdmin = ctx.role === "admin";
  const today = todayTr();
  const from = last12MonthsFrom(today);

  const [shelf, openings, mekonsis, moves, variants] = await Promise.all([
    load(
      ctx.supabase
        .from("v_heatemp_shelf")
        .select("*")
        .gt("qty_remaining", 0)
        .order("display_name")
        .order("received_on")
        .order("completed_at")
        .returns<HeatempShelfRow[]>(),
    ),
    // Açılış stoğu partileri (sistem öncesi stok): az sayıdadır, etiketleme için
    load(ctx.supabase.from("production_batches").select("id").eq("kind", "opening").returns<{ id: string }[]>()),
    load(
      ctx.supabase
        .from("v_mekonsis_shelf")
        .select("variant_id, qty_remaining, value_try")
        .eq("delivery_status", "active")
        .gt("qty_remaining", 0)
        .returns<{ variant_id: string; qty_remaining: number; value_try: number }[]>(),
    ),
    load<MovementRow[]>(ctx.supabase.rpc("shelf_monthly_movements", { p_location: "heatemp", p_from: from, p_to: today })),
    isAdmin
      ? load(
          ctx.supabase
            .from("v_variants")
            .select("id, display_name")
            .eq("is_active", true)
            .order("display_name")
            .returns<{ id: string; display_name: string }[]>(),
        )
      : Promise.resolve({ data: [] as { id: string; display_name: string }[], error: null, count: null }),
  ]);

  const openingIds = new Set((openings.data ?? []).map((o) => o.id));
  const rows = shelf.data ?? [];
  const groups = groupLayers(
    rows.map((r) => ({
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
        date: r.received_on,
        delivery_id: null,
        delivery_no: null,
        in_qty: r.produced_qty,
        out_qty: r.delivered_qty,
        remaining: r.qty_remaining,
        unit_cost_try: Number(r.unit_cost_try),
        unit_cost_usd: Number(r.unit_cost_usd),
        value_try: Number(r.value_try),
        value_usd: Number(r.value_usd),
      },
    })),
  );

  const sale = await withSaleValues(ctx, groups);

  const mekByVariant = new Map<string, number>();
  let mekQty = 0;
  let mekValue = 0;
  for (const m of mekonsis.data ?? []) {
    mekByVariant.set(m.variant_id, (mekByVariant.get(m.variant_id) ?? 0) + m.qty_remaining);
    mekQty += m.qty_remaining;
    mekValue += Number(m.value_try);
  }

  const options: DeliverOption[] = groups.map((g) => ({
    variant_id: g.variant_id,
    display_name: g.display_name,
    available: g.remaining,
    mekonsis_qty: mekonsis.error ? null : (mekByVariant.get(g.variant_id) ?? 0),
    batches: g.layers.map((l) => ({
      batch_id: l.batch_id,
      batch_no: l.batch_no,
      qty: l.remaining,
      received_on: l.date,
      opening: l.opening,
      unit_cost_try: l.unit_cost_try,
    })),
  }));

  const totalQty = groups.reduce((s, g) => s + g.remaining, 0);
  const totalTry = groups.reduce((s, g) => s + g.value_try, 0);
  const totalUsd = groups.reduce((s, g) => s + g.value_usd, 0);
  const layers = groups.flatMap((g) => g.layers.map((l) => ({ ...l, name: g.display_name })));
  // En eski rafa giriş tarihi; aynı gün giren tüm partiler birlikte sayılır (ör. açılış sayımı).
  const oldestDate = layers.reduce<string | null>((m, l) => (!m || l.date < m ? l.date : m), null);
  const oldestLayers = oldestDate ? layers.filter((l) => l.date === oldestDate) : [];
  const oldestQty = oldestLayers.reduce((s, l) => s + l.remaining, 0);
  const oldestVariants = new Set(oldestLayers.map((l) => l.name)).size;
  const openingLayers = layers.filter((l) => l.opening);
  const prodLayers = layers.filter((l) => !l.opening);
  const sum = (ls: typeof layers, k: "remaining" | "value_try") => ls.reduce((s, l) => s + l[k], 0);

  const points = toMovementPoints("heatemp", buckets(from, today, "aylik"), moves.data ?? []);
  const moveTotals = points.reduce(
    (a, p) => ({ prod: a.prod + p.inQty, opening: a.opening + p.in2Qty, out: a.out + p.outQty, rev: a.rev + p.revQty }),
    { prod: 0, opening: 0, out: 0, rev: 0 },
  );

  return (
    <DeliveryProvider initialVariant={varyant}>
      <PageHeader
        title="Heatemp rafı"
        meta={
          <Badge tone="blue" title="Üreticinin kendi deposu">
            Heatemp&apos;in deposu
          </Badge>
        }
        actions={
          <>
            <ButtonLink href="/teslimatlar" variant="secondary">
              <History aria-hidden />
              Teslimat geçmişi
            </ButtonLink>
            {isAdmin ? (
              <>
                <Drawer
                  trigger={
                    <>
                      <PackageOpen aria-hidden />
                      Açılış stoğu
                    </>
                  }
                  triggerVariant="secondary"
                  title="Açılış stoğu — sistem öncesi stok"
                  description="Uygulamaya geçişte eldeki mamulü bir kez girin. Heatemp rafına “Açılış stoğu” partisi olarak eklenir."
                  size="md"
                >
                  {variants.error ? (
                    <ErrorState message={variants.error} compact title="Varyantlar yüklenemedi" />
                  ) : (
                    <OpeningStockForm variants={variants.data ?? []} today={today} />
                  )}
                </Drawer>
                {shelf.error ? null : <DeliveryDrawer options={options} today={today} initialOpen={islem === "teslimat"} />}
              </>
            ) : null}
          </>
        }
      />

      <LocationBanner kind="heatemp" other={mekonsis.error ? null : { qty: mekQty, value: mekValue }} />

      {shelf.error ? (
        <Card>
          <ErrorState message={shelf.error} title="Heatemp rafı yüklenemedi" />
        </Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-5">
            <StatCard
              label="Raftaki adet"
              scope="Güncel stok"
              value={fmtInt(totalQty)}
              unit="adet"
              icon={Package}
              tone="brand"
              description={`${fmtInt(layers.length)} parti katmanı`}
            />
            <StatCard
              label="Maliyet değeri"
              scope="Güncel"
              value={fmtMoney(totalTry, "TRY")}
              icon={Wallet}
              tone="blue"
              description={`USD karşılığı ${fmtMoney(totalUsd, "USD")} · parti kurlarıyla (bilgi)`}
            />
            <SaleValueCard summary={sale.summary} error={sale.error} />
            <StatCard
              label="Varyant"
              scope="Rafta"
              value={fmtInt(groups.length)}
              unit="varyant"
              icon={Layers}
              tone="violet"
              description={
                openings.error
                  ? "Açılış stoğu ayrımı yüklenemedi"
                  : openingLayers.length > 0
                    ? `Açılış stoğu: ${fmtInt(sum(openingLayers, "remaining"))} adet · ${fmtMoney(sum(openingLayers, "value_try"), "TRY")}`
                    : "Açılış stoğu yok; tümü üretim partisi"
              }
            />
            <StatCard
              label="En eski parti"
              scope="En eski önce"
              value={oldestDate ? fmtDate(oldestDate) : "—"}
              icon={CalendarClock}
              tone="amber"
              description={
                !oldestDate
                  ? "Rafta parti yok"
                  : oldestLayers.length === 1
                    ? `${oldestLayers[0].batch_no} · ${fmtInt(daysSince(oldestDate, today))} gündür rafta · ${fmtInt(oldestQty)} adet`
                    : `${fmtInt(oldestLayers.length)} parti (${fmtInt(oldestVariants)} varyant) · ${fmtInt(oldestQty)} adet · ${fmtInt(
                        daysSince(oldestDate, today),
                      )} gündür rafta`
              }
            />
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <Card title="Raf hareketleri" description="Son 12 ay · rafa giriş ve Mekonsis'e teslimat" padded={false}>
              {moves.error ? (
                <ErrorState message={moves.error} compact />
              ) : (
                <>
                  <div className="p-4 pb-3">
                    <ShelfMovementChart kind="heatemp" data={points} />
                  </div>
                  <div className="border-t border-line">
                    <MetricRow
                      items={[
                        { label: "Üretim girişi", value: `${fmtInt(moveTotals.prod)} adet` },
                        { label: "Açılış stoğu girişi", value: `${fmtInt(moveTotals.opening)} adet`, hint: "Üretim sayılmaz" },
                        {
                          label: "Mekonsis'e teslimat",
                          value: `${fmtInt(moveTotals.out)} adet`,
                          hint: moveTotals.rev > 0 ? `${fmtInt(moveTotals.rev)} adet geri alındı` : "Satış değildir",
                        },
                      ]}
                    />
                  </div>
                </>
              )}
            </Card>
            <Card title="Raf değerinin kaynağı ve bekleme süresi" description="Güncel stok · parti maliyeti (TL)">
              {openings.error ? (
                // Hata ≠ boş: açılış partileri bilinmeden kaynak dağılımı (üretim / açılış) gösterilmez
                <Alert tone="error" title="Kaynak dağılımı yüklenemedi">
                  Açılış stoğu partileri okunamadığı için üretim partisi ve açılış stoğu ayrılamıyor ({openings.error}). Toplam
                  raf değeri: {fmtMoney(totalTry, "TRY")}.
                </Alert>
              ) : (
                <SplitBar
                  unit="try"
                  label="Heatemp rafı maliyet değerinin kaynağa göre dağılımı"
                  items={[
                    {
                      name: "Üretim partileri",
                      value: sum(prodLayers, "value_try"),
                      color: "bg-chart-teal",
                      hint: `${fmtInt(sum(prodLayers, "remaining"))} adet · ${fmtInt(prodLayers.length)} parti`,
                    },
                    {
                      name: "Açılış stoğu",
                      value: sum(openingLayers, "value_try"),
                      color: "bg-chart-violet",
                      hint: `${fmtInt(sum(openingLayers, "remaining"))} adet · ${fmtInt(openingLayers.length)} parti · sistem öncesi, üretim sayılmaz`,
                    },
                  ]}
                />
              )}
              <div className="mt-4 border-t border-line pt-3">
                <AgingTable
                  layers={layers}
                  today={today}
                  dateLabel="Rafta bekleme süresi · rafa giriş tarihinden bugüne (parti sayısı parantezde)"
                />
              </div>
            </Card>
          </div>

          <Card
            title="Varyant ve parti dağılımı"
            description="Varyant satırını açarak parti katmanlarını görün; parti numarası parti detayına gider."
            padded={false}
            id="raf"
          >
            {openings.error ? (
              <Alert tone="warning" className="m-4 mb-0">
                Açılış stoğu etiketleri yüklenemedi ({openings.error}); partiler “Açılış stoğu” etiketi olmadan gösteriliyor.
              </Alert>
            ) : null}
            {groups.length === 0 ? (
              <EmptyState title="Heatemp rafı boş" icon={Package}>
                Tamamlanan üretim partileri ve açılış stoğu burada görünür.
              </EmptyState>
            ) : (
              <ShelfTable kind="heatemp" groups={sale.groups} canDeliver={isAdmin} initialVariant={varyant} />
            )}
          </Card>
        </>
      )}
    </DeliveryProvider>
  );
}
