import {
  AlertOctagon,
  AlertTriangle,
  Banknote,
  Boxes,
  Factory,
  PackagePlus,
  PieChart,
  Plus,
  ShoppingCart,
  Store,
  TrendingUp,
  Truck,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Card, ErrorState, MetricRow, PageHeader, StatCard, type Tone } from "@/components/ui";
import { LinkSegmented } from "@/components/ui/list";
import { requireMember } from "@/lib/auth";
import { fmtInt, fmtMoney, fmtNum, fmtPct, pctChange, todayTr } from "@/lib/format";
import { first, hrefWith, parseListParams, type SearchParams } from "@/lib/list-params";
import { resolvePeriod } from "@/lib/period";
import { load } from "@/lib/query";
import type { FinancialSummary, SalesPeriodRow, VariantOverview } from "@/lib/types";
import { BatchCostChart, type CostBatch } from "./_dashboard/BatchCostChart";
import {
  dateSpan,
  filterStockRows,
  loadAll,
  riskRows,
  salesByProduct,
  salesSeries,
  STOCK_SORTABLE,
  STOCK_TABLE_KEYS,
  sumSales,
  type VariantSalesRow,
} from "./_dashboard/data";
import { DeliveryList, RiskList, SalesList, WipList, type RecentDelivery, type RecentSale, type WipBatch } from "./_dashboard/OpsLists";
import { PeriodBar } from "./_dashboard/PeriodBar";
import { SalesTrendChart } from "./_dashboard/SalesTrendChart";
import { ShelfSummary } from "./_dashboard/ShelfSummary";
import { ShelfValueChart } from "./_dashboard/ShelfValueChart";
import { StockTable, type OpeningInfo } from "./_dashboard/StockTable";
import { TopProductsChart } from "./_dashboard/TopProductsChart";

export const metadata: Metadata = { title: "Dashboard" };

/** Sorgu hatasında özet kartı: değer "0" gösterilmez, hata açıkça yazılır. */
function StatError({ label, scope, icon: Icon, message }: { label: string; scope: string; icon: LucideIcon; message: string }) {
  return (
    <div className="card p-4" role="alert">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</p>
        <span className="rounded bg-canvas px-1.5 py-px text-[10.5px] font-medium text-ink-muted">{scope}</span>
      </div>
      <p className="mt-2.5 flex items-center gap-1.5 text-sm font-medium text-chart-red">
        <Icon className="size-4" aria-hidden />
        Veri yüklenemedi
      </p>
      <p className="mt-1 text-xs text-ink-muted">{message}</p>
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireMember();
  const sp = await searchParams;
  const isAdmin = ctx.role === "admin";
  const today = todayTr();
  const period = resolvePeriod(
    { donem: first(sp.donem) || undefined, bas: first(sp.bas), bit: first(sp.bit), gorunum: first(sp.gorunum) },
    today,
  );
  const lp = parseListParams(sp, { sortable: [...STOCK_SORTABLE], defaultSort: "product_name", defaultDir: "asc" });
  const values = lp.values;
  const sb = ctx.supabase;

  const [overviewRes, summaryRes, dailyRes, wipRes, costRes, openingRes, productRes, deliveriesRes, salesRes] = await Promise.all([
    loadAll<VariantOverview>((a, b) =>
      sb
        .from("v_variant_overview")
        .select("*")
        .order("product_name")
        .order("variant_name")
        .order("variant_id")
        .range(a, b)
        .returns<VariantOverview[]>(),
    ),
    load(sb.from("v_financial_summary").select("*").single<FinancialSummary>()),
    loadAll<SalesPeriodRow>((a, b) =>
      sb
        .from("v_sales_daily")
        .select("day, sale_count, quantity, revenue_try, cogs_try, gross_profit_try")
        .gte("day", period.prevFrom)
        .lte("day", period.to)
        .order("day")
        .range(a, b)
        .returns<SalesPeriodRow[]>(),
    ),
    load(
      sb
        .from("v_batches")
        .select("id, batch_no, display_name, quantity, started_at, elapsed_minutes, estimated_minutes")
        .eq("status", "in_production")
        .order("started_at", { ascending: false })
        .returns<WipBatch[]>(),
    ),
    loadAll<CostBatch>((a, b) =>
      sb
        .from("v_batches")
        .select(
          "id, batch_no, product_id, product_name, variant_id, variant_name, completed_at, quantity, unit_cost_usd, unit_cost_try, unit_cost_usd_change_pct, unit_cost_try_change_pct",
        )
        .eq("status", "completed")
        .eq("kind", "production")
        .order("completed_at")
        .order("batch_no")
        .range(a, b)
        .returns<CostBatch[]>(),
    ),
    load(sb.from("v_batches").select("id").eq("kind", "opening").returns<{ id: string }[]>()),
    load<VariantSalesRow[]>(sb.rpc("sales_by_variant", { p_from: period.from, p_to: period.to })),
    load(
      sb
        .from("v_deliveries")
        .select("id, delivery_no, delivered_on, display_name, quantity, status, sold_qty, remaining_qty")
        .order("delivered_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(6)
        .returns<RecentDelivery[]>(),
    ),
    load(
      sb
        .from("v_sales")
        .select("id, sale_no, sold_on, customer_name, total_quantity, revenue_try, status, items_summary")
        .order("sold_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(6)
        .returns<RecentSale[]>(),
    ),
  ]);

  // Açılış stoğunun stok tarihleri (Heatemp rafındaki katmanlar): veri kapsamı notu için.
  const openingIds = openingRes.data?.map((b) => b.id) ?? [];
  const openingDates: string[] = [];
  for (let i = 0; i < openingIds.length; i += 150) {
    const r = await load(
      sb
        .from("v_heatemp_shelf")
        .select("received_on")
        .in("batch_id", openingIds.slice(i, i + 150))
        .returns<{ received_on: string }[]>(),
    );
    if (r.error) break;
    openingDates.push(...(r.data ?? []).map((x) => x.received_on));
  }

  // --- Satış dönemi ---
  const daily = dailyRes.data ?? [];
  const cur = sumSales(daily, period.from, period.to);
  const prev = sumSales(daily, period.prevFrom, period.prevTo);
  const margin = cur.revenue > 0 ? (cur.profit / cur.revenue) * 100 : null;
  const cmp = `önceki ${fmtInt(period.days)} güne göre`;
  const series = salesSeries(daily, period, period.granularity);
  const salesHref = `/satislar?bas=${period.from}&bit=${period.to}`;
  const periodLabel = period.label;

  // --- Stok ---
  const overview = overviewRes.data ?? [];
  const s = summaryRes.data;
  const risk = riskRows(overview);
  const criticalCount = risk.filter((r) => r.stock_status === "critical").length;
  const lowCount = risk.length - criticalCount;
  const wip = wipRes.data ?? [];
  const wipQty = wip.reduce((a, b) => a + Number(b.quantity), 0);

  const opening: OpeningInfo | null = overviewRes.error
    ? null
    : {
        variants: overview.filter((r) => r.opening_qty > 0).length,
        qty: overview.reduce((a, r) => a + r.opening_qty, 0),
        value_try: overview.reduce((a, r) => a + Number(r.opening_value_try), 0),
        span: dateSpan(openingDates),
      };

  const tableRows = overviewRes.error ? [] : filterStockRows(overview, values, lp.sort, lp.dir);
  // URL'deki sayfa sonuç sayısını aşarsa son sayfa gösterilir (boş tablo yerine).
  const lastPage = Math.max(1, Math.ceil(tableRows.length / lp.pageSize));
  const tablePage = Math.min(lp.page, lastPage);
  const tableLp = { ...lp, page: tablePage, from: (tablePage - 1) * lp.pageSize, to: tablePage * lp.pageSize - 1 };
  const pageRows = tableRows.slice(tableLp.from, tableLp.to + 1);

  // Dönem ve görünüm bağlantıları tablo filtrelerini korur; tablo bağlantıları dönemi korur.
  const periodValues = Object.fromEntries(Object.entries(values).filter(([k]) => !(STOCK_TABLE_KEYS as readonly string[]).includes(k)));
  const riskHref = `${hrefWith("/", periodValues, { durum: "risk", kapsam: "aktif" })}#urun-durumu`;

  const granularityControl = (
    <LinkSegmented
      active={period.granularity}
      items={[
        { key: "gunluk", label: "Günlük", href: hrefWith("/", values, { gorunum: "gunluk" }) },
        { key: "aylik", label: "Aylık", href: hrefWith("/", values, { gorunum: "aylik" }) },
      ]}
    />
  );

  const salesStat = (
    label: string,
    icon: LucideIcon,
    tone: Tone,
    value: string,
    unit: string | undefined,
    curV: number,
    prevV: number,
    description: string,
    href: string,
  ) =>
    dailyRes.error ? (
      <StatError key={label} label={label} scope="Seçilen dönem" icon={AlertOctagon} message={dailyRes.error} />
    ) : (
      <StatCard
        key={label}
        label={label}
        scope="Seçilen dönem"
        value={value}
        unit={unit}
        icon={icon}
        tone={tone}
        delta={{ pct: pctChange(curV, prevV), label: cmp }}
        description={description}
        href={href}
      />
    );

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Seçilen dönemin satış sonucu, güncel raf ve hammadde değerleri, üretim ve stok durumu. Rakamlar Kasa ekranıyla aynı kayıtlardan türetilir."
        actions={
          isAdmin ? (
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
              <ButtonLink href="/hammadde?islem=giris" variant="secondary">
                <PackagePlus aria-hidden />
                Hammadde Girişi
              </ButtonLink>
              <ButtonLink href="/simulasyon" variant="secondary">
                <Factory aria-hidden />
                Üretimi Başlat
              </ButtonLink>
              <ButtonLink href="/rafim?islem=teslimat" variant="secondary">
                <Truck aria-hidden />
                Mekonsis&apos;e Teslimat
              </ButtonLink>
              <ButtonLink href="/satislar/yeni">
                <Plus aria-hidden />
                Satış Ekle
              </ButtonLink>
            </div>
          ) : undefined
        }
      />

      <PeriodBar period={period} today={today} values={values} />

      {/* 1) Özet kartları: dönem (değişimli) + güncel stok (değişimsiz) */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {salesStat(
          "Ciro",
          Banknote,
          "blue",
          fmtMoney(cur.revenue, "TRY"),
          undefined,
          cur.revenue,
          prev.revenue,
          `${fmtInt(cur.sales)} satış · yalnız gerçekleşen satışlar`,
          salesHref,
        )}
        {salesStat(
          "Brüt kâr",
          TrendingUp,
          "teal",
          fmtMoney(cur.profit, "TRY"),
          undefined,
          cur.profit,
          prev.profit,
          `Marj ${fmtPct(margin)} · FIFO parti maliyetiyle gerçekleşmiş`,
          "/kasa",
        )}
        {salesStat(
          "Satılan adet",
          ShoppingCart,
          "violet",
          fmtInt(cur.quantity),
          "adet",
          cur.quantity,
          prev.quantity,
          `Günlük ortalama ${fmtNum(cur.quantity / period.days, 1)} adet`,
          salesHref,
        )}
        {wipRes.error ? (
          <StatError label="Devam eden üretim" scope="Güncel stok" icon={AlertOctagon} message={wipRes.error} />
        ) : (
          <StatCard
            label="Devam eden üretim"
            scope="Güncel stok"
            value={fmtInt(wip.length)}
            unit="parti"
            icon={Factory}
            tone="amber"
            description={wip.length ? `Toplam ${fmtInt(wipQty)} adet üretimde` : "Şu an üretimde parti yok"}
            href="/uretim?durum=in_production"
          />
        )}
        {summaryRes.error || !s ? (
          <>
            {["Heatemp rafı", "Mekonsis rafı", "Hammadde stok değeri"].map((l) => (
              <StatError
                key={l}
                label={l}
                scope="Güncel stok"
                icon={AlertOctagon}
                message={summaryRes.error ?? "Finansal özet bulunamadı."}
              />
            ))}
          </>
        ) : (
          <>
            <StatCard
              label="Heatemp rafı"
              scope="Güncel stok"
              value={fmtMoney(s.heatemp_value_try, "TRY")}
              icon={Warehouse}
              tone="blue"
              description={`${fmtInt(s.heatemp_qty)} adet · maliyet değeri`}
              href="/rafim"
            />
            <StatCard
              label="Mekonsis rafı"
              scope="Güncel stok"
              value={fmtMoney(s.mekonsis_value_try, "TRY")}
              icon={Store}
              tone="teal"
              description={`${fmtInt(s.mekonsis_qty)} adet · Heatemp'in varlığı`}
              href="/mekonsis"
            />
            <StatCard
              label="Hammadde stok değeri"
              scope="Güncel stok"
              value={fmtMoney(s.material_value_try, "TRY")}
              icon={Boxes}
              tone="sky"
              description="Hammadde ve monte edilmemiş komponentler"
              href="/hammadde"
            />
          </>
        )}
        {overviewRes.error ? (
          <StatError label="Kritik stok" scope="Güncel stok" icon={AlertOctagon} message={overviewRes.error} />
        ) : (
          <StatCard
            label="Kritik stok"
            scope="Güncel stok"
            value={fmtInt(criticalCount)}
            unit="varyant"
            icon={AlertTriangle}
            tone="red"
            description={`${fmtInt(lowCount)} varyant minimum altında · aktif varyantlar`}
            href={riskHref}
          />
        )}
      </div>

      {/* 2) Seçilen dönem grafikleri */}
      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-7">
          {dailyRes.error ? (
            <Card title="Satış ve ciro trendi" icon={TrendingUp} className="h-full">
              <ErrorState message={dailyRes.error} />
            </Card>
          ) : (
            <SalesTrendChart
              points={series}
              granularity={period.granularity}
              granularityControl={granularityControl}
              periodLabel={periodLabel}
              footer={
                <MetricRow
                  items={[
                    { label: "Ciro", value: fmtMoney(cur.revenue, "TRY"), hint: `${fmtInt(cur.sales)} satış` },
                    { label: "Brüt kâr", value: fmtMoney(cur.profit, "TRY"), hint: `Marj ${fmtPct(margin)}` },
                    { label: "Satılan adet", value: `${fmtInt(cur.quantity)} adet`, hint: `Önceki dönem ${fmtInt(prev.quantity)} adet` },
                    {
                      label: "Satış başına ciro",
                      value: cur.sales > 0 ? fmtMoney(cur.revenue / cur.sales, "TRY") : "—",
                      hint: `Önceki dönem ciro ${fmtMoney(prev.revenue, "TRY")}`,
                    },
                  ]}
                />
              }
            />
          )}
        </div>
        <div className="min-w-0 xl:col-span-5">
          {productRes.error ? (
            <Card title="Ürün bazlı satış" className="h-full">
              <ErrorState message={productRes.error} />
            </Card>
          ) : (
            <TopProductsChart rows={salesByProduct(productRes.data ?? [])} periodLabel={periodLabel} salesHref={salesHref} />
          )}
        </div>
      </div>

      {/* 3) Güncel stok ve maliyet grafikleri */}
      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="min-w-0">
          <Card
            title="Raf değeri dağılımı"
            icon={PieChart}
            description="Maliyet değeri (FIFO parti birim maliyetiyle); açılış stoğundan kalan adetler dahildir."
            className="h-full"
            footer={
              <span>
                Mekonsis rafındaki stok satılana kadar Heatemp&apos;in varlığıdır; teslimat ciro oluşturmaz.{" "}
                <Link href="/kasa" className="link">
                  Kasa özeti
                </Link>
              </span>
            }
          >
            {summaryRes.error || !s ? (
              <ErrorState message={summaryRes.error ?? "Finansal özet bulunamadı."} />
            ) : (
              <>
                <ShelfValueChart
                  heatemp={{ qty: s.heatemp_qty, value: Number(s.heatemp_value_try) }}
                  mekonsis={{ qty: s.mekonsis_qty, value: Number(s.mekonsis_value_try) }}
                />
                <ShelfSummary
                  shelves={[
                    {
                      label: "Heatemp rafı",
                      qty: s.heatemp_qty,
                      value: Number(s.heatemp_value_try),
                      variants: overviewRes.error ? null : overview.filter((r) => r.heatemp_qty > 0).length,
                    },
                    {
                      label: "Mekonsis rafı",
                      qty: s.mekonsis_qty,
                      value: Number(s.mekonsis_value_try),
                      variants: overviewRes.error ? null : overview.filter((r) => r.mekonsis_qty > 0).length,
                    },
                  ]}
                />
              </>
            )}
          </Card>
        </div>
        <div className="min-w-0">
          {costRes.error ? (
            <Card title="Parti birim maliyeti" className="h-full">
              <ErrorState message={costRes.error} />
            </Card>
          ) : (
            <BatchCostChart batches={costRes.data ?? []} />
          )}
        </div>
      </div>

      {/* 4) Operasyon listeleri */}
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <div className="min-w-0">
          <RiskList rows={{ ...overviewRes, data: overviewRes.error ? null : risk }} allHref={riskHref} />
        </div>
        <div className="min-w-0">
          <WipList rows={wipRes} isAdmin={isAdmin} />
        </div>
        <div className="min-w-0">
          <DeliveryList rows={deliveriesRes} isAdmin={isAdmin} />
        </div>
        <div className="min-w-0">
          <SalesList rows={salesRes} isAdmin={isAdmin} />
        </div>
      </div>

      {/* 5) Ana stok tablosu */}
      <StockTable error={overviewRes.error} rows={tableRows} pageRows={pageRows} lp={tableLp} opening={opening} />
    </>
  );
}
