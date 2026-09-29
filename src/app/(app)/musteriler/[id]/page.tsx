import {
  CalendarClock,
  CalendarPlus,
  Coins,
  FilePlus2,
  FileText,
  Hash,
  Mail,
  MapPin,
  Package,
  Pencil,
  Phone,
  Receipt,
  StickyNote,
  TrendingUp,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { QuoteStatusBadge, SaleStatusBadge } from "@/components/status";
import { Alert, Badge, Card, EmptyState, ErrorState, MetricRow, PageHeader, ProgressBar, StatCard, TableWrap, cx } from "@/components/ui";
import { Drawer } from "@/components/ui/dialog";
import { LinkSegmented, LinkTabs, Pagination, SortTh } from "@/components/ui/list";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtInt, fmtMoney, fmtMonth, fmtPct, todayTr, type Currency } from "@/lib/format";
import { first, hrefWith, parseListParams, type SearchParams } from "@/lib/list-params";
import { isUuid } from "@/lib/parse";
import { load, must } from "@/lib/query";
import type { QuoteView, SaleView } from "@/lib/types";
import { createQuote, updateCustomer } from "../actions";
import { CustomerActiveBadge, LoadFailed, openAmountText } from "../_components/bits";
import { CustomerSalesChart } from "../_components/CustomerSalesChart";
import { daysBetween, redirectIfPageOutOfRange } from "../_components/paging";
import type { CustomerListRow, CustomerSummary, QuoteEstimateSummary } from "../_components/types";
import { CustomerFields } from "../CustomerFields";

export const metadata: Metadata = { title: "Müşteri" };

type Tab = "teklifler" | "satislar";
// "Tutar" (total_amount) USD ve TL kayıtları karıştırdığı için sıralanmaz; satışlarda TL ciro sıralanır.
const QUOTE_SORT = ["quote_date", "valid_until"];
const SALE_SORT = ["sold_on", "revenue_try", "gross_profit_try"];
const QUOTE_STATUS: Record<string, QuoteView["status"]> = { acik: "open", donustu: "converted", iptal: "cancelled" };
const SALE_STATUS: Record<string, SaleView["status"]> = { gerceklesti: "completed", iptal: "cancelled" };

type ConvertedSale = Pick<SaleView, "id" | "sale_no" | "sold_on" | "status" | "revenue_try" | "gross_profit_try" | "margin_pct">;

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const [{ id }, sp, ctx] = await Promise.all([params, searchParams, requireMember()]);
  if (!isUuid(id)) notFound();
  const customer = await must(ctx.supabase.from("v_customer_list").select("*").eq("id", id).maybeSingle<CustomerListRow>(), "Müşteri");
  if (!customer) notFound();

  const isAdmin = ctx.role === "admin";
  const today = todayTr();
  const base = `/musteriler/${id}`;
  // Teklifi olmayan ama satışı olan müşteride sayfa doğrudan Satışlar sekmesiyle açılır.
  const defaultTab: Tab = customer.quote_count === 0 && customer.sale_count + customer.cancelled_sale_count > 0 ? "satislar" : "teklifler";
  const sekme = first(sp.sekme);
  const tab: Tab = sekme === "satislar" || sekme === "teklifler" ? sekme : defaultTab;
  const lp = parseListParams(sp, tab === "teklifler" ? { sortable: QUOTE_SORT, defaultSort: "quote_date" } : { sortable: SALE_SORT, defaultSort: "sold_on" });
  const v = lp.values;
  const sortProps = { sort: lp.sort, dir: lp.dir, basePath: base, values: v };

  // Sekme verisi (sunucu tarafı sayfalama)
  let quoteQuery = ctx.supabase.from("v_quotes").select("*", { count: "exact" }).eq("customer_id", id);
  const quoteStatus = QUOTE_STATUS[v.durum ?? ""];
  if (quoteStatus) quoteQuery = quoteQuery.eq("status", quoteStatus);
  let saleQuery = ctx.supabase.from("v_sales").select("*", { count: "exact" }).eq("customer_id", id);
  const saleStatus = SALE_STATUS[v.durum ?? ""];
  if (saleStatus) saleQuery = saleQuery.eq("status", saleStatus);

  const [summary, lastQuote, quotesRes, salesRes] = await Promise.all([
    load(ctx.supabase.rpc("customer_summary", { p_customer_id: id, p_months: 12 })),
    load(ctx.supabase.from("quotes").select("currency").eq("customer_id", id).order("created_at", { ascending: false }).limit(1).returns<{ currency: Currency }[]>()),
    tab === "teklifler"
      ? load(
          quoteQuery
            .order(lp.sort ?? "quote_date", { ascending: lp.dir === "asc", nullsFirst: false })
            .order("created_at", { ascending: false })
            .range(lp.from, lp.to)
            .returns<QuoteView[]>(),
        )
      : null,
    tab === "satislar"
      ? load(
          saleQuery
            .order(lp.sort ?? "sold_on", { ascending: lp.dir === "asc", nullsFirst: false })
            .order("created_at", { ascending: false })
            .range(lp.from, lp.to)
            .returns<SaleView[]>(),
        )
      : null,
  ]);
  redirectIfPageOutOfRange((quotesRes ?? salesRes)?.error ?? null, lp, base, v);

  // Teklifler sekmesi: açık teklifler için tahmini kâr (FIFO önizleme), dönüşenler için gerçekleşen satış.
  const quotes = quotesRes?.data ?? [];
  const openIds = quotes.filter((q) => q.status === "open" && q.item_count > 0).map((q) => q.id);
  const saleIds = quotes.map((q) => q.sale_id).filter((x): x is string => !!x);
  // Satışlar sekmesi: kaynak teklif numaraları.
  const sales = salesRes?.data ?? [];
  const quoteIds = sales.map((s) => s.quote_id).filter((x): x is string => !!x);

  const [estimates, convertedSales, sourceQuotes] = await Promise.all([
    // Sayfadaki açık tekliflerin tahmini kârı tek çağrıda (teklif başına ayrı RPC yok).
    openIds.length ? load(ctx.supabase.rpc("quote_estimates", { p_quote_ids: openIds })) : null,
    saleIds.length
      ? load(
          ctx.supabase
            .from("v_sales")
            .select("id, sale_no, sold_on, status, revenue_try, gross_profit_try, margin_pct")
            .in("id", saleIds)
            .returns<ConvertedSale[]>(),
        )
      : null,
    quoteIds.length ? load(ctx.supabase.from("quotes").select("id, quote_no").in("id", quoteIds).returns<{ id: string; quote_no: string }[]>()) : null,
  ]);
  const estimateById = new Map(((estimates?.data ?? []) as QuoteEstimateSummary[]).map((e) => [e.quote_id, e]));
  const estimateError = estimates?.error ?? null;
  const saleError = convertedSales?.error ?? null;
  const sourceError = sourceQuotes?.error ?? null;
  const saleById = new Map((convertedSales?.data ?? []).map((s) => [s.id, s]));
  const quoteNoById = new Map((sourceQuotes?.data ?? []).map((q) => [q.id, q.quote_no]));

  const sum = summary.data as CustomerSummary | null;
  const series = sum?.series ?? [];
  const periodRevenue = sum?.period.revenue_try ?? 0;
  const periodProfit = sum?.period.gross_profit_try ?? 0;
  const periodSales = sum?.period.sale_count ?? 0;
  const periodLabel = series.length ? (series.length === 1 ? fmtMonth(series[0].month) : `${fmtMonth(series[0].month)} – ${fmtMonth(series[series.length - 1].month)}`) : "";
  const openAmounts = openAmountText(customer.open_amount_usd, customer.open_amount_try);
  const sinceLast = customer.last_sold_on ? daysBetween(customer.last_sold_on, today) : null;
  // Yeni teklifin para birimi: son teklifinki (yoksa USD); düğmenin yanında görünür ve değiştirilebilir.
  const newQuoteCurrency: Currency = lastQuote.data?.[0]?.currency ?? "USD";

  const tabHref = (t: Tab) => hrefWith(base, {}, { sekme: t === defaultTab ? null : t });
  const statusHref = (durum: string | null) => hrefWith(base, v, { durum, sayfa: null });

  return (
    <>
      <PageHeader
        back={{ href: "/musteriler", label: "Kurumsal müşteriler" }}
        title={customer.name}
        meta={<CustomerActiveBadge active={customer.is_active} />}
        description={
          [customer.contact_name ? `Yetkili: ${customer.contact_name}` : null, customer.tax_number ? `VKN ${customer.tax_number}` : null].filter(Boolean).join(" · ") ||
          "Kurumsal müşteri"
        }
        actions={
          isAdmin ? (
            <ActionForm action={createQuote}>
              <input type="hidden" name="customer_id" value={customer.id} />
              <input type="hidden" name="quote_date" value={today} />
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs font-medium text-ink-muted">
                  Para birimi
                  <select
                    name="currency"
                    defaultValue={newQuoteCurrency}
                    className="input h-9 w-auto py-1 pr-8 text-[13px]"
                    title={
                      lastQuote.error
                        ? `Son teklifin para birimi yüklenemedi (${lastQuote.error}); USD önerildi.`
                        : "Teklif bu para biriminde açılır; kalem fiyatları bu para biriminde girilir."
                    }
                  >
                    <option value="USD">USD</option>
                    <option value="TRY">TL</option>
                  </select>
                </label>
                <SubmitButton>
                  <FilePlus2 aria-hidden />
                  Teklif oluştur
                </SubmitButton>
              </div>
            </ActionForm>
          ) : null
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Toplam satış"
          value={fmtMoney(customer.revenue_try, "TRY")}
          icon={TrendingUp}
          tone="blue"
          description={`Tüm zamanlar · ${fmtInt(customer.sale_count)} satış · ${fmtInt(customer.sold_qty)} adet${customer.cancelled_sale_count ? ` · ${fmtInt(customer.cancelled_sale_count)} iptal hariç` : ""}`}
        />
        <StatCard
          label="Brüt kâr"
          value={fmtMoney(customer.gross_profit_try, "TRY")}
          icon={Coins}
          tone="teal"
          description={customer.sale_count ? `Tüm zamanlar · marj ${fmtPct(customer.margin_pct)} ` : "Henüz gerçekleşmiş satış yok"}
        />
        <StatCard
          label="Teklifler"
          value={fmtInt(customer.quote_count)}
          unit="teklif"
          icon={FileText}
          tone="violet"
          description={`${fmtInt(customer.open_quote_count)} açık · ${fmtInt(customer.converted_quote_count)} satışa dönüştü · ${fmtInt(customer.cancelled_quote_count)} iptal${openAmounts ? ` · açık ${openAmounts}` : ""}`}
          href={customer.open_quote_count > 0 ? `${base}?sekme=teklifler&durum=acik` : undefined}
        />
        <StatCard
          label="Son satış"
          value={customer.last_sold_on ? fmtDate(customer.last_sold_on) : "—"}
          icon={CalendarClock}
          tone="amber"
          description={
            customer.last_sold_on
              ? `${sinceLast === 0 ? "Bugün" : `${fmtInt(sinceLast)} gün önce`} · ilk satış ${fmtDate(customer.first_sold_on)}`
              : "Bu müşteriye henüz satış yapılmadı"
          }
        />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[300px_minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card
          title="İletişim bilgileri"
          icon={UserRound}
          actions={
            isAdmin ? (
              <Drawer
                trigger={
                  <>
                    <Pencil aria-hidden />
                    Düzenle
                  </>
                }
                triggerVariant="secondary"
                triggerSize="sm"
                title="Müşteri bilgilerini düzenle"
                description={customer.name}
                size="md"
              >
                <ActionForm action={updateCustomer}>
                  <input type="hidden" name="id" value={customer.id} />
                  <CustomerFields customer={customer} />
                  <div className="mt-5 flex justify-end border-t border-line pt-4">
                    <SubmitButton>Kaydet</SubmitButton>
                  </div>
                </ActionForm>
              </Drawer>
            ) : null
          }
        >
          <ul className="space-y-3 text-[13px]">
            <InfoRow icon={UserRound} label="Yetkili kişi" value={customer.contact_name} />
            <InfoRow
              icon={Phone}
              label="Telefon"
              value={
                customer.phone ? (
                  <a className="link font-normal tabular-nums" href={`tel:${customer.phone.replace(/\s+/g, "")}`}>
                    {customer.phone}
                  </a>
                ) : null
              }
            />
            <InfoRow
              icon={Mail}
              label="E-posta"
              value={
                customer.email ? (
                  <a className="link font-normal break-all" href={`mailto:${customer.email}`}>
                    {customer.email}
                  </a>
                ) : null
              }
            />
            <InfoRow icon={Hash} label="Vergi no" value={customer.tax_number ? <span className="code">{customer.tax_number}</span> : null} />
            <InfoRow icon={MapPin} label="Adres" value={customer.address ? <span className="whitespace-pre-line">{customer.address}</span> : null} />
            <InfoRow icon={StickyNote} label="Not" value={customer.note ? <span className="whitespace-pre-line">{customer.note}</span> : null} />
            <InfoRow icon={CalendarPlus} label="Kayıt" value={fmtDateTime(customer.created_at)} />
          </ul>
        </Card>

        <Card
          title="Aylık ciro ve brüt kâr"
          icon={TrendingUp}
          description={`Gerçekleşmiş satışlar, TL${periodLabel ? ` · ${periodLabel}` : ""}`}
          padded={false}
          className="md:col-span-2 md:col-start-1 md:row-start-1 xl:col-span-1 xl:col-start-2"
        >
          {summary.error ? (
            <ErrorState message={summary.error} compact />
          ) : (
            <>
              <div className="px-4 pt-4 pb-2">
                <CustomerSalesChart series={series} />
              </div>
              <div className="border-t border-line">
                <MetricRow
                  items={[
                    { label: "Ciro", value: fmtMoney(periodRevenue, "TRY") },
                    { label: "Brüt kâr", value: fmtMoney(periodProfit, "TRY") },
                    { label: "Marj", value: periodRevenue > 0 ? fmtPct((periodProfit / periodRevenue) * 100) : "—", hint: `${fmtInt(periodSales)} satış` },
                  ]}
                />
              </div>
            </>
          )}
        </Card>

        <Card
          title="En çok alınan ürünler"
          icon={Package}
          description={sum ? `Tüm zamanlar · ciroya göre · ${fmtInt(sum.variant_count)} farklı varyant` : "Tüm zamanlar · ciroya göre"}
        >
          {summary.error ? (
            <ErrorState message={summary.error} compact />
          ) : !sum || sum.by_variant.length === 0 ? (
            <EmptyState compact icon={Package} title="Henüz satış yok">
              Satış yapıldığında en çok alınan ürün-varyantlar burada listelenir.
            </EmptyState>
          ) : (
            <ul className="space-y-3.5">
              {sum.by_variant.slice(0, 6).map((r) => (
                <li key={r.variant_id} className="min-w-0">
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                    <Link href={`/urunler/${r.product_id}`} className="link min-w-0 break-words">
                      {r.display_name}
                    </Link>
                    <span className="shrink-0 font-semibold text-ink tabular-nums">{fmtMoney(r.revenue_try, "TRY")}</span>
                  </div>
                  <ProgressBar
                    value={r.revenue_try}
                    max={customer.revenue_try}
                    tone="blue"
                    label={`${r.display_name}: müşteri cirosundaki payı`}
                  />
                  <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-ink-muted tabular-nums">
                    <span>
                      {fmtInt(r.quantity)} adet · {fmtInt(r.sale_count)} satış
                    </span>
                    <span>
                      Pay {customer.revenue_try > 0 ? fmtPct((r.revenue_try / customer.revenue_try) * 100) : "—"} · Brüt kâr {fmtMoney(r.gross_profit_try, "TRY")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card padded={false}>
        <div className="px-2 pt-1">
          <LinkTabs
            active={tab}
            tabs={[
              { key: "teklifler", label: "Teklifler", href: tabHref("teklifler"), count: customer.quote_count },
              { key: "satislar", label: "Satışlar", href: tabHref("satislar"), count: customer.sale_count + customer.cancelled_sale_count },
            ]}
          />
        </div>

        {tab === "teklifler" ? (
          <>
            <TabBar
              total={quotesRes?.count ?? null}
              noun="teklif"
              segmented={
                <LinkSegmented
                  active={v.durum && QUOTE_STATUS[v.durum] ? v.durum : "tumu"}
                  items={[
                    { key: "tumu", label: "Tümü", href: statusHref(null) },
                    { key: "acik", label: "Açık", href: statusHref("acik") },
                    { key: "donustu", label: "Satışa dönüşen", href: statusHref("donustu") },
                    { key: "iptal", label: "İptal", href: statusHref("iptal") },
                  ]}
                />
              }
            />
            {!quotesRes?.error && (estimateError || saleError) ? (
              <div className="border-b border-line px-4 py-3">
                <Alert tone="error" title="Bazı teklif bilgileri yüklenemedi">
                  {[estimateError ? `Tahmini kâr: ${estimateError}` : null, saleError ? `Dönüşen satışlar: ${saleError}` : null].filter(Boolean).join(" · ")}
                </Alert>
              </div>
            ) : null}
            {quotesRes?.error ? (
              <ErrorState message={quotesRes.error} />
            ) : quotes.length === 0 ? (
              <EmptyState icon={FileText} title={quoteStatus ? "Bu durumda teklif yok" : "Henüz teklif yok"}>
                {quoteStatus
                  ? "Başka bir durum seçin."
                  : isAdmin
                    ? "Sağ üstteki “Teklif oluştur” ile toplu satış teklifi hazırlayın; teklif stok düşürmez."
                    : "Yönetici teklif hazırladığında burada listelenir."}
              </EmptyState>
            ) : (
              <>
                {/* Geniş ekran: tablo */}
                <TableWrap className="hidden xl:block">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Teklif</th>
                        <SortTh label="Tarih" column="quote_date" {...sortProps} />
                        <SortTh label="Geçerlilik" column="valid_until" {...sortProps} />
                        <th className="num">Kalem</th>
                        <th className="num">Adet</th>
                        <th className="num" title="Teklifin kendi para biriminde tutarı">
                          Tutar
                        </th>
                        <th className="num" title="Açık teklifte raf önizlemesiyle tahmini; dönüşen teklifte gerçekleşen satışın brüt kârı">
                          Brüt kâr (₺)
                        </th>
                        <th>Durum</th>
                        <th>Satış</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quotes.map((q) => {
                        const sale = q.sale_id ? saleById.get(q.sale_id) : undefined;
                        return (
                          <tr key={q.id}>
                            <td>
                              <Link className="link font-mono text-xs whitespace-nowrap" href={`/musteriler/teklif/${q.id}`}>
                                {q.quote_no}
                              </Link>
                              {q.note ? (
                                <div className="mt-0.5 line-clamp-1 max-w-56 text-xs text-ink-muted" title={q.note}>
                                  {q.note}
                                </div>
                              ) : null}
                            </td>
                            <td className="whitespace-nowrap tabular-nums">{fmtDate(q.quote_date)}</td>
                            <td className="whitespace-nowrap">
                              <Validity quote={q} today={today} />
                            </td>
                            <td className="num">{fmtInt(q.item_count)}</td>
                            <td className="num">{fmtInt(q.total_quantity)}</td>
                            <td className="num font-medium text-ink">{fmtMoney(q.total_amount, q.currency)}</td>
                            <td className="num">
                              <QuoteProfit quote={q} estimate={estimateById.get(q.id)} estimateError={estimateError} sale={sale} saleError={saleError} />
                            </td>
                            <td>
                              <QuoteStatusBadge status={q.status} />
                            </td>
                            <td className="whitespace-nowrap">
                              <ConversionCell quote={q} sale={sale} saleError={saleError} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableWrap>
                {/* Tablet ve mobil: kart listesi (dönüşme durumu ve kâr ekranda kalır) */}
                <ul className="-mb-px grid grid-cols-1 md:grid-cols-2 xl:hidden">
                  {quotes.map((q) => {
                    const sale = q.sale_id ? saleById.get(q.sale_id) : undefined;
                    return (
                      <li key={q.id} className="min-w-0 border-b border-line px-4 py-3.5 md:odd:border-r">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link className="link font-mono text-xs whitespace-nowrap" href={`/musteriler/teklif/${q.id}`}>
                              {q.quote_no}
                            </Link>
                            <div className="mt-0.5 text-xs text-ink-muted tabular-nums">
                              {fmtDate(q.quote_date)} · {fmtInt(q.item_count)} kalem · {fmtInt(q.total_quantity)} adet
                            </div>
                          </div>
                          <QuoteStatusBadge status={q.status} />
                        </div>
                        {q.note ? (
                          <p className="mt-1.5 line-clamp-2 text-xs text-ink-soft" title={q.note}>
                            {q.note}
                          </p>
                        ) : null}
                        <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2.5 text-[13px]">
                          <div className="min-w-0">
                            <dt className="text-xs text-ink-muted">Tutar</dt>
                            <dd className="font-semibold text-ink tabular-nums">{fmtMoney(q.total_amount, q.currency)}</dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-xs text-ink-muted">Brüt kâr (₺)</dt>
                            <dd>
                              <QuoteProfit quote={q} estimate={estimateById.get(q.id)} estimateError={estimateError} sale={sale} saleError={saleError} align="left" />
                            </dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-xs text-ink-muted">Geçerlilik</dt>
                            <dd>
                              <Validity quote={q} today={today} />
                            </dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-xs text-ink-muted">Satış</dt>
                            <dd>
                              <ConversionCell quote={q} sale={sale} saleError={saleError} />
                            </dd>
                          </div>
                        </dl>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {quotesRes?.count ? <Pagination basePath={base} values={v} page={lp.page} pageSize={lp.pageSize} total={quotesRes.count} noun="teklif" /> : null}
          </>
        ) : (
          <>
            <TabBar
              total={salesRes?.count ?? null}
              noun="satış"
              segmented={
                <LinkSegmented
                  active={v.durum && SALE_STATUS[v.durum] ? v.durum : "tumu"}
                  items={[
                    { key: "tumu", label: "Tümü", href: statusHref(null) },
                    { key: "gerceklesti", label: "Gerçekleşen", href: statusHref("gerceklesti") },
                    { key: "iptal", label: "İptal", href: statusHref("iptal") },
                  ]}
                />
              }
              note="Ciro ve kâr toplamlarına yalnız gerçekleşen satışlar girer."
            />
            {salesRes?.error ? (
              <ErrorState message={salesRes.error} />
            ) : sales.length === 0 ? (
              <EmptyState icon={Receipt} title={saleStatus ? "Bu durumda satış yok" : "Henüz satış yok"}>
                {saleStatus ? "Başka bir durum seçin." : "Bu müşteriye yapılan Mekonsis satışları ve satışa dönüşen teklifler burada listelenir."}
              </EmptyState>
            ) : (
              <>
                {/* Geniş ekran: tablo */}
                <TableWrap className="hidden xl:block">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Satış</th>
                        <SortTh label="Tarih" column="sold_on" {...sortProps} />
                        <th>Kalemler</th>
                        <th className="num">Adet</th>
                        <th className="num" title="Satışın kendi para biriminde tutarı">
                          Tutar
                        </th>
                        <SortTh label="Ciro (₺)" column="revenue_try" align="right" title="Satış günündeki kurla TL" {...sortProps} />
                        <SortTh label="Brüt kâr (₺)" column="gross_profit_try" align="right" title="Gerçekleşmiş brüt kâr" {...sortProps} />
                        <th className="num">Marj</th>
                        <th>Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.map((s) => {
                        const cancelled = s.status === "cancelled";
                        return (
                          <tr key={s.id} className={cancelled ? "text-ink-muted" : undefined}>
                            <td className="whitespace-nowrap">
                              <Link className="link font-mono text-xs whitespace-nowrap" href={`/satislar/${s.id}`}>
                                {s.sale_no}
                              </Link>
                              {s.quote_id ? (
                                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                                  <SourceQuote quoteId={s.quote_id} quoteNo={quoteNoById.get(s.quote_id)} error={sourceError} />
                                </div>
                              ) : null}
                            </td>
                            <td className="whitespace-nowrap tabular-nums">{fmtDate(s.sold_on)}</td>
                            <td className="max-w-80 min-w-48 text-xs">
                              <span className="line-clamp-2" title={s.items_summary ?? undefined}>
                                {s.items_summary ?? "—"}
                              </span>
                            </td>
                            <td className="num">{fmtInt(s.total_quantity)}</td>
                            <td className="num">{fmtMoney(s.total_amount, s.currency)}</td>
                            <td className={cx("num", cancelled ? "line-through" : "font-medium text-ink")}>{fmtMoney(s.revenue_try, "TRY")}</td>
                            <td className={cx("num", cancelled && "line-through")}>{fmtMoney(s.gross_profit_try, "TRY")}</td>
                            <td className="num">{cancelled ? "—" : fmtPct(s.margin_pct)}</td>
                            <td>
                              <SaleStatusBadge status={s.status} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableWrap>
                {/* Tablet ve mobil: kart listesi */}
                <ul className="-mb-px grid grid-cols-1 md:grid-cols-2 xl:hidden">
                  {sales.map((s) => {
                    const cancelled = s.status === "cancelled";
                    return (
                      <li key={s.id} className={cx("min-w-0 border-b border-line px-4 py-3.5 md:odd:border-r", cancelled && "text-ink-muted")}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link className="link font-mono text-xs whitespace-nowrap" href={`/satislar/${s.id}`}>
                              {s.sale_no}
                            </Link>
                            <div className="mt-0.5 text-xs text-ink-muted tabular-nums">
                              {fmtDate(s.sold_on)} · {fmtInt(s.total_quantity)} adet
                            </div>
                            {s.quote_id ? (
                              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                                <SourceQuote quoteId={s.quote_id} quoteNo={quoteNoById.get(s.quote_id)} error={sourceError} />
                              </div>
                            ) : null}
                          </div>
                          <SaleStatusBadge status={s.status} />
                        </div>
                        {s.items_summary ? (
                          <p className="mt-1.5 line-clamp-2 text-xs text-ink-soft" title={s.items_summary}>
                            {s.items_summary}
                          </p>
                        ) : null}
                        <dl className="mt-2.5 grid grid-cols-3 gap-x-3 gap-y-2 text-[13px]">
                          <div className="min-w-0">
                            <dt className="text-xs text-ink-muted">Tutar</dt>
                            <dd className="break-words tabular-nums">{fmtMoney(s.total_amount, s.currency)}</dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-xs text-ink-muted">Ciro (₺)</dt>
                            <dd className={cx("font-semibold break-words tabular-nums", cancelled ? "line-through" : "text-ink")}>{fmtMoney(s.revenue_try, "TRY")}</dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-xs text-ink-muted">Brüt kâr (₺)</dt>
                            <dd className={cx("break-words tabular-nums", cancelled && "line-through")}>{fmtMoney(s.gross_profit_try, "TRY")}</dd>
                            {!cancelled ? <dd className="text-[11px] text-ink-muted tabular-nums">marj {fmtPct(s.margin_pct)}</dd> : null}
                          </div>
                        </dl>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {salesRes?.count ? <Pagination basePath={base} values={v} page={lp.page} pageSize={lp.pageSize} total={salesRes.count} noun="satış" /> : null}
          </>
        )}
      </Card>
    </>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: ReactNode }) {
  return (
    <li className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-canvas text-ink-muted" aria-hidden>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <div className="text-xs text-ink-muted">{label}</div>
        <div className="font-medium break-words text-ink">{value ?? <span className="font-normal text-ink-muted">—</span>}</div>
      </div>
    </li>
  );
}

function TabBar({ total, noun, segmented, note }: { total: number | null; noun: string; segmented: ReactNode; note?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {segmented}
        {note ? <span className="text-xs text-ink-muted">{note}</span> : null}
      </div>
      <span className="text-xs whitespace-nowrap text-ink-muted" aria-live="polite">
        {total === null ? "Sonuç sayısı alınamadı" : `${total.toLocaleString("tr-TR")} ${noun}`}
      </span>
    </div>
  );
}

function Validity({ quote, today }: { quote: QuoteView; today: string }) {
  if (!quote.valid_until) return <span className="text-xs text-ink-muted">Süre yok</span>;
  const left = daysBetween(today, quote.valid_until);
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="tabular-nums">{fmtDate(quote.valid_until)}</span>
      {quote.status === "open" ? (
        left < 0 ? (
          <Badge tone="amber" icon={CalendarClock}>
            Süresi doldu
          </Badge>
        ) : (
          <span className="text-xs text-ink-muted">{left === 0 ? "Bugün son gün" : `${fmtInt(left)} gün kaldı`}</span>
        )
      ) : null}
    </span>
  );
}

function QuoteProfit({
  quote,
  estimate,
  estimateError,
  sale,
  saleError,
  align = "right",
}: {
  quote: QuoteView;
  estimate?: QuoteEstimateSummary;
  estimateError: string | null;
  sale?: ConvertedSale;
  saleError: string | null;
  align?: "left" | "right";
}) {
  const sub = cx("text-xs text-ink-muted", align === "right" ? "text-right" : undefined);
  if (quote.status === "converted") {
    if (!sale) return saleError ? <LoadFailed message={saleError} /> : <span className="text-xs text-ink-muted">—</span>;
    return (
      <>
        <span className="font-medium text-ink tabular-nums">{fmtMoney(sale.gross_profit_try, "TRY")}</span>
        <div className={sub}>gerçekleşen · {fmtPct(sale.margin_pct)}</div>
      </>
    );
  }
  if (quote.status === "open") {
    if (quote.item_count === 0) return <span className="text-xs text-ink-muted">Kalem yok</span>;
    if (estimateError) return <LoadFailed message={estimateError} label="tahmin yüklenemedi" />;
    if (!estimate) return <LoadFailed message="Teklifin tahmini bulunamadı." label="tahmin yok" />;
    if (estimate.gross_profit_try === null)
      return (
        <span className="text-xs text-ink-muted" title="Güncel kur olmadığından TL ciro ve kâr hesaplanamadı">
          Kur yok
        </span>
      );
    return (
      <>
        <span className={cx("tabular-nums", estimate.gross_profit_try < 0 ? "font-medium text-chart-red" : "text-ink")}>{fmtMoney(estimate.gross_profit_try, "TRY")}</span>
        <div className={sub}>
          tahmini · {fmtPct(estimate.margin_pct)}
          {estimate.has_shortage ? " · stok yetersiz" : ""}
        </div>
      </>
    );
  }
  return <span className="text-xs text-ink-muted">—</span>;
}

function ConversionCell({ quote, sale, saleError }: { quote: QuoteView; sale?: ConvertedSale; saleError: string | null }) {
  if (quote.status === "converted" && quote.sale_id) {
    return (
      <span className="inline-flex flex-col items-start">
        <Link className="link font-mono text-xs whitespace-nowrap" href={`/satislar/${quote.sale_id}`}>
          {quote.sale_no}
        </Link>
        {sale ? (
          <span className="text-xs text-ink-muted tabular-nums">{fmtDate(sale.sold_on)}</span>
        ) : saleError ? (
          <LoadFailed message={saleError} label="tarih yüklenemedi" />
        ) : null}
      </span>
    );
  }
  if (quote.status === "open") return <span className="text-xs text-ink-muted">Henüz dönüşmedi</span>;
  return <span className="text-xs text-ink-muted">—</span>;
}

/** Satışın kaynak teklifi: numara sorgusu başarısızsa bağlantı yine çalışır, hata yanında belirtilir. */
function SourceQuote({ quoteId, quoteNo, error }: { quoteId: string; quoteNo?: string; error: string | null }) {
  return (
    <>
      <span>Teklif</span>
      <Link className="link font-normal" href={`/musteriler/teklif/${quoteId}`}>
        {quoteNo ?? "kaynak teklifi aç"}
      </Link>
      {!quoteNo && error ? <LoadFailed message={error} label="no yüklenemedi" /> : null}
    </>
  );
}
