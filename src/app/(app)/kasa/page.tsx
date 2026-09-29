import {
  AlertOctagon,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Factory,
  Layers,
  Minus,
  Percent,
  PieChart,
  Receipt,
  Scale,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Alert, Badge, ButtonLink, Card, cx, DeltaText, ErrorState, PageHeader, StatCard } from "@/components/ui";
import { LinkSegmented } from "@/components/ui/list";
import { requireMember } from "@/lib/auth";
import { fmtInt, fmtMoney, pctChange, todayTr } from "@/lib/format";
import { first, hrefWith, parseListParams, type SearchParams } from "@/lib/list-params";
import { resolvePeriod } from "@/lib/period";
import { load } from "@/lib/query";
import type { FinancialSummary, SalesPeriodRow, VariantOverview } from "@/lib/types";
import {
  buildFinanceRows,
  FINANCE_SORTABLE,
  financeSeries,
  loadAll,
  marginOf,
  sortFinanceRows,
  stockTotals,
  sumProduction,
  sumSales,
  totalsFromVariants,
  trDayStartUtc,
  type ProductionBatchRow,
  type SalesTotals,
  type VariantSalesRow,
} from "./_components/data";
import { FinanceTrendChart } from "./_components/FinanceTrendChart";
import { pct1, points1 } from "./_components/fmt";
import { PeriodBar } from "./_components/PeriodBar";
import { ProductFinanceTable } from "./_components/ProductFinanceTable";
import { StockValueDonut } from "./_components/StockValueDonut";

export const metadata: Metadata = { title: "Kasa" };

const BASE = "/kasa";

/** Sorgu hatasında özet kartı: değer "0" gösterilmez, hata açıkça yazılır. */
function StatError({ label, message }: { label: string; message: string }) {
  return (
    <div className="card p-4" role="alert">
      <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</p>
      <p className="mt-2.5 flex items-center gap-1.5 text-sm font-medium text-chart-red">
        <AlertOctagon className="size-4" aria-hidden />
        Veri yüklenemedi
      </p>
      <p className="mt-1 text-xs text-ink-muted">{message}</p>
    </div>
  );
}

function SectionTitle({ children, scope }: { children: ReactNode; scope: ReactNode }) {
  return (
    <div className="mt-1 mb-2.5 flex flex-wrap items-center gap-2">
      <h2 className="text-[13px] font-semibold tracking-wide text-ink-soft uppercase">{children}</h2>
      <span className="rounded bg-white px-1.5 py-px text-[11px] font-medium text-ink-muted ring-1 ring-line">{scope}</span>
    </div>
  );
}

/** Karşılaştırma tablosundaki değişim hücresi (yüzde veya puan). */
function ChangeCell({ pct, points, invert = false }: { pct?: number | null; points?: number | null; invert?: boolean }) {
  const v = points !== undefined ? points : pct;
  if (v === null || v === undefined || !Number.isFinite(v)) {
    return (
      <span className="text-ink-muted" title="Önceki dönem değeri 0 veya yok: karşılaştırma yapılamaz">
        —
      </span>
    );
  }
  const flat = Math.abs(v) < 0.05;
  const good = flat ? null : invert ? v < 0 : v > 0;
  const text = points !== undefined ? points1(v) : `${v >= 0.05 ? "+" : v <= -0.05 ? "−" : ""}${pct1(Math.abs(v))}`;
  return <span className={cx("font-medium", good === null ? "text-ink-muted" : good ? "text-teal-700" : "text-red-600")}>{text}</span>;
}

/** Marj değişimi (puan) için DeltaText ile aynı görünümde rozet: ikon + metin. */
function PointsDelta({ points, label }: { points: number; label: string }) {
  const flat = Math.abs(points) < 0.05;
  const up = points > 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-1">
      <span
        className={cx(
          "inline-flex items-center gap-0.5 rounded px-1 py-px font-semibold whitespace-nowrap",
          flat ? "bg-slate-100 text-slate-600" : up ? "bg-chart-teal/10 text-teal-700" : "bg-chart-red/10 text-red-600",
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        {points1(points)}
      </span>
      <span>{label}</span>
    </span>
  );
}

export default async function CashPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireMember();
  const sp = await searchParams;
  const today = todayTr();
  const period = resolvePeriod(
    {
      donem: first(sp.donem) || undefined,
      bas: first(sp.bas),
      bit: first(sp.bit),
      gorunum: first(sp.gorunum),
    },
    today,
  );
  const lp = parseListParams(sp, {
    sortable: [...FINANCE_SORTABLE],
    defaultSort: "ciro",
    defaultDir: "desc",
  });
  const values = lp.values;
  const scope: "donem" | "tumu" = values.kapsam === "tumu" ? "tumu" : "donem";
  const sb = ctx.supabase;
  const since = trDayStartUtc(period.prevFrom);

  const [summaryRes, dailyRes, variantRes, prevVariantRes, overviewRes, batchRes, openingRes, settingsRes] = await Promise.all([
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
    load<VariantSalesRow[]>(sb.rpc("sales_by_variant", { p_from: period.from, p_to: period.to })),
    load<VariantSalesRow[]>(sb.rpc("sales_by_variant", { p_from: period.prevFrom, p_to: period.prevTo })),
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
    loadAll<ProductionBatchRow>((a, b) =>
      sb
        .from("v_batches")
        .select("id, status, quantity, total_cost_try, started_at, completed_at")
        .eq("kind", "production")
        .neq("status", "cancelled")
        .or(`started_at.gte.${since},completed_at.gte.${since}`)
        .order("started_at")
        .order("id")
        .range(a, b)
        .returns<ProductionBatchRow[]>(),
    ),
    load(
      sb
        .from("v_batches")
        .select("id, quantity, total_cost_try")
        .eq("kind", "opening")
        .returns<{ id: string; quantity: number; total_cost_try: number }[]>(),
    ),
    load(sb.from("app_settings").select("show_usd_info").single<{ show_usd_info: boolean }>()),
  ]);

  // Ayar okunamazsa USD bilgisi varsayılan olarak gösterilir, ama bu durum notta açıkça yazılır.
  const showUsd = settingsRes.data?.show_usd_info ?? true;
  const s = summaryRes.data;

  // Açılış stoğundan bugün raflarda kalan adet ve değer (raf değerlerine dahildir; ayrıca bilgi olarak).
  const openingIds = openingRes.data?.map((b) => b.id) ?? [];
  let openingLeft: { qty: number; value: number } | null = openingRes.error ? null : { qty: 0, value: 0 };
  for (let i = 0; i < openingIds.length && openingLeft; i += 150) {
    const ids = openingIds.slice(i, i + 150);
    const [h, m] = await Promise.all([
      load(
        sb
          .from("v_heatemp_shelf")
          .select("qty_remaining, value_try")
          .in("batch_id", ids)
          .gt("qty_remaining", 0)
          .returns<{ qty_remaining: number; value_try: number }[]>(),
      ),
      load(
        sb
          .from("v_mekonsis_shelf")
          .select("qty_remaining, value_try")
          .in("batch_id", ids)
          .gt("qty_remaining", 0)
          .returns<{ qty_remaining: number; value_try: number }[]>(),
      ),
    ]);
    if (h.error || m.error) {
      openingLeft = null;
      break;
    }
    for (const r of [...(h.data ?? []), ...(m.data ?? [])]) {
      openingLeft.qty += Number(r.qty_remaining);
      openingLeft.value += Number(r.value_try);
    }
  }
  const openingQty = (openingRes.data ?? []).reduce((a, b) => a + Number(b.quantity), 0);

  // --- Satış dönemi ---
  // Tutarlar sales_by_variant'tan (ürün tablosunun Toplam satırı ve tüm zamanlar özetiyle aynı kaynak);
  // satış sayısı ve grafik kovaları v_sales_daily'den.
  const salesError = dailyRes.error ?? variantRes.error ?? prevVariantRes.error;
  const daily = dailyRes.data ?? [];
  const cur = totalsFromVariants(variantRes.data ?? [], sumSales(daily, period.from, period.to).sales);
  const prev = totalsFromVariants(prevVariantRes.data ?? [], sumSales(daily, period.prevFrom, period.prevTo).sales);
  const margin = marginOf(cur);
  const prevMargin = marginOf(prev);
  const marginDiff = margin !== null && prevMargin !== null ? margin - prevMargin : null;
  const cmp = `önceki ${fmtInt(period.days)} güne göre`;
  const series = financeSeries(daily, period, period.granularity);
  const salesHref = `/satislar?bas=${period.from}&bit=${period.to}`;
  const usdRevenue = (variantRes.data ?? []).reduce((a, r) => a + Number(r.revenue_usd ?? 0), 0);
  const usdProfit = (variantRes.data ?? []).reduce((a, r) => a + Number(r.gross_profit_usd ?? 0), 0);

  // --- Üretim dönemi ---
  const batches = batchRes.data ?? [];
  const prodCur = sumProduction(batches, period.from, period.to);
  const prodPrev = sumProduction(batches, period.prevFrom, period.prevTo);

  // --- Ürün tablosu ---
  const tableError = variantRes.error ?? overviewRes.error;
  const tableRows = tableError
    ? []
    : sortFinanceRows(buildFinanceRows(variantRes.data ?? [], overviewRes.data ?? [], scope), lp.sort, lp.dir);
  const companyStock = overviewRes.data ? stockTotals(overviewRes.data) : null;

  const granularityControl = (
    <LinkSegmented
      active={period.granularity}
      items={[
        {
          key: "gunluk",
          label: "Günlük",
          href: hrefWith(BASE, values, { gorunum: "gunluk" }),
        },
        {
          key: "aylik",
          label: "Aylık",
          href: hrefWith(BASE, values, { gorunum: "aylik" }),
        },
      ]}
    />
  );

  const salesCard = (
    label: string,
    icon: LucideIcon,
    tone: "blue" | "sky" | "teal" | "brand",
    value: string,
    delta: { pct: number | null; label: string; invert?: boolean } | undefined,
    description: ReactNode,
    href?: string,
  ) =>
    salesError ? (
      <StatError key={label} label={label} message={salesError} />
    ) : (
      <StatCard key={label} label={label} value={value} icon={icon} tone={tone} delta={delta} description={description} href={href} />
    );

  // Maliyet mutabakatı (tüm zamanlar): giren maliyet = satılan + stokta + üretimde
  const costIn = s ? Number(s.production_spend_try) + Number(s.opening_value_try) : 0;
  const costOut = s ? Number(s.cogs_try) + Number(s.finished_value_try) + Number(s.wip_value_try) : 0;
  const costDiff = costIn - costOut;
  const share = (v: number) => (costOut > 0 ? Math.max(0, (v / costOut) * 100) : 0);

  return (
    <>
      <PageHeader
        title="Kasa"
        meta={<Badge tone="gray">Türetilmiş özet</Badge>}
        description="Seçilen dönemin satış sonucu, üretim harcaması ve güncel stok değerleri. Rakamlar Dashboard ile aynı görünümlerden hesaplanır."
        actions={
          <ButtonLink href={salesHref} variant="secondary">
            <Receipt aria-hidden />
            Dönemin satışları
          </ButtonLink>
        }
      />

      <Alert tone="info" title="Nakit bakiyesi değildir" className="mb-4">
        Bu ekran satış ve stok kayıtlarından türetilen özettir; tahsilat, ödeme ve nakit bakiyesi izlenmez. Tutarlar TL işlem günü
        değeridir: ciro satış günündeki kurla, maliyetler hammadde alış günlerindeki kurlarla TL&apos;ye çevrilmiş kayıtlı değerlerdir;
        farklı para birimleri doğrudan toplanmaz.{showUsd ? " USD karşılıkları yalnızca bilgi amaçlıdır." : ""}
        {settingsRes.error ? (
          <span className="mt-1 block font-medium">
            Ayarlar okunamadı ({settingsRes.error}); USD karşılıkları varsayılan olarak gösteriliyor.
          </span>
        ) : null}
      </Alert>

      <PeriodBar basePath={BASE} period={period} today={today} values={values} />

      {/* 1) Satış sonuçları — seçilen dönem */}
      <SectionTitle scope={period.label}>Satış sonuçları</SectionTitle>
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {salesCard(
          "Ciro",
          Banknote,
          "blue",
          fmtMoney(cur.revenue, "TRY"),
          { pct: pctChange(cur.revenue, prev.revenue), label: cmp },
          <>
            {fmtInt(cur.sales)} satış · {fmtInt(cur.quantity)} adet
            {showUsd && !variantRes.error ? <span className="block">≈ {fmtMoney(usdRevenue, "USD")} (bilgi)</span> : null}
          </>,
          salesHref,
        )}
        {salesCard(
          "Satış maliyeti",
          Layers,
          "sky",
          fmtMoney(cur.cogs, "TRY"),
          { pct: pctChange(cur.cogs, prev.cogs), label: cmp, invert: true },
          "FIFO: satılan adetlerin çekildiği parti katmanlarının maliyeti",
        )}
        {salesCard(
          "Brüt kâr",
          TrendingUp,
          "teal",
          fmtMoney(cur.profit, "TRY"),
          { pct: pctChange(cur.profit, prev.profit), label: cmp },
          <>
            Ciro − FIFO maliyeti · gerçekleşmiş
            {showUsd && !variantRes.error ? <span className="block">≈ {fmtMoney(usdProfit, "USD")} (bilgi)</span> : null}
          </>,
        )}
        {salesCard(
          "Brüt marj",
          Percent,
          "brand",
          pct1(margin),
          undefined,
          marginDiff !== null ? (
            <>
              <PointsDelta points={marginDiff} label={cmp} />
              <span className="mt-1.5 block">Önceki dönem {pct1(prevMargin)} · brüt kâr / ciro</span>
            </>
          ) : margin === null ? (
            "Seçilen dönemde satış yok"
          ) : (
            <>
              <span className="mt-0.5 block">{cmp}: karşılaştırma yok</span>
              <span className="mt-1.5 block">Önceki dönemde satış yok · brüt kâr / ciro</span>
            </>
          ),
        )}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-7">
          {dailyRes.error ? (
            <Card title="Ciro ve brüt kâr" icon={TrendingUp} className="h-full">
              <ErrorState message={dailyRes.error} />
            </Card>
          ) : (
            <FinanceTrendChart
              points={series}
              granularity={period.granularity}
              granularityControl={granularityControl}
              periodLabel={period.label}
            />
          )}
        </div>
        <div className="min-w-0 xl:col-span-5">
          <Card
            title="Dönem karşılaştırması"
            icon={Scale}
            description="Seçilen dönem ile aynı uzunluktaki önceki dönem"
            padded={false}
            className="h-full"
            footer={
              summaryRes.error || !s ? (
                <span>Tüm zamanlar özeti yüklenemedi: {summaryRes.error ?? "kayıt yok"}</span>
              ) : (
                <span>
                  <strong className="font-medium text-ink-soft">Tüm zamanlar:</strong> ciro {fmtMoney(s.revenue_try, "TRY")} · brüt kâr{" "}
                  {fmtMoney(s.gross_profit_try, "TRY")} · marj {pct1(s.margin_pct === null ? null : Number(s.margin_pct))} ·{" "}
                  {fmtInt(s.sold_qty)} adet
                  {showUsd ? ` · ≈ ${fmtMoney(s.gross_profit_usd, "USD")} brüt kâr (bilgi)` : ""}
                </span>
              )
            }
          >
            {salesError ? (
              <ErrorState message={salesError} compact />
            ) : (
              <ComparisonTable cur={cur} prev={prev} margin={margin} prevMargin={prevMargin} />
            )}
          </Card>
        </div>
      </div>

      {/* 2) Üretim (dönem + güncel) ve 3) stok değerleri (güncel) */}
      <SectionTitle scope="Dönem + güncel durum">Üretim ve stok değerleri</SectionTitle>
      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <div className="min-w-0">
          <Card
            title="Üretim"
            icon={Factory}
            description="Gerçek üretim partileri; açılış stoğu üretim sayılmaz"
            className="h-full"
            footer={
              <span>
                Harcama, parti başlatılırken tüketilen hammaddenin maliyetidir; iptal edilen partiler dahil değildir.{" "}
                <Link href="/uretim" className="link">
                  Üretim partileri
                </Link>
              </span>
            }
          >
            {summaryRes.error || !s ? (
              <ErrorState message={summaryRes.error ?? "Finansal özet bulunamadı."} compact />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <MiniMetric label="Dönemde başlatılan üretim" scope={period.label}>
                  {batchRes.error ? (
                    <span className="text-sm font-medium text-chart-red">Veri yüklenemedi</span>
                  ) : (
                    <>
                      <MetricValue>{fmtMoney(prodCur.startedCost, "TRY")}</MetricValue>
                      <p className="mt-1 text-xs text-ink-muted">
                        {fmtInt(prodCur.startedBatches)} parti · {fmtInt(prodCur.startedQty)} adet
                      </p>
                      <DeltaText pct={pctChange(prodCur.startedCost, prodPrev.startedCost)} label={cmp} />
                    </>
                  )}
                </MiniMetric>
                <MiniMetric label="Dönemde tamamlanan" scope={period.label}>
                  {batchRes.error ? (
                    <span className="text-sm font-medium text-chart-red">Veri yüklenemedi</span>
                  ) : (
                    <>
                      <MetricValue>
                        {fmtInt(prodCur.completedQty)} <span className="text-[13px] font-medium text-ink-muted">adet</span>
                      </MetricValue>
                      <p className="mt-1 text-xs text-ink-muted">{fmtInt(prodCur.completedBatches)} parti tamamlandı</p>
                      <DeltaText pct={pctChange(prodCur.completedQty, prodPrev.completedQty)} label={cmp} />
                    </>
                  )}
                </MiniMetric>
                <MiniMetric label="Devam eden üretim (WIP)" scope="Güncel">
                  <MetricValue>{fmtMoney(s.wip_value_try, "TRY")}</MetricValue>
                  <p className="mt-1 text-xs text-ink-muted">
                    {s.in_production_qty > 0 ? `${fmtInt(s.in_production_qty)} adet üretimde` : "Şu an üretimde parti yok"}
                  </p>
                </MiniMetric>
                <MiniMetric label="Toplam üretim harcaması" scope="Tüm zamanlar">
                  <MetricValue>{fmtMoney(s.production_spend_try, "TRY")}</MetricValue>
                  <p className="mt-1 text-xs text-ink-muted">{fmtInt(s.produced_qty)} adet üretildi (açılış hariç)</p>
                </MiniMetric>
              </div>
            )}
          </Card>
        </div>

        <div className="min-w-0">
          <Card
            title="Stok değerleri"
            icon={PieChart}
            description="Maliyet değeri (FIFO parti birim maliyetiyle)"
            className="h-full"
            footer={<span>Mekonsis rafındaki stok satılana kadar Heatemp&apos;in varlığıdır; teslimat ciro oluşturmaz.</span>}
          >
            {summaryRes.error || !s ? (
              <ErrorState message={summaryRes.error ?? "Finansal özet bulunamadı."} compact />
            ) : (
              <>
                <StockValueDonut
                  heatemp={{
                    qty: s.heatemp_qty,
                    value: Number(s.heatemp_value_try),
                  }}
                  mekonsis={{
                    qty: s.mekonsis_qty,
                    value: Number(s.mekonsis_value_try),
                  }}
                  material={Number(s.material_value_try)}
                  wip={{
                    qty: s.in_production_qty,
                    value: Number(s.wip_value_try),
                  }}
                />
                <div className="mt-4 rounded-md border border-dashed border-line-strong bg-canvas/60 px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-ink">Açılış stoğu</p>
                    <Badge tone="violet">Ayrı gösterilir</Badge>
                  </div>
                  {openingRes.error ? (
                    <p className="mt-1 text-xs text-chart-red">Açılış stoğu okunamadı: {openingRes.error}</p>
                  ) : Number(s.opening_value_try) > 0 ? (
                    <dl className="mt-1.5 space-y-1 text-[13px]">
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-ink-muted">Aktarılan değer</dt>
                        <dd className="text-right font-medium text-ink tabular-nums">
                          {fmtMoney(s.opening_value_try, "TRY")}{" "}
                          <span className="text-xs font-normal text-ink-muted">· {fmtInt(openingQty)} adet</span>
                        </dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-ink-muted">Raflarda kalan</dt>
                        <dd className="text-right font-medium text-ink tabular-nums">
                          {openingLeft ? (
                            <>
                              {fmtMoney(openingLeft.value, "TRY")}{" "}
                              <span className="text-xs font-normal text-ink-muted">· {fmtInt(openingLeft.qty)} adet</span>
                            </>
                          ) : (
                            <span className="text-chart-red">okunamadı</span>
                          )}
                        </dd>
                      </div>
                      <p className="pt-0.5 text-xs text-ink-muted">Üretim sayılmaz; kalan adetler yukarıdaki raf değerlerine dahildir.</p>
                    </dl>
                  ) : (
                    <p className="mt-1 text-xs text-ink-muted">Kayıtlı açılış stoğu yok.</p>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>

        <div className="min-w-0 lg:col-span-2 2xl:col-span-1">
          <Card
            title="Maliyet mutabakatı"
            icon={CheckCircle2}
            description="Giren mamul maliyetinin bugünkü yeri (tüm zamanlar)"
            className="h-full"
            footer={<span>Satılan ürün maliyeti yalnız gerçekleşen satışlardan; iptal edilen satışların maliyeti stoğa geri döner.</span>}
          >
            {summaryRes.error || !s ? (
              <ErrorState message={summaryRes.error ?? "Finansal özet bulunamadı."} compact />
            ) : (
              <div className="grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-2 2xl:grid-cols-1">
                <div className="min-w-0">
                  <p className="mb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">Giren maliyet</p>
                  <dl className="text-[13px]">
                    <LedgerRow label="Üretim harcaması (açılış hariç)" value={fmtMoney(s.production_spend_try, "TRY")} />
                    <LedgerRow label="Açılış stoğu (aktarılan)" value={fmtMoney(s.opening_value_try, "TRY")} />
                    <LedgerRow label="Toplam" value={fmtMoney(costIn, "TRY")} total />
                  </dl>
                  <div className="mt-3">
                    {Math.abs(costDiff) < 0.01 ? (
                      <Badge tone="green" icon={CheckCircle2}>
                        Tutarlı: fark yok
                      </Badge>
                    ) : Math.abs(costDiff) < 1 ? (
                      <Badge tone="gray">Yuvarlama farkı {fmtMoney(costDiff, "TRY")}</Badge>
                    ) : (
                      <Badge tone="amber" icon={AlertOctagon}>
                        Fark {fmtMoney(costDiff, "TRY")} — kayıtları kontrol edin
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="mb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">Bugünkü yeri</p>
                  <div className="mb-2 flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-canvas" aria-hidden>
                    <span className="h-full bg-chart-teal" style={{ width: `${share(Number(s.cogs_try))}%` }} />
                    <span
                      className="h-full bg-chart-blue"
                      style={{
                        width: `${share(Number(s.finished_value_try))}%`,
                      }}
                    />
                    <span className="h-full bg-chart-violet" style={{ width: `${share(Number(s.wip_value_try))}%` }} />
                  </div>
                  <dl className="text-[13px]">
                    <LedgerRow
                      swatch="bg-chart-teal"
                      label="Satılan ürün maliyeti (FIFO)"
                      value={fmtMoney(s.cogs_try, "TRY")}
                      hint={pct1(share(Number(s.cogs_try)))}
                    />
                    <LedgerRow
                      swatch="bg-chart-blue"
                      label="Mamul stok (Heatemp + Mekonsis)"
                      value={fmtMoney(s.finished_value_try, "TRY")}
                      hint={pct1(share(Number(s.finished_value_try)))}
                    />
                    <LedgerRow
                      swatch="bg-chart-violet"
                      label="Üretimdeki partiler"
                      value={fmtMoney(s.wip_value_try, "TRY")}
                      hint={pct1(share(Number(s.wip_value_try)))}
                    />
                    <LedgerRow label="Toplam" value={fmtMoney(costOut, "TRY")} total />
                  </dl>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* 4) Ürün bazlı finans tablosu */}
      <ProductFinanceTable
        error={tableError}
        rows={tableRows}
        period={period}
        values={values}
        sort={lp.sort}
        dir={lp.dir}
        scope={scope}
        showUsd={showUsd}
        companyStock={companyStock}
      />
    </>
  );
}

function MiniMetric({ label, scope, children }: { label: string; scope: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border border-line px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-xs font-medium text-ink-muted">{label}</p>
        <span className="rounded bg-canvas px-1.5 py-px text-[10.5px] font-medium text-ink-muted">{scope}</span>
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function MetricValue({ children }: { children: ReactNode }) {
  return <p className="text-lg leading-tight font-semibold text-ink tabular-nums">{children}</p>;
}

function LedgerRow({
  label,
  value,
  hint,
  total = false,
  swatch,
}: {
  label: string;
  value: string;
  hint?: string;
  total?: boolean;
  swatch?: string;
}) {
  return (
    <div
      className={cx(
        "flex items-baseline justify-between gap-3 py-1.5",
        total ? "border-t border-line-strong font-semibold text-ink" : "border-b border-dashed border-line",
      )}
    >
      <dt className={cx("flex min-w-0 items-center gap-1.5", total ? "text-ink" : "text-ink-soft")}>
        {swatch ? <span className={cx("size-2.5 shrink-0 rounded-sm", swatch)} aria-hidden /> : null}
        {label}
      </dt>
      <dd className="shrink-0 text-right tabular-nums">
        {hint ? <span className="mr-2 text-xs font-normal text-ink-muted">{hint}</span> : null}
        <span className={total ? "" : "font-medium text-ink"}>{value}</span>
      </dd>
    </div>
  );
}

function ComparisonTable({
  cur,
  prev,
  margin,
  prevMargin,
}: {
  cur: SalesTotals;
  prev: SalesTotals;
  margin: number | null;
  prevMargin: number | null;
}) {
  const perUnit = (v: number, q: number) => (q > 0 ? v / q : null);
  const rows: {
    label: string;
    cur: string;
    prev: string;
    change: ReactNode;
  }[] = [
    {
      label: "Satış sayısı",
      cur: fmtInt(cur.sales),
      prev: fmtInt(prev.sales),
      change: <ChangeCell pct={pctChange(cur.sales, prev.sales)} />,
    },
    {
      label: "Satılan adet",
      cur: fmtInt(cur.quantity),
      prev: fmtInt(prev.quantity),
      change: <ChangeCell pct={pctChange(cur.quantity, prev.quantity)} />,
    },
    {
      label: "Ciro",
      cur: fmtMoney(cur.revenue, "TRY"),
      prev: fmtMoney(prev.revenue, "TRY"),
      change: <ChangeCell pct={pctChange(cur.revenue, prev.revenue)} />,
    },
    {
      label: "Satış maliyeti (FIFO)",
      cur: fmtMoney(cur.cogs, "TRY"),
      prev: fmtMoney(prev.cogs, "TRY"),
      change: <ChangeCell pct={pctChange(cur.cogs, prev.cogs)} invert />,
    },
    {
      label: "Brüt kâr",
      cur: fmtMoney(cur.profit, "TRY"),
      prev: fmtMoney(prev.profit, "TRY"),
      change: <ChangeCell pct={pctChange(cur.profit, prev.profit)} />,
    },
    {
      label: "Brüt marj",
      cur: pct1(margin),
      prev: pct1(prevMargin),
      change: <ChangeCell points={margin !== null && prevMargin !== null ? margin - prevMargin : null} />,
    },
    {
      label: "Adet başına ciro",
      cur: fmtMoney(perUnit(cur.revenue, cur.quantity), "TRY"),
      prev: fmtMoney(perUnit(prev.revenue, prev.quantity), "TRY"),
      change: <ChangeCell pct={pctChange(perUnit(cur.revenue, cur.quantity), perUnit(prev.revenue, prev.quantity))} />,
    },
    {
      label: "Adet başına brüt kâr",
      cur: fmtMoney(perUnit(cur.profit, cur.quantity), "TRY"),
      prev: fmtMoney(perUnit(prev.profit, prev.quantity), "TRY"),
      change: <ChangeCell pct={pctChange(perUnit(cur.profit, cur.quantity), perUnit(prev.profit, prev.quantity))} />,
    },
  ];
  return (
    <>
      {/* Dar ekran: satır başına iki satırlık liste (yatay kaydırma olmadan) */}
      <ul className="divide-y divide-line sm:hidden">
        {rows.map((r) => (
          <li key={r.label} className="px-4 py-2.5 text-[13px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-ink-soft">{r.label}</span>
              <span className="font-medium text-ink tabular-nums">{r.cur}</span>
            </div>
            <div className="mt-0.5 flex items-baseline justify-between gap-3 text-xs">
              <span className="text-ink-muted tabular-nums">Önceki dönem: {r.prev}</span>
              <span className="tabular-nums">{r.change}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto [scrollbar-width:thin] sm:block">
        <table className="table-base table-compact">
          <thead>
            <tr>
              <th>Ölçü</th>
              <th className="num">Bu dönem</th>
              <th className="num">Önceki dönem</th>
              <th className="num">Değişim</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="whitespace-nowrap text-ink-soft">{r.label}</td>
                <td className="num font-medium text-ink">{r.cur}</td>
                <td className="num text-ink-muted">{r.prev}</td>
                <td className="num text-xs">{r.change}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
