import { CalendarRange, ChevronRight, Package, PieChart, Plus, Store, Truck, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DeliveryStatusBadge } from "@/components/status";
import { Alert, ButtonLink, Card, cx, EmptyState, ErrorState, MetricRow, PageHeader, ProgressBar, StatCard, TableWrap } from "@/components/ui";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { LinkSegmented, Pagination, SortTh } from "@/components/ui/list";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtInt, fmtMoney, fmtPct, todayTr } from "@/lib/format";
import { hrefWith, isoDateOrNull, parseListParams, searchPattern, type SearchParams } from "@/lib/list-params";
import { buckets, daysBetween } from "@/lib/period";
import { load } from "@/lib/query";
import type { DeliveryView } from "@/lib/types";
import { last12MonthsFrom } from "../rafim/_components/types";
import { SellThroughList } from "../rafim/_components/Bars";
import { DeliveryFlowChart, type DeliveryPoint } from "./_components/DeliveryCharts";

export const metadata: Metadata = { title: "Teslimatlar" };

const BASE = "/teslimatlar";
const MOBILE_SORTS = [
  { key: "delivered_on", dir: "desc", label: "En yeni" },
  { key: "remaining_qty", dir: "desc", label: "En çok kalan" },
  { key: "quantity", dir: "desc", label: "En büyük" },
] as const;
/** Yalnız bitiş tarihi seçildiğinde özet sorgusunun alt sınırı (tüm geçmiş). */
const ALL_TIME_FROM = "2000-01-01";
const SORTABLE = ["delivered_on", "delivery_no", "display_name", "quantity", "sold_qty", "remaining_qty", "delivered_cost_try"];

interface DailyRow {
  delivered_on: string;
  delivery_count: number;
  quantity: number;
  cost_try: number;
  sold_qty: number;
  remaining_qty: number;
  cancelled_count: number;
  cancelled_qty: number;
}

interface VariantDeliveryRow {
  variant_id: string;
  product_id: string;
  display_name: string;
  delivery_count: number;
  quantity: number;
  cost_try: number;
  sold_qty: number;
  remaining_qty: number;
}

type Row = DeliveryView & { product_id: string; product_name: string; variant_name: string };

export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireMember();
  const isAdmin = ctx.role === "admin";
  const lp = parseListParams(await searchParams, { sortable: SORTABLE, defaultSort: "delivered_on", defaultDir: "desc" });
  const values = lp.values;
  const today = todayTr();

  // Özet dönemi (kartlar ve grafikler) listeyle aynı aralığı kapsar:
  //  - tarih filtresi yok: son 12 ay (etiket bunu açıkça söyler; liste tüm teslimatlardır)
  //  - yalnız bitiş: ilk teslimattan bitişe (liste de alt sınırsızdır)
  //  - başlangıç (± bitiş): başlangıç → min(bitiş, bugün)
  // Ters veya gelecekte başlayan aralıkta özet hesaplanmaz, nedeni yazılır.
  const bas = isoDateOrNull(values.bas);
  const bit = isoDateOrNull(values.bit);
  const customPeriod = !!(bas || bit);
  const openStart = !bas && !!bit;
  const periodTo = bit && bit < today ? bit : today;
  const queryFrom = bas ?? (openStart ? ALL_TIME_FROM : last12MonthsFrom(periodTo));
  const rangeProblem: string | null =
    bas && bit && bas > bit
      ? `Başlangıç tarihi (${fmtDate(bas)}) bitiş tarihinden (${fmtDate(bit)}) sonra; bu aralıkta teslimat olamaz.`
      : bas && bas > today
        ? `Başlangıç tarihi (${fmtDate(bas)}) bugünden sonra; özet yalnız bugüne kadarki teslimatlar için hesaplanır.`
        : null;
  const productId = values.urun && /^[0-9a-f-]{36}$/i.test(values.urun) ? values.urun : null;

  let query = ctx.supabase.from("v_deliveries").select("*", { count: "exact" });
  const pattern = searchPattern(lp.q);
  if (pattern)
    query = query.or(
      `delivery_no.ilike.${pattern},display_name.ilike.${pattern},product_code.ilike.${pattern},variant_code.ilike.${pattern},batches.ilike.${pattern}`,
    );
  if (productId) query = query.eq("product_id", productId);
  if (values.durum === "aktif") query = query.eq("status", "active");
  else if (values.durum === "iptal") query = query.eq("status", "cancelled");
  if (values.satis === "kalan") query = query.eq("status", "active").gt("remaining_qty", 0);
  else if (values.satis === "tukendi") query = query.eq("status", "active").eq("remaining_qty", 0);
  if (bas) query = query.gte("delivered_on", bas);
  if (bit) query = query.lte("delivered_on", bit);

  const [res, products, deliveredVariants, cancelledDeliveries, daily, byVariant] = await Promise.all([
    load(
      query
        .order(lp.sort ?? "delivered_on", { ascending: lp.dir === "asc" })
        .order("created_at", { ascending: false })
        .range(lp.from, lp.to)
        .returns<Row[]>(),
    ),
    load(ctx.supabase.from("products").select("id, code, name").order("name").returns<{ id: string; code: string; name: string }[]>()),
    // Ürün filtresinde yalnız teslimatı olan ürünler: aktif teslimatı olan varyantlar + geri alınan teslimatlar (az sayıda)
    load(
      ctx.supabase
        .from("v_variant_overview")
        .select("product_id")
        .gt("delivered_qty", 0)
        .returns<{ product_id: string }[]>(),
    ),
    load(ctx.supabase.from("v_deliveries").select("product_id").eq("status", "cancelled").returns<{ product_id: string }[]>()),
    rangeProblem
      ? Promise.resolve({ data: [] as DailyRow[], error: null, count: null })
      : load<DailyRow[]>(ctx.supabase.rpc("delivery_daily_summary", { p_from: queryFrom, p_to: periodTo, p_product_id: productId })),
    rangeProblem
      ? Promise.resolve({ data: [] as VariantDeliveryRow[], error: null, count: null })
      : load<VariantDeliveryRow[]>(ctx.supabase.rpc("delivery_by_variant", { p_from: queryFrom, p_to: periodTo, p_product_id: productId })),
  ]);

  // Sayfa numarası sonuç sayısını aşarsa (eski yer imi, filtre sonrası azalan sonuç) ilk sayfaya dön.
  if (res.error && lp.page > 1 && /range not satisfiable|sonuçların dışında/i.test(res.error)) redirect(hrefWith(BASE, values, { sayfa: null }));

  // Özet
  const days = daily.data ?? [];
  // Yalnız bitiş seçiliyse dönem ilk teslimat gününden başlar (liste de alt sınırsızdır).
  const periodFrom = openStart ? days.reduce((m, d) => (d.delivered_on < m ? d.delivered_on : m), periodTo) : queryFrom;
  const sum = (k: keyof Omit<DailyRow, "delivered_on">) => days.reduce((s, d) => s + Number(d[k]), 0);
  const tot = {
    count: sum("delivery_count"),
    qty: sum("quantity"),
    cost: sum("cost_try"),
    sold: sum("sold_qty"),
    remaining: sum("remaining_qty"),
    cancelledCount: sum("cancelled_count"),
    cancelledQty: sum("cancelled_qty"),
  };
  const periodDays = periodFrom <= periodTo ? daysBetween(periodFrom, periodTo) : 0;
  const isDaily = periodDays > 0 && periodDays <= 62;
  const points: DeliveryPoint[] =
    periodDays > 0
      ? buckets(periodFrom, periodTo, isDaily ? "gunluk" : "aylik").map((key) => {
          const ds = days.filter((d) => (isDaily ? d.delivered_on === key : d.delivered_on.slice(0, 7) === key));
          return {
            key,
            count: ds.reduce((s, d) => s + d.delivery_count, 0),
            qty: ds.reduce((s, d) => s + d.quantity, 0),
            sold: ds.reduce((s, d) => s + d.sold_qty, 0),
            remaining: ds.reduce((s, d) => s + d.remaining_qty, 0),
            costTry: ds.reduce((s, d) => s + Number(d.cost_try), 0),
            cancelled: ds.reduce((s, d) => s + d.cancelled_qty, 0),
          };
        })
      : [];
  const variantRows = [...(byVariant.data ?? [])].sort((a, b) => b.quantity - a.quantity);
  const productName = productId ? (products.data ?? []).find((p) => p.id === productId)?.name : null;
  const periodText =
    openStart && days.length === 0 ? `${fmtDate(periodTo)} ve öncesi` : `${fmtDate(periodFrom)} – ${fmtDate(periodTo)}`;
  const scope = customPeriod ? "Seçilen dönem" : "Son 12 ay";
  const TOP_VARIANTS = 6;

  // Ürün filtresi: teslimatı olan ürünler (seçili ürün her durumda listede kalır).
  // Teslimatlı ürün listesi yüklenemezse tüm ürünler gösterilir ve uyarı verilir.
  const deliveredError = deliveredVariants.error ?? cancelledDeliveries.error;
  const deliveredProductIds = new Set([
    ...(deliveredVariants.data ?? []).map((v) => v.product_id),
    ...(cancelledDeliveries.data ?? []).map((v) => v.product_id),
  ]);
  const productOptions = (products.data ?? [])
    .filter((p) => deliveredError || deliveredProductIds.has(p.id) || p.id === productId)
    .map((p) => ({ value: p.id, label: p.name }));
  const filterError = products.error
    ? `Ürün filtresi yüklenemedi: ${products.error}`
    : deliveredError
      ? `Teslimatı olan ürünler belirlenemedi; filtrede tüm ürünler gösteriliyor (${deliveredError}).`
      : null;

  const rows = res.data ?? [];
  const filtered = Object.keys(values).some((k) => !["sayfa", "adet", "sirala", "yon"].includes(k));
  const sortProps = { sort: lp.sort, dir: lp.dir, basePath: BASE, values };

  return (
    <>
      <PageHeader
        title="Teslimatlar"
        description="Heatemp rafından Mekonsis satış rafına yapılan transferler. Teslimat satış değildir; ciro ve kâr oluşturmaz, ürün satılana kadar Heatemp'in varlığıdır."
        actions={
          <>
            <ButtonLink href="/mekonsis" variant="secondary">
              <Store aria-hidden />
              Mekonsis rafı
            </ButtonLink>
            {isAdmin ? (
              <ButtonLink href="/rafim?islem=teslimat">
                <Plus aria-hidden />
                Yeni teslimat
              </ButtonLink>
            ) : null}
          </>
        }
      />

      {rangeProblem ? (
        <Alert tone="warning" title="Geçersiz tarih aralığı — özet hesaplanamadı" className="mb-4">
          {rangeProblem}{" "}
          <Link href={hrefWith(BASE, values, { bas: null, bit: null, sayfa: null })} className="font-semibold underline">
            Tarih filtresini temizle
          </Link>
        </Alert>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 font-medium text-ink-soft shadow-(--shadow-card)">
              <CalendarRange className="size-3.5" aria-hidden />
              {customPeriod ? "Seçilen dönem" : "Son 12 ay"}: {periodText}
            </span>
            {productName ? <span>Ürün: {productName}</span> : null}
            <span>
              {openStart
                ? "Yalnız bitiş tarihi seçildi: özet, listedeki gibi ilk teslimattan bitiş tarihine kadardır."
                : customPeriod
                  ? "Özetler listedeki tarih aralığı ve ürün filtresine göre hesaplanır."
                  : "Tarih seçilmedi: özetler son 12 ayı, liste tüm teslimatları gösterir."}{" "}
              Satılan/kalan bugünkü durumdur.
            </span>
          </div>

          {daily.error ? (
            <Card className="mb-4">
              <ErrorState message={daily.error} compact title="Teslimat özeti yüklenemedi" />
            </Card>
          ) : (
            <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
              <StatCard
                label="Teslimat"
                scope={scope}
                value={fmtInt(tot.count)}
                unit="kayıt"
                icon={Truck}
                tone="sky"
                description={
                  tot.cancelledCount > 0
                    ? `Ayrıca ${fmtInt(tot.cancelledCount)} teslimat geri alındı (${fmtInt(tot.cancelledQty)} adet)`
                    : "Geri alınan teslimat yok"
                }
              />
              <StatCard
                label="Miktar"
                scope={scope}
                value={fmtInt(tot.qty)}
                unit="adet"
                icon={Package}
                tone="brand"
                description={
                  tot.count > 0
                    ? `Teslim edilen · teslimat başına ortalama ${fmtInt(Math.round(tot.qty / tot.count))} adet`
                    : "Dönemde teslimat yok"
                }
              />
              <StatCard
                label="Maliyet"
                scope={scope}
                value={fmtMoney(tot.cost, "TRY")}
                icon={Wallet}
                tone="violet"
                description="Taşınan parti maliyeti; satış değildir, Heatemp varlığı olarak kalır"
              />
              <StatCard
                label="Satış oranı"
                scope="Bugüne kadar"
                value={tot.qty > 0 ? fmtPct((tot.sold / tot.qty) * 100) : "—"}
                icon={PieChart}
                tone="teal"
                description={
                  tot.qty > 0 ? `${fmtInt(tot.sold)} adet satıldı · ${fmtInt(tot.remaining)} adet Mekonsis'te` : "Dönemde teslimat yok"
                }
              />
            </div>
          )}

          <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <Card title="Teslimat akışı" description={`${periodText} · ${isDaily ? "günlük" : "aylık"}`} padded={false}>
              {daily.error ? (
                <ErrorState message={daily.error} compact />
              ) : (
                <>
                  <div className="p-4 pb-3">
                    <DeliveryFlowChart data={points} daily={isDaily} />
                  </div>
                  <div className="border-t border-line">
                    <MetricRow
                      items={[
                        {
                          label: "Satılan",
                          value: `${fmtInt(tot.sold)} adet`,
                          hint: tot.qty > 0 ? `Bugüne kadar · teslim edilenin ${fmtPct((tot.sold / tot.qty) * 100)}` : "Dönemde teslimat yok",
                        },
                        {
                          label: "Mekonsis'te kalan",
                          value: `${fmtInt(tot.remaining)} adet`,
                          hint: "Satılana kadar Heatemp'in varlığı",
                        },
                        {
                          label: "Geri alınan",
                          value: `${fmtInt(tot.cancelledQty)} adet`,
                          hint: `${fmtInt(tot.cancelledCount)} teslimat · toplamlara dahil değil`,
                        },
                        {
                          label: "Teslim edilen varyant",
                          value: byVariant.error ? "—" : fmtInt(variantRows.length),
                          hint: byVariant.error ? "Yüklenemedi" : `${fmtInt(days.filter((x) => x.delivery_count > 0).length)} farklı günde teslimat`,
                        },
                      ]}
                    />
                  </div>
                </>
              )}
            </Card>
            <Card title="En çok teslim edilen varyantlar" description={`${periodText} · aktif teslimatlar · satılan / teslim edilen`}>
              {byVariant.error ? (
                <ErrorState message={byVariant.error} compact />
              ) : (
                <SellThroughList
                  rows={variantRows.slice(0, TOP_VARIANTS).map((r) => ({
                    key: r.variant_id,
                    label: r.display_name,
                    href: `/urunler/${r.product_id}/varyant/${r.variant_id}?sekme=stok`,
                    sold: r.sold_qty,
                    remaining: r.remaining_qty,
                    meta: `${fmtInt(r.delivery_count)} teslimat`,
                  }))}
                  emptyText="Seçilen dönemde teslimat yok."
                />
              )}
              {variantRows.length > TOP_VARIANTS ? (
                <p className="mt-3 text-xs text-ink-muted">
                  İlk {TOP_VARIANTS} varyant gösteriliyor (toplam {fmtInt(variantRows.length)}). Ürün filtresiyle daraltabilirsiniz.
                </p>
              ) : null}
            </Card>
          </div>
        </>
      )}

      <Card
        padded={false}
        title="Teslimat listesi"
        description="Satırdaki teslimat numarası parti katmanlarına ve satış tahsislerine götürür."
      >
        <ListToolbar
          basePath={BASE}
          values={values}
          total={res.error ? null : res.count}
          noun="teslimat"
          search={{ placeholder: "Teslimat no, ürün, kod, parti…" }}
          filters={[
            {
              key: "urun",
              label: "Ürün",
              options: productOptions,
            },
            {
              key: "durum",
              label: "Durum",
              options: [
                { value: "aktif", label: "Aktif" },
                { value: "iptal", label: "Geri alındı (iptal)" },
              ],
            },
            {
              key: "satis",
              label: "Satış durumu",
              options: [
                { value: "kalan", label: "Mekonsis'te kalan var" },
                { value: "tukendi", label: "Tamamı satıldı" },
              ],
            },
          ]}
          dateRange={{ label: "Teslimat tarihi" }}
        />
        {filterError ? (
          <Alert tone={products.error ? "error" : "warning"} className="mx-4 mt-3">
            {filterError}
          </Alert>
        ) : null}
        {res.error ? (
          <ErrorState message={res.error} />
        ) : rows.length === 0 ? (
          <EmptyState title={filtered ? "Filtrelerle eşleşen teslimat yok" : "Henüz teslimat yok"} icon={Truck}>
            {filtered ? "Filtreleri değiştirin veya temizleyin." : "Heatemp rafından Mekonsis'e ilk teslimatı yapın."}
          </EmptyState>
        ) : (
          <>
            {/* Dar ekran: kart listesi + sıralama seçenekleri */}
            <div className="sm:hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
                <span className="text-xs text-ink-muted">Sırala</span>
                <LinkSegmented
                  active={`${lp.sort}-${lp.dir}`}
                  items={MOBILE_SORTS.map((m) => ({
                    key: `${m.key}-${m.dir}`,
                    label: m.label,
                    href: hrefWith(BASE, values, { sirala: m.key, yon: m.dir, sayfa: null }),
                  }))}
                />
              </div>
              <ul className="divide-y divide-line">
                {rows.map((d) => {
                  const cancelled = d.status === "cancelled";
                  return (
                    <li key={d.id}>
                      <Link href={`/teslimatlar/${d.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-canvas/60">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-mono text-xs font-medium text-brand-600">{d.delivery_no}</span>
                            <span className="text-xs text-ink-muted">{fmtDate(d.delivered_on)}</span>
                            <DeliveryStatusBadge status={d.status} />
                          </div>
                          <p className={cx("mt-1 text-[13px]", cancelled ? "text-ink-muted" : "text-ink")}>{d.display_name}</p>
                          <p className="mt-0.5 text-xs text-ink-muted tabular-nums">
                            {fmtInt(d.quantity)} adet
                            {cancelled ? " · geri alındı" : ` · ${fmtInt(d.sold_qty)} satıldı · ${fmtInt(d.remaining_qty)} kalan`} ·{" "}
                            {fmtMoney(d.delivered_cost_try, "TRY")}
                          </p>
                        </div>
                        <ChevronRight className="mt-1 size-4 shrink-0 text-ink-muted" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
            <TableWrap className="relative hidden sm:block">
              <table className="table-base">
                <thead>
                  <tr>
                    <SortTh label="Teslimat" column="delivery_no" {...sortProps} />
                    <SortTh label="Tarih" column="delivered_on" className="hidden sm:table-cell" {...sortProps} />
                    <SortTh label="Ürün / varyant" column="display_name" {...sortProps} />
                    <SortTh label="Adet" column="quantity" align="right" {...sortProps} />
                    <SortTh label="Satılan" column="sold_qty" align="right" className="hidden xl:table-cell" {...sortProps} />
                    <SortTh label="Kalan" column="remaining_qty" align="right" {...sortProps} />
                    <SortTh
                      label="Maliyet (TL)"
                      column="delivered_cost_try"
                      align="right"
                      className="hidden xl:table-cell"
                      {...sortProps}
                    />
                    <th className="hidden min-[87.5rem]:table-cell">Partiler</th>
                    <th className="hidden sm:table-cell">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => {
                    const cancelled = d.status === "cancelled";
                    const soldPct = d.quantity > 0 ? (d.sold_qty / d.quantity) * 100 : 0;
                    return (
                      <tr key={d.id} className={cx(cancelled && "text-ink-muted")}>
                        <td className="whitespace-nowrap">
                          <Link href={`/teslimatlar/${d.id}`} className="link font-mono text-xs">
                            {d.delivery_no}
                          </Link>
                          <span className="block text-[11px] text-ink-muted sm:hidden">{fmtDate(d.delivered_on)}</span>
                        </td>
                        <td className="hidden whitespace-nowrap sm:table-cell">{fmtDate(d.delivered_on)}</td>
                        <td className="min-w-[10rem] xl:min-w-[12rem]">
                          <span className={cx(!cancelled && "text-ink")}>{d.display_name}</span>
                          {d.batches ? (
                            // Partiler sütunu 1400 px altında gizli: parti numaraları ürün adının altında
                            <span className="mt-0.5 block font-mono text-[11px] text-ink-muted min-[87.5rem]:hidden" title="Partiler">
                              <span className="sr-only">Partiler: </span>
                              {d.batches.split(", ").map((b) => (
                                <span key={b} className="block whitespace-nowrap">
                                  {b}
                                </span>
                              ))}
                            </span>
                          ) : null}
                          {d.note ? (
                            <span className="block max-w-xs truncate text-xs text-ink-muted" title={d.note}>
                              {d.note}
                            </span>
                          ) : null}
                        </td>
                        <td className="num font-medium">
                          {fmtInt(d.quantity)}
                          {/* Maliyet sütunu xl altında gizli: taşınan maliyet adedin altında */}
                          <span className="block text-[11px] font-normal text-ink-muted xl:hidden" title="Taşınan parti maliyeti (TL)">
                            <span className="sr-only">Maliyet </span>
                            {fmtMoney(d.delivered_cost_try, "TRY")}
                          </span>
                        </td>
                        <td className="num hidden xl:table-cell">
                          {cancelled ? "—" : fmtInt(d.sold_qty)}
                          {!cancelled ? (
                            <span className="mt-1 ml-auto block w-16">
                              <ProgressBar
                                value={soldPct}
                                max={100}
                                tone="teal"
                                label={`${d.delivery_no} satış oranı %${Math.round(soldPct)}`}
                              />
                            </span>
                          ) : null}
                        </td>
                        <td className={cx("num", !cancelled && d.remaining_qty > 0 && "font-semibold text-ink")}>
                          {cancelled ? "—" : fmtInt(d.remaining_qty)}
                          {/* Satılan sütunu xl altında gizli: satılan adet ve oran kalanın altında */}
                          {!cancelled ? (
                            <span className="block text-[11px] font-normal whitespace-nowrap text-ink-muted xl:hidden">
                              {fmtInt(d.sold_qty)} satıldı
                              {d.sold_qty > 0 ? ` · %${Math.round(soldPct)}` : ""}
                            </span>
                          ) : null}
                        </td>
                        <td className="num hidden xl:table-cell">{fmtMoney(d.delivered_cost_try, "TRY")}</td>
                        <td className="hidden min-[87.5rem]:table-cell">
                          {d.batches
                            ? d.batches.split(", ").map((b) => (
                                <span key={b} className="code block">
                                  {b}
                                </span>
                              ))
                            : "—"}
                        </td>
                        <td className="hidden sm:table-cell">
                          <span title={cancelled && d.cancel_reason ? `Gerekçe: ${d.cancel_reason}` : undefined}>
                            <DeliveryStatusBadge status={d.status} />
                          </span>
                          {!cancelled && d.remaining_qty === 0 ? (
                            <span className="mt-0.5 block text-[11px] text-ink-muted">tamamı satıldı</span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          </>
        )}
        {res.count ? (
          <Pagination basePath={BASE} values={values} page={lp.page} pageSize={lp.pageSize} total={res.count} noun="teslimat" />
        ) : null}
      </Card>
    </>
  );
}
