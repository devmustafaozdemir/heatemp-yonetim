import { ArrowDown, ArrowUp, ArrowUpDown, Banknote, CalendarDays, Package, Plus, Receipt, ShoppingCart, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SaleStatusBadge } from "@/components/status";
import { ButtonLink, Card, cx, EmptyState, ErrorState, MetricRow, PageHeader, StatCard, TableWrap } from "@/components/ui";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { LinkSegmented, Pagination, SortTh } from "@/components/ui/list";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtInt, fmtMoney, fmtNum, fmtRate, pctChange, todayTr } from "@/lib/format";
import { hrefWith, parseListParams, searchPattern, type SearchParams } from "@/lib/list-params";
import { buckets } from "@/lib/period";
import { load } from "@/lib/query";
import type { SaleView } from "@/lib/types";
import { CustomRangeForm } from "./_components/CustomRangeForm";
import { fmtRatio, marginPct } from "./_components/fmt";
import { chartGranularity, monthlyQuery, PERIOD_PRESETS, resolveListPeriod } from "./_components/period";
import { SalesBreakdown, SalesTrendChart, type BreakdownRow, type TrendPoint } from "./_components/SalesCharts";

export const metadata: Metadata = { title: "Satışlar" };

const BASE = "/satislar";
const SORTABLE = ["sold_on", "sale_no", "customer_name", "total_quantity", "revenue_try", "cogs_try", "gross_profit_try", "margin_pct"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Özel aralık formunda korunmayacak (dönemle değişen) anahtarlar */
const PERIOD_KEYS = new Set(["donem", "bas", "bit", "sayfa"]);
/** Geniş ekranda ayrı sütun; daha darda satış hücresinin içinde gösterilir */
const WIDE_CELL = "hidden min-[1360px]:table-cell";
/**
 * Tarih yalnız çok geniş ekranda ayrı sütundur; daha darda satış no'nun altında gösterilir.
 * Böylece 1360–1600 px arasında müşteri / kalemler sütunu kalem metnini kesmeden gösterebilir.
 */
const DATE_CELL = "hidden min-[1600px]:table-cell";
/** İptal satırlarında tüm tutar ve oranlar üstü çizili gösterilir (toplamlara dahil değil). */
const STRIKE = "line-through decoration-ink-muted/60";

/** Negatif kâr kırmızı; pozitif kâr için tema rengi olmadığından nötr metin rengi. */
function profitTone(value: number | string | null | undefined) {
  return Number(value) < 0 ? "text-chart-red" : "text-ink";
}

/**
 * Başlık içinde sıralama bağlantısı (SortTh ile aynı görünüm). Satış sütunu başlığında hem satış no
 * hem de (tarih sütunu gizliyken) tarih sıralaması sunmak için kullanılır.
 */
function SortLink({
  label,
  column,
  sort,
  dir,
  values,
  className,
}: {
  label: string;
  column: string;
  sort: string | null;
  dir: "asc" | "desc";
  values: Record<string, string>;
  className?: string;
}) {
  const active = sort === column;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <Link
      href={hrefWith(BASE, values, { sirala: column, yon: active && dir === "desc" ? "asc" : "desc", sayfa: null })}
      className={cx("inline-flex items-center gap-1 hover:text-brand-600", active && "text-brand-700", className)}
      scroll={false}
    >
      {label}
      <Icon className={cx("size-3.5", !active && "opacity-40")} aria-hidden />
      {active ? <span className="sr-only">{dir === "asc" ? " (artan sıralı)" : " (azalan sıralı)"}</span> : null}
    </Link>
  );
}

function QuoteTag() {
  return <span className="mr-1 rounded bg-brand-50 px-1 py-px text-[10.5px] font-semibold text-brand-700">Tekliften</span>;
}

interface Totals {
  sale_count: number;
  quantity: number;
  revenue_try: number;
  revenue_usd: number;
  cogs_try: number;
  gross_profit_try: number;
  customer_count: number;
  first_day: string | null;
  last_day: string | null;
}

interface Summary {
  totals: Totals;
  cancelled: { sale_count: number; revenue_try: number };
  series: {
    bucket: string;
    sale_count: number;
    quantity: number;
    revenue_try: number;
    cogs_try: number;
    gross_profit_try: number;
  }[];
  by_customer: {
    customer_id: string | null;
    customer_name: string | null;
    sale_count: number;
    quantity: number;
    revenue_try: number;
    gross_profit_try: number;
  }[];
  by_variant: {
    variant_id: string;
    product_id: string;
    display_name: string;
    sale_count: number;
    quantity: number;
    revenue_try: number;
    gross_profit_try: number;
  }[];
}

interface SoldVariant {
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  display_name: string;
}

export default async function SalesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireMember();
  const lp = parseListParams(await searchParams, {
    sortable: SORTABLE,
    defaultSort: "sold_on",
    defaultDir: "desc",
  });
  const values = lp.values;
  const today = todayTr();
  const period = resolveListPeriod(values, today);

  const productId = values.urun && UUID.test(values.urun) ? values.urun : null;
  const variantId = values.varyant && UUID.test(values.varyant) ? values.varyant : null;
  const noCustomer = values.musteri === "perakende";
  const customerId = !noCustomer && values.musteri && UUID.test(values.musteri) ? values.musteri : null;
  const status = values.durum === "gerceklesti" ? "completed" : values.durum === "iptal" ? "cancelled" : null;
  const pattern = searchPattern(lp.q);

  // Varyant filtresi ürüne bağlıdır: ürün seçimi kaldırılınca varyant da bırakılır (kırılımdan gelen
  // bağlantılar ürünü de taşır). Böylece varyant listesi hep seçili ürünün kısa varyant adlarından oluşur.
  if (variantId && !productId) redirect(hrefWith(BASE, values, { varyant: null, sayfa: null }));

  const filterArgs = {
    p_q: pattern,
    p_product_id: productId,
    p_variant_id: variantId,
    p_customer_id: customerId,
    p_no_customer: noCustomer,
  };

  const [res, summary, prevSummary, sold, customers] = await Promise.all([
    load<SaleView[]>(
      ctx.supabase
        .rpc(
          "sales_filtered",
          {
            ...filterArgs,
            p_from: period.from,
            p_to: period.to,
            p_status: status,
          },
          { count: "exact" },
        )
        .order(lp.sort ?? "sold_on", {
          ascending: lp.dir === "asc",
          nullsFirst: false,
        })
        .order("created_at", { ascending: false })
        .range(lp.from, lp.to),
    ),
    load<Summary>(
      ctx.supabase.rpc("sales_list_summary", {
        ...filterArgs,
        p_from: period.from,
        p_to: period.to,
        p_monthly: monthlyQuery(period),
      }),
    ),
    period.prev
      ? load<Summary>(
          ctx.supabase.rpc("sales_list_summary", {
            ...filterArgs,
            p_from: period.prev.from,
            p_to: period.prev.to,
            p_monthly: true,
          }),
        )
      : Promise.resolve(null),
    load<SoldVariant[]>(
      ctx.supabase.rpc("sales_by_variant", {
        p_from: "2000-01-01",
        p_to: today,
      }),
    ),
    load(ctx.supabase.from("customers").select("id, name").order("name").returns<{ id: string; name: string }[]>()),
  ]);

  // Filtre seçenekleri: satışı olan ürün ve varyantlar
  const soldRows = [...(sold.data ?? [])].sort((a, b) => a.display_name.localeCompare(b.display_name, "tr"));
  // URL'deki varyant/ürün satış listesinde yoksa (satışı olmayan varyant) adını ve ürününü ayrıca bul.
  const [selVariant, selProduct] = await Promise.all([
    variantId && !soldRows.some((r) => r.variant_id === variantId)
      ? load(
          ctx.supabase
            .from("v_variant_overview")
            .select("variant_id, product_id, product_name, variant_name, display_name")
            .eq("variant_id", variantId)
            .maybeSingle<SoldVariant>(),
        )
      : Promise.resolve(null),
    productId && !soldRows.some((r) => r.product_id === productId)
      ? load(ctx.supabase.from("products").select("id, name").eq("id", productId).maybeSingle<{ id: string; name: string }>())
      : Promise.resolve(null),
  ]);
  const variantInfo = variantId ? (soldRows.find((r) => r.variant_id === variantId) ?? selVariant?.data ?? null) : null;
  // Varyant başka bir ürüne aitse (ürün seçimi değişti) veya hiç yoksa varyant filtresini bırak;
  // aksi hâlde iki filtre birlikte uygulanır ve liste anlamsız biçimde boşalır.
  const variantMissing = !!variantId && !variantInfo && !!selVariant && !selVariant.error;
  if (variantId && ((productId && variantInfo && variantInfo.product_id !== productId) || variantMissing)) {
    redirect(hrefWith(BASE, values, { varyant: null, sayfa: null }));
  }
  if (productId && selProduct && !selProduct.error && !selProduct.data) {
    redirect(hrefWith(BASE, values, { urun: null, varyant: null, sayfa: null }));
  }

  const productOptions = Array.from(new Map(soldRows.map((r) => [r.product_id, r.product_name])).entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "tr"));
  if (productId && !productOptions.some((o) => o.value === productId)) {
    productOptions.unshift({ value: productId, label: selProduct?.data ? `${selProduct.data.name} (satış yok)` : "Seçili ürün" });
  }
  // Varyant seçimi yalnız ürün seçiliyken gösterilir; seçenekler o ürünün kısa varyant adlarıdır.
  const variantOptions = soldRows.filter((r) => r.product_id === productId).map((r) => ({ value: r.variant_id, label: r.variant_name }));
  if (variantId && !variantOptions.some((o) => o.value === variantId)) {
    // Buraya yalnız satışı olmayan (ayrıca bulunan) varyant veya bulunamayan kayıt düşer.
    variantOptions.unshift({ value: variantId, label: variantInfo ? `${variantInfo.variant_name} (satış yok)` : "Seçili varyant" });
  }
  const customerOptions = [
    { value: "perakende", label: "Perakende / belirtilmemiş" },
    ...(customers.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];

  // Özet
  const t = summary.data?.totals;
  const pt = prevSummary?.data?.totals ?? null;
  const cancelled = summary.data?.cancelled;
  const margin = t ? marginPct(t.gross_profit_try, t.revenue_try) : null;
  const deltaLabel = period.days ? `önceki ${fmtInt(period.days)} güne göre` : "";
  const delta = (cur: number | undefined, prev: number | undefined) =>
    period.prev && prevSummary && !prevSummary.error ? { pct: pctChange(cur, prev), label: deltaLabel } : undefined;

  // Grafik serisi: boş günler/aylar 0 ile doldurulur
  const chartFrom = period.from ?? t?.first_day ?? null;
  const chartTo = period.to ?? today;
  // Açık uçlu aralıkta seri günlük gelir; kapsam 92 günü aşarsa burada aylara toplanır.
  const granularity = chartGranularity(chartFrom, chartTo);
  const byKey = new Map<string, TrendPoint>();
  for (const s of summary.data?.series ?? []) {
    const key = granularity === "aylik" ? s.bucket.slice(0, 7) : s.bucket;
    const p = byKey.get(key);
    byKey.set(key, {
      key,
      sale_count: (p?.sale_count ?? 0) + s.sale_count,
      quantity: (p?.quantity ?? 0) + s.quantity,
      revenue_try: (p?.revenue_try ?? 0) + Number(s.revenue_try),
      cogs_try: (p?.cogs_try ?? 0) + Number(s.cogs_try),
      gross_profit_try: (p?.gross_profit_try ?? 0) + Number(s.gross_profit_try),
    });
  }
  const points: TrendPoint[] =
    chartFrom && chartFrom <= chartTo
      ? buckets(chartFrom, chartTo, granularity).map(
          (key) => byKey.get(key) ?? { key, sale_count: 0, quantity: 0, revenue_try: 0, cogs_try: 0, gross_profit_try: 0 },
        )
      : [];
  const rangeText = chartFrom ? `${fmtDate(chartFrom)} – ${fmtDate(chartTo)}` : "Satış yok";

  const customerRows: BreakdownRow[] = (summary.data?.by_customer ?? []).map((c) => ({
    key: c.customer_id ?? "perakende",
    label: c.customer_name ?? "Perakende / belirtilmemiş",
    href: hrefWith(BASE, values, {
      musteri: c.customer_id ?? "perakende",
      sayfa: null,
    }),
    revenue_try: Number(c.revenue_try),
    gross_profit_try: Number(c.gross_profit_try),
    quantity: c.quantity,
    sale_count: c.sale_count,
  }));
  const variantRows: BreakdownRow[] = (summary.data?.by_variant ?? []).map((v) => ({
    key: v.variant_id,
    label: v.display_name,
    href: hrefWith(BASE, values, { urun: v.product_id, varyant: v.variant_id, sayfa: null }),
    revenue_try: Number(v.revenue_try),
    gross_profit_try: Number(v.gross_profit_try),
    quantity: v.quantity,
    sale_count: v.sale_count,
  }));

  // Sayfa numarası sonuç sayısını aşarsa (ör. filtre değişince) ilk sayfaya dön.
  if (res.error && lp.page > 1) redirect(hrefWith(BASE, values, { sayfa: null }));
  const rows = res.data ?? [];
  const filtered = Object.keys(values).some((k) => !["sayfa", "adet", "sirala", "yon"].includes(k));
  const sortProps = { sort: lp.sort, dir: lp.dir, basePath: BASE, values };
  const keep = Object.fromEntries(Object.entries(values).filter(([k]) => !PERIOD_KEYS.has(k)));
  const periodItems = PERIOD_PRESETS.map((p) => ({
    key: p.key,
    label: p.label,
    href: hrefWith(BASE, values, {
      donem: p.key === "tumu" ? null : p.key,
      bas: null,
      bit: null,
      sayfa: null,
    }),
  }));
  // "Son 90 gün" gibi etiketler süreyi zaten söyler; gün sayısı yalnız takvim dönemlerinde ve özel aralıkta yazılır.
  const showDays = ["bu-ay", "gecen-ay", "bu-yil", "ozel"].includes(period.key);
  const lineLevel = !!(productId || variantId);

  // Durum sekmeleri yalnız listeyi süzer (özet ve grafikler hep gerçekleşen satışlardır).
  // Sayılar aynı filtre ve dönemle özet işlevinden gelir.
  const completedCount = t ? t.sale_count : null;
  const cancelledCount = cancelled ? cancelled.sale_count : null;
  const statusItems = [
    { key: "tumu", label: "Tümü", count: completedCount !== null && cancelledCount !== null ? completedCount + cancelledCount : null },
    { key: "gerceklesti", label: "Gerçekleşti", count: completedCount },
    { key: "iptal", label: "İptal", count: cancelledCount },
  ].map((s) => ({
    key: s.key,
    label: (
      <>
        {s.label}
        {s.count !== null ? <span className="ml-1 text-ink-muted tabular-nums">{fmtInt(s.count)}</span> : null}
      </>
    ),
    href: hrefWith(BASE, values, { durum: s.key === "tumu" ? null : s.key, sayfa: null }),
  }));
  const statusKey = status === "completed" ? "gerceklesti" : status === "cancelled" ? "iptal" : "tumu";

  return (
    <>
      <PageHeader
        title="Satışlar"
        description="Mekonsis'in gerçekleştirdiği satışlar. Ciro ve brüt kâr yalnız gerçekleşen satışlardan oluşur; maliyet Mekonsis rafındaki partilerden FIFO ile tahsis edilir. Teslimatlar satış değildir."
        actions={
          ctx.role === "admin" ? (
            <ButtonLink href="/satislar/yeni">
              <Plus aria-hidden />
              Satış ekle
            </ButtonLink>
          ) : null
        }
      />

      {/* Filtreler: arama + seçimler + dönem. Özet kartları, grafikler ve liste bunlara göre çalışır. */}
      <section aria-label="Satış filtreleri" className="card mb-4">
        <ListToolbar
          basePath={BASE}
          values={values}
          total={res.error ? null : res.count}
          noun="satış"
          search={{ placeholder: "Satış no, ürün, müşteri…" }}
          filters={[
            { key: "urun", label: "Ürün", options: productOptions },
            ...(productId ? [{ key: "varyant", label: "Varyant", options: variantOptions }] : []),
            { key: "musteri", label: "Müşteri", options: customerOptions },
          ]}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-soft uppercase">
              <CalendarDays className="size-4 text-ink-muted" aria-hidden />
              Dönem
            </span>
            <LinkSegmented items={periodItems} active={period.key} />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-xs text-ink-muted">Özel aralık</span>
            <CustomRangeForm
              key={`${period.from ?? ""}-${period.to ?? ""}`}
              basePath={BASE}
              from={period.from ?? ""}
              to={period.to ?? ""}
              today={today}
              active={period.key === "ozel"}
              keep={keep}
            />
          </div>
          <p className="text-xs text-ink-muted tabular-nums 2xl:ml-auto">
            <span className="font-medium text-ink-soft">{period.label}</span>
            {period.key === "tumu" ? ` · ${rangeText}` : period.key !== "ozel" && period.from && period.to ? ` · ${fmtDate(period.from)} – ${fmtDate(period.to)}` : ""}
            {showDays && period.days ? ` · ${fmtInt(period.days)} gün` : ""}
          </p>
        </div>
        {sold.error || customers.error ? (
          <p className="border-t border-line px-4 py-2 text-xs text-chart-red">Filtre seçenekleri yüklenemedi: {sold.error ?? customers.error}</p>
        ) : null}
      </section>

      {summary.error ? (
        <Card className="mb-4">
          <ErrorState message={summary.error} compact title="Satış özeti yüklenemedi" />
        </Card>
      ) : t ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard
              label="Ciro"
              scope="Seçilen dönem"
              value={fmtMoney(t.revenue_try, "TRY")}
              icon={Banknote}
              tone="blue"
              delta={delta(t.revenue_try, pt?.revenue_try)}
              description={`Satış günü kuruyla TL · ${fmtMoney(t.revenue_usd, "USD")}`}
            />
            <StatCard
              label="Brüt kâr"
              scope="FIFO maliyetiyle"
              value={fmtMoney(t.gross_profit_try, "TRY")}
              icon={TrendingUp}
              tone={t.gross_profit_try < 0 ? "red" : "teal"}
              delta={delta(t.gross_profit_try, pt?.gross_profit_try)}
              description={`Marj ${fmtRatio(margin)} · FIFO maliyeti ${fmtMoney(t.cogs_try, "TRY")}`}
            />
            <StatCard
              label="Satılan adet"
              value={fmtInt(t.quantity)}
              unit="adet"
              icon={Package}
              tone="violet"
              delta={delta(t.quantity, pt?.quantity)}
              description={t.sale_count > 0 ? `Satış başına ortalama ${fmtNum(t.quantity / t.sale_count, 1)} adet` : "Dönemde satış yok"}
            />
            <StatCard
              label="Satış sayısı"
              scope="Gerçekleşen"
              value={fmtInt(t.sale_count)}
              icon={Receipt}
              tone="sky"
              delta={delta(t.sale_count, pt?.sale_count)}
              description={
                cancelled && cancelled.sale_count > 0
                  ? `${fmtInt(cancelled.sale_count)} iptal hariç (${fmtMoney(cancelled.revenue_try, "TRY")})`
                  : `İptal yok · ${fmtInt(t.customer_count)} kurumsal müşteri`
              }
            />
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <Card
              title="Ciro ve brüt kâr trendi"
              description={`${rangeText} · ${granularity === "aylik" ? "aylık" : "günlük"} · yalnız gerçekleşen satışlar`}
              padded={false}
            >
              <div className="p-4">
                <SalesTrendChart points={points} granularity={granularity} periodLabel={rangeText} />
              </div>
              <div className="border-t border-line">
                <MetricRow
                  items={[
                    {
                      label: "Ort. satış tutarı",
                      value: t.sale_count > 0 ? fmtMoney(t.revenue_try / t.sale_count, "TRY") : "—",
                    },
                    {
                      label: "Ort. birim fiyat",
                      value: t.quantity > 0 ? fmtMoney(t.revenue_try / t.quantity, "TRY") : "—",
                      hint: "TL / adet",
                    },
                    {
                      label: "Ort. FIFO maliyeti",
                      value: t.quantity > 0 ? fmtMoney(t.cogs_try / t.quantity, "TRY") : "—",
                      hint: "TL / adet",
                    },
                    { label: "Brüt marj", value: fmtRatio(margin) },
                  ]}
                />
              </div>
            </Card>
            <Card
              title="Ciro kırılımı"
              description={
                lineLevel ? "Seçilen ürün/varyant kalemleri · bir satıra tıklayınca liste filtrelenir" : "Bir satıra tıklayınca liste filtrelenir"
              }
            >
              <SalesBreakdown customers={customerRows} variants={variantRows} total={t.revenue_try} />
            </Card>
          </div>
        </>
      ) : null}

      <Card
        padded={false}
        title="Satış listesi"
        description={
          status === "cancelled"
            ? "İptal edilen satışlar ciro ve kâra dahil değildir; özet kartları ve grafikler yalnız gerçekleşen satışları gösterir."
            : lineLevel
              ? "Ürün/varyant filtresinde özet kartları yalnız ilgili kalemleri toplar; tablodaki tutarlar satışın tamamıdır."
              : "Satış tutarı satışın kendi para birimindedir; ciro, FIFO maliyeti ve brüt kâr TL'dir (satış günü kuruyla sabitlenir)."
        }
        actions={
          <nav aria-label="Satış durumu">
            <LinkSegmented items={statusItems} active={statusKey} />
          </nav>
        }
      >
        {res.error ? (
          <ErrorState message={res.error} />
        ) : rows.length === 0 ? (
          <EmptyState title={filtered ? "Filtrelerle eşleşen satış yok" : "Henüz satış yok"} icon={ShoppingCart}>
            {filtered ? "Dönemi veya filtreleri değiştirin ya da temizleyin." : "Mekonsis'in gerçekleştirdiği ilk satışı girin."}
          </EmptyState>
        ) : (
          <>
            {/* Telefon: kompakt satır listesi */}
            <ul className="divide-y divide-line sm:hidden">
              {rows.map((s) => {
                const off = s.status === "cancelled";
                return (
                  <li key={s.id} className={cx("px-4 py-3", off && "bg-canvas/50 text-ink-muted")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/satislar/${s.id}`} className={cx("link font-mono text-xs", off && "text-ink-muted")}>
                          {s.sale_no}
                        </Link>
                        <p className="text-xs text-ink-muted tabular-nums">
                          {fmtDate(s.sold_on)} · {s.customer_name ?? "Perakende"}
                        </p>
                      </div>
                      <div className={cx("shrink-0 text-right tabular-nums", off && STRIKE)}>
                        <p className={cx("text-[13px] font-semibold", !off && "text-ink")}>{fmtMoney(s.revenue_try, "TRY")}</p>
                        {s.currency !== "TRY" ? (
                          <p className="text-[11px] text-ink-muted" title="Satışın kendi para biriminde tutarı">
                            {fmtMoney(s.total_amount, s.currency)}
                          </p>
                        ) : null}
                        <p className={cx("text-xs", !off && profitTone(s.gross_profit_try))}>
                          kâr {fmtMoney(s.gross_profit_try, "TRY")} · {fmtRatio(marginPct(s.gross_profit_try, s.revenue_try))}
                        </p>
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-end justify-between gap-3">
                      <p className="line-clamp-2 min-w-0 text-xs text-ink-soft">
                        {s.quote_id ? <QuoteTag /> : null}
                        {s.items_summary ?? "—"}
                      </p>
                      <span className="shrink-0">
                        <SaleStatusBadge status={s.status} />
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <TableWrap className="hidden sm:block">
              <table className="table-base [&_td]:px-2.5 [&_th]:px-2.5 [&_tr>*:first-child]:pl-4 [&_tr>*:last-child]:pr-4">
                <thead>
                  <tr>
                    <th aria-sort={lp.sort === "sale_no" ? (lp.dir === "asc" ? "ascending" : "descending") : undefined}>
                      <span className="inline-flex items-center gap-2.5">
                        <SortLink label="Satış" column="sale_no" sort={lp.sort} dir={lp.dir} values={values} />
                        <SortLink label="Tarih" column="sold_on" sort={lp.sort} dir={lp.dir} values={values} className="min-[1600px]:hidden" />
                      </span>
                    </th>
                    <SortTh label="Tarih" column="sold_on" className={DATE_CELL} {...sortProps} />
                    <SortTh label="Müşteri / kalemler" column="customer_name" {...sortProps} />
                    <SortTh label="Adet" column="total_quantity" align="right" {...sortProps} />
                    <th className="num hidden md:table-cell" title="Satışın kendi para biriminde toplam tutar">
                      Satış tutarı
                    </th>
                    <SortTh label="Ciro" title="Ciro, TL (satış günü kuruyla)" column="revenue_try" align="right" {...sortProps} />
                    <SortTh
                      label="FIFO maliyeti"
                      title="FIFO parti maliyeti, TL"
                      column="cogs_try"
                      align="right"
                      className={WIDE_CELL}
                      {...sortProps}
                    />
                    <SortTh label="Brüt kâr" title="Gerçekleşmiş brüt kâr, TL" column="gross_profit_try" align="right" {...sortProps} />
                    <SortTh label="Marj" column="margin_pct" align="right" className="hidden xl:table-cell" {...sortProps} />
                    <th className={WIDE_CELL}>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const off = s.status === "cancelled";
                    return (
                      <tr key={s.id} className={cx(off && "text-ink-muted [&_td]:bg-canvas/50")}>
                        <td className="whitespace-nowrap">
                          <Link href={`/satislar/${s.id}`} className={cx("link font-mono text-xs", off && "text-ink-muted")}>
                            {s.sale_no}
                          </Link>
                          <span className="block text-[11px] text-ink-muted tabular-nums min-[1600px]:hidden">{fmtDate(s.sold_on)}</span>
                          {off ? (
                            <span className="mt-0.5 block min-[1360px]:hidden">
                              <SaleStatusBadge status={s.status} />
                            </span>
                          ) : null}
                        </td>
                        <td className={cx(DATE_CELL, "whitespace-nowrap tabular-nums")}>{fmtDate(s.sold_on)}</td>
                        <td className="min-w-[12rem]">
                          {s.customer_name ? (
                            <Link
                              href={`/musteriler/${s.customer_id}`}
                              className={cx("block truncate font-medium hover:text-brand-600 hover:underline", !off && "text-ink")}
                              title={s.customer_name}
                            >
                              {s.customer_name}
                            </Link>
                          ) : (
                            <span className="block text-xs font-medium text-ink-muted">Perakende / belirtilmemiş</span>
                          )}
                          <span className="line-clamp-2 text-xs text-ink-muted" title={s.items_summary ?? undefined}>
                            {s.quote_id ? <QuoteTag /> : null}
                            {s.items_summary ?? "—"}
                          </span>
                        </td>
                        <td className="num">{fmtInt(s.total_quantity)}</td>
                        <td className={cx("num hidden md:table-cell", off && STRIKE)}>
                          {fmtMoney(s.total_amount, s.currency)}
                          {s.currency === "USD" ? <span className="block text-[11px] text-ink-muted">kur {fmtRate(s.fx_rate)}</span> : null}
                        </td>
                        <td className={cx("num", off ? STRIKE : "font-medium text-ink")}>{fmtMoney(s.revenue_try, "TRY")}</td>
                        <td className={cx("num", WIDE_CELL, off && STRIKE)}>{fmtMoney(s.cogs_try, "TRY")}</td>
                        <td className={cx("num", off ? STRIKE : cx("font-medium", profitTone(s.gross_profit_try)))}>
                          {fmtMoney(s.gross_profit_try, "TRY")}
                          {/* Marj sütunu gizliyken (xl altı) kârın altında */}
                          <span className="block text-[11px] font-normal text-ink-muted xl:hidden">
                            marj {fmtRatio(marginPct(s.gross_profit_try, s.revenue_try))}
                          </span>
                        </td>
                        <td className={cx("num hidden xl:table-cell", off ? STRIKE : Number(s.gross_profit_try) < 0 && "text-chart-red")}>
                          {fmtRatio(marginPct(s.gross_profit_try, s.revenue_try))}
                        </td>
                        <td className={WIDE_CELL}>
                          <SaleStatusBadge status={s.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          </>
        )}
        {!res.error && res.count ? (
          <Pagination basePath={BASE} values={values} page={lp.page} pageSize={lp.pageSize} total={res.count} noun="satış" />
        ) : null}
      </Card>
    </>
  );
}
