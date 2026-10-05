import { BadgeCheck, Building2, FileText, Plus, Receipt, TrendingUp, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DeleteButton } from "@/components/DeleteButton";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, EmptyState, ErrorState, MetricRow, PageHeader, ProgressBar, StatCard, TableWrap, buttonClass } from "@/components/ui";
import { Drawer } from "@/components/ui/dialog";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { Pagination, SortTh } from "@/components/ui/list";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtInt, fmtMoney, fmtMonth, fmtPct } from "@/lib/format";
import { parseListParams, searchPattern, type SearchParams } from "@/lib/list-params";
import { load } from "@/lib/query";
import { ContactLinks, CustomerActiveBadge, openAmountText } from "./_components/bits";
import { CorporateRevenueChart } from "./_components/CustomerCharts";
import { DropParam } from "./_components/DropParam";
import { redirectIfPageOutOfRange } from "./_components/paging";
import type { CustomerListRow, CustomersOverview } from "./_components/types";
import { createCustomer, deleteCustomer } from "./actions";
import { CustomerFields } from "./CustomerFields";

export const metadata: Metadata = { title: "Kurumsal Müşteriler" };

const BASE = "/musteriler";
const SORTABLE = ["name", "open_quote_count", "converted_quote_count", "sale_count", "revenue_try", "last_sold_on"];

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireMember();
  const isAdmin = ctx.role === "admin";
  const lp = parseListParams(await searchParams, { sortable: SORTABLE, defaultSort: "name", defaultDir: "asc" });
  // ?islem=yeni yalnız "Müşteri ekle" panelini açar; liste filtresi değildir.
  const { islem, ...v } = lp.values;

  let query = ctx.supabase.from("v_customer_list").select("*", { count: "exact" });
  const pattern = searchPattern(lp.q);
  if (pattern) {
    query = query.or(
      `name.ilike.${pattern},contact_name.ilike.${pattern},email.ilike.${pattern},tax_number.ilike.${pattern},phone.ilike.${pattern}`,
    );
  }
  if (v.durum === "aktif") query = query.eq("is_active", true);
  else if (v.durum === "pasif") query = query.eq("is_active", false);
  if (v.teklif === "acik") query = query.gt("open_quote_count", 0);
  else if (v.teklif === "donusen") query = query.gt("converted_quote_count", 0);
  else if (v.teklif === "yok") query = query.eq("quote_count", 0);
  if (v.satis === "var") query = query.gt("sale_count", 0);
  else if (v.satis === "yok") query = query.eq("sale_count", 0);

  const [res, overview] = await Promise.all([
    load(
      query
        .order(lp.sort ?? "name", { ascending: lp.dir === "asc", nullsFirst: false })
        .order("name", { ascending: true })
        .range(lp.from, lp.to)
        .returns<CustomerListRow[]>(),
    ),
    // Özet kartları, sıralı müşteri listesi ve aylık seri SQL'de toplanır (max_rows sınırından bağımsız).
    load(ctx.supabase.rpc("customers_overview", { p_months: 12 })),
  ]);

  redirectIfPageOutOfRange(res.error, lp, BASE, v);

  const ov = overview.data as CustomersOverview | null;
  const cs = ov?.customers;
  const quoteCount = cs?.quote_count ?? 0;
  const openQuotes = cs?.open_quote_count ?? 0;
  const converted = cs?.converted_quote_count ?? 0;
  const cancelled = cs?.cancelled_quote_count ?? 0;
  const decided = converted + cancelled;
  const openAmounts = openAmountText(cs?.open_amount_usd ?? null, cs?.open_amount_try ?? null);
  const customerRevenue = cs?.revenue_try ?? 0;
  const top = ov?.top ?? [];
  const series = ov?.series ?? [];
  const periodLabel = series.length ? (series.length === 1 ? fmtMonth(series[0].month) : `${fmtMonth(series[0].month)} – ${fmtMonth(series[series.length - 1].month)}`) : "";
  const periodCustomer = ov?.period.customer_revenue_try ?? 0;
  const periodOther = ov?.period.other_revenue_try ?? 0;

  const rows = res.data ?? [];
  const sortProps = { sort: lp.sort, dir: lp.dir, basePath: BASE, values: v };
  const filtered = Object.keys(v).some((k) => !["sayfa", "adet", "sirala", "yon"].includes(k));

  return (
    <>
      <PageHeader
        title="Kurumsal müşteriler"
        description="Firma ve iletişim bilgileri, toplu satış teklifleri ve müşteriye yapılan satışlar. Teklif stok düşürmez; “Satışa Dönüştür” normal satış akışını bir kez çalıştırır."
        actions={
          isAdmin ? (
            <Drawer
              trigger={
                <>
                  <Plus aria-hidden />
                  Müşteri ekle
                </>
              }
              title="Yeni kurumsal müşteri"
              description="Kaydettikten sonra müşteri sayfası açılır; oradan teklif oluşturabilirsiniz."
              size="md"
              defaultOpen={islem === "yeni"}
            >
              <ActionForm action={createCustomer} resetOnSuccess>
                <CustomerFields />
                <div className="mt-5 flex justify-end border-t border-line pt-4">
                  <SubmitButton>Müşteriyi ekle</SubmitButton>
                </div>
              </ActionForm>
            </Drawer>
          ) : null
        }
      />
      {/* ?islem=yeni paneli bir kez açar; adresten silinir ki kapatıp yenileyince tekrar açılmasın. */}
      {islem ? <DropParam name="islem" /> : null}

      {overview.error || !ov || !cs ? (
        <Card className="mb-4">
          <ErrorState message={overview.error ?? "Özet verisi alınamadı."} compact title="Özet yüklenemedi" />
        </Card>
      ) : (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard
            label="Kurumsal müşteri"
            value={fmtInt(cs.customer_count)}
            unit="firma"
            icon={Building2}
            tone="brand"
            description={`${fmtInt(cs.active_count)} aktif · ${fmtInt(cs.customer_count - cs.active_count)} pasif · ${fmtInt(cs.buyer_count)} firmaya satış yapıldı`}
          />
          <StatCard
            label="Açık teklif"
            value={fmtInt(openQuotes)}
            unit="teklif"
            icon={FileText}
            tone="blue"
            description={openAmounts ? `Güncel toplam ${openAmounts}` : "Satışa dönüşmeyi bekleyen teklif yok"}
            href={openQuotes > 0 ? `${BASE}?teklif=acik` : undefined}
          />
          <StatCard
            label="Teklif dönüşüm oranı"
            value={decided > 0 ? fmtPct((converted / decided) * 100) : "—"}
            icon={BadgeCheck}
            tone="teal"
            description={
              decided > 0
                ? `Sonuçlanan ${fmtInt(decided)} tekliften ${fmtInt(converted)} tanesi satışa dönüştü (${fmtInt(cancelled)} iptal)`
                : "Henüz sonuçlanan (dönüşen veya iptal) teklif yok; oran hesaplanamaz"
            }
          />
          <StatCard
            label="Müşterili satış cirosu"
            value={fmtMoney(ov.totals.customer_revenue_try, "TRY")}
            icon={TrendingUp}
            tone="sky"
            description={`Tüm zamanlar · ${fmtInt(ov.totals.customer_sale_count)} gerçekleşen satış · toplam ciro içindeki pay ${
              ov.totals.revenue_try > 0 ? fmtPct((ov.totals.customer_revenue_try / ov.totals.revenue_try) * 100) : "—"
            }`}
          />
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Card
          title="Aylık ciro: kurumsal ve diğer satışlar"
          icon={TrendingUp}
          description={`Gerçekleşmiş satışlar, TL${periodLabel ? ` · ${periodLabel}` : ""}. Teslimatlar satış sayılmaz.`}
          padded={false}
        >
          {overview.error ? (
            <ErrorState message={overview.error} compact />
          ) : (
            <>
              <div className="px-4 pt-4 pb-2">
                <CorporateRevenueChart series={series} />
              </div>
              <div className="border-t border-line">
                <MetricRow
                  items={[
                    { label: "Kurumsal ciro", value: fmtMoney(periodCustomer, "TRY"), hint: `${fmtInt(ov?.period.customer_sale_count ?? 0)} satış` },
                    { label: "Müşterisiz ciro", value: fmtMoney(periodOther, "TRY"), hint: `${fmtInt(ov?.period.other_sale_count ?? 0)} satış` },
                    {
                      label: "Kurumsal pay",
                      value: periodCustomer + periodOther > 0 ? fmtPct((periodCustomer / (periodCustomer + periodOther)) * 100) : "—",
                      hint: periodLabel || undefined,
                    },
                  ]}
                />
              </div>
            </>
          )}
        </Card>

        <Card
          title="Müşteri bazında ciro"
          icon={Trophy}
          description="Tüm zamanlar · gerçekleşmiş satışlar, TL · pay: müşterili ciro içindeki oran"
          footer={
            overview.error || !cs ? undefined : (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span>Teklifler: {fmtInt(quoteCount)} toplam</span>
                <span className="tabular-nums">
                  {fmtInt(openQuotes)} açık · {fmtInt(converted)} dönüştü · {fmtInt(cancelled)} iptal
                </span>
              </div>
            )
          }
        >
          {overview.error ? (
            <ErrorState message={overview.error} compact />
          ) : top.length === 0 ? (
            <EmptyState compact icon={Trophy} title="Henüz müşterili satış yok">
              Müşteri seçilerek yapılan satışlar ve satışa dönüşen teklifler burada sıralanır.
            </EmptyState>
          ) : (
            <ol className="space-y-3.5">
              {top.map((c, i) => (
                <li key={c.id} className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-canvas text-[11px] font-semibold text-ink-soft tabular-nums">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                      <Link href={`/musteriler/${c.id}`} className="link min-w-0 break-words">
                        {c.name}
                      </Link>
                      <span className="shrink-0 font-semibold text-ink tabular-nums">{fmtMoney(c.revenue_try, "TRY")}</span>
                    </div>
                    <ProgressBar value={c.revenue_try} max={customerRevenue} tone="blue" label={`${c.name}: müşterili ciro içindeki payı`} />
                    <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-ink-muted tabular-nums">
                      <span>
                        {fmtInt(c.sale_count)} satış · pay {customerRevenue > 0 ? fmtPct((c.revenue_try / customerRevenue) * 100) : "—"}
                      </span>
                      <span>
                        Brüt kâr {fmtMoney(c.gross_profit_try, "TRY")} · {fmtPct(c.margin_pct)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card padded={false}>
        <ListToolbar
          basePath={BASE}
          values={v}
          total={res.count}
          noun="müşteri"
          search={{ placeholder: "Firma, yetkili, e-posta, VKN…" }}
          filters={[
            {
              key: "durum",
              label: "Durum",
              options: [
                { value: "aktif", label: "Aktif" },
                { value: "pasif", label: "Pasif" },
              ],
            },
            {
              key: "teklif",
              label: "Teklif",
              options: [
                { value: "acik", label: "Açık teklifi olan" },
                { value: "donusen", label: "Dönüşen teklifi olan" },
                { value: "yok", label: "Teklifi olmayan" },
              ],
            },
            {
              key: "satis",
              label: "Satış",
              options: [
                { value: "var", label: "Satış yapılan" },
                { value: "yok", label: "Satış yapılmayan" },
              ],
            },
          ]}
        />
        {res.error ? (
          <ErrorState message={res.error} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Building2} title={filtered ? "Filtreye uyan müşteri yok" : "Henüz müşteri yok"}>
            {filtered ? "Arama veya filtreleri değiştirin." : isAdmin ? "“Müşteri ekle” düğmesiyle ilk kurumsal müşteriyi ekleyin." : "Yönetici müşteri eklediğinde burada listelenir."}
          </EmptyState>
        ) : (
          <>
            {/* Geniş ekran: tablo */}
            <TableWrap className="hidden xl:block">
              <table className="table-base">
                <thead>
                  <tr>
                    <SortTh label="Firma" column="name" {...sortProps} />
                    <th>Yetkili ve iletişim</th>
                    <SortTh label="Açık teklif" column="open_quote_count" align="right" title="Açık teklif sayısı ve tutarı" {...sortProps} />
                    <SortTh label="Dönüşen" column="converted_quote_count" align="right" title="Satışa dönüşen teklif / toplam teklif" {...sortProps} />
                    <SortTh label="Satış" column="sale_count" align="right" title="Gerçekleşmiş satış sayısı" {...sortProps} />
                    <SortTh label="Toplam satış (₺)" column="revenue_try" align="right" title="Gerçekleşmiş satışların cirosu; iptaller hariç" {...sortProps} />
                    <SortTh label="Son satış" column="last_sold_on" {...sortProps} />
                    <th aria-label="İşlemler" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const open = openAmountText(c.open_amount_usd, c.open_amount_try);
                    return (
                      <tr key={c.id}>
                        <td className="max-w-64 min-w-48">
                          <Link href={`/musteriler/${c.id}`} className="link break-words">
                            {c.name}
                          </Link>
                          {c.tax_number || !c.is_active ? (
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                              {c.tax_number ? (
                                <span>
                                  VKN <span className="code text-ink-muted">{c.tax_number}</span>
                                </span>
                              ) : null}
                              {!c.is_active ? <CustomerActiveBadge active={false} /> : null}
                            </div>
                          ) : null}
                        </td>
                        <td className="max-w-72 min-w-52 text-[12.5px]">
                          <div className="text-[13px] font-medium text-ink">{c.contact_name ?? <span className="font-normal text-ink-muted">Yetkili belirtilmemiş</span>}</div>
                          <ContactLinks phone={c.phone} email={c.email} className="mt-0.5 space-y-0.5" />
                        </td>
                        <td className="num">
                          {c.open_quote_count > 0 ? (
                            <Link href={`/musteriler/${c.id}?sekme=teklifler&durum=acik`} className="link" title="Açık teklifleri göster">
                              {fmtInt(c.open_quote_count)}
                            </Link>
                          ) : (
                            <span className="text-ink-muted">0</span>
                          )}
                          {open ? <div className="text-xs text-ink-muted">{open}</div> : null}
                        </td>
                        <td className="num">
                          <span className={c.converted_quote_count > 0 ? "font-medium text-ink" : "text-ink-muted"}>{fmtInt(c.converted_quote_count)}</span>
                          <span className="text-xs text-ink-muted"> / {fmtInt(c.quote_count)}</span>
                        </td>
                        <td className="num">
                          {fmtInt(c.sale_count)}
                          <div className="text-xs text-ink-muted">{fmtInt(c.sold_qty)} adet</div>
                        </td>
                        <td className="num">
                          <span className="font-semibold text-ink">{fmtMoney(c.revenue_try, "TRY")}</span>
                          {c.sale_count > 0 ? (
                            <div className="text-xs text-ink-muted">
                              Kâr {fmtMoney(c.gross_profit_try, "TRY")} · {fmtPct(c.margin_pct)}
                            </div>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap tabular-nums">{c.last_sold_on ? fmtDate(c.last_sold_on) : <span className="text-xs text-ink-muted">Satış yok</span>}</td>
                        <td className="text-right whitespace-nowrap">
                          <RowActions id={c.id} name={c.name} deletable={isAdmin && c.quote_count + c.cancelled_quote_count === 0 && c.sale_count + c.cancelled_sale_count === 0} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>

            {/* Tablet ve mobil: kart listesi */}
            <ul className="-mb-px grid grid-cols-1 md:grid-cols-2 xl:hidden">
              {rows.map((c) => {
                const open = openAmountText(c.open_amount_usd, c.open_amount_try);
                return (
                  <li key={c.id} className="min-w-0 border-b border-line px-4 py-3.5 md:odd:border-r">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/musteriler/${c.id}`} className="link break-words">
                          {c.name}
                        </Link>
                        <div className="mt-0.5 text-xs text-ink-muted">
                          {[c.contact_name, c.tax_number ? `VKN ${c.tax_number}` : null].filter(Boolean).join(" · ") || "Yetkili belirtilmemiş"}
                        </div>
                      </div>
                      <CustomerActiveBadge active={c.is_active} />
                    </div>
                    <ContactLinks phone={c.phone} email={c.email} className="mt-2 space-y-0.5 text-[12.5px]" />
                    <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2.5 text-[13px]">
                      <div className="min-w-0">
                        <dt className="text-xs text-ink-muted">Toplam satış</dt>
                        <dd className="font-semibold text-ink tabular-nums">{fmtMoney(c.revenue_try, "TRY")}</dd>
                        <dd className="text-[11px] text-ink-muted tabular-nums">{fmtInt(c.sale_count)} satış</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs text-ink-muted">Son satış</dt>
                        <dd className="tabular-nums">{c.last_sold_on ? fmtDate(c.last_sold_on) : "—"}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs text-ink-muted">Teklif</dt>
                        <dd className="tabular-nums">
                          {fmtInt(c.open_quote_count)} açık
                          <span className="block text-[11px] text-ink-muted">{fmtInt(c.converted_quote_count)} dönüştü</span>
                        </dd>
                        {open ? <dd className="text-[11px] break-words text-ink-muted tabular-nums">{open}</dd> : null}
                      </div>
                    </dl>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Link href={`/musteriler/${c.id}?sekme=teklifler`} className={buttonClass("secondary", "sm")} aria-label={`${c.name}: teklifler`}>
                        <FileText aria-hidden />
                        Teklifler
                        <span className="text-ink-muted tabular-nums">{fmtInt(c.quote_count)}</span>
                      </Link>
                      <Link href={`/musteriler/${c.id}?sekme=satislar`} className={buttonClass("secondary", "sm")} aria-label={`${c.name}: satışlar`}>
                        <Receipt aria-hidden />
                        Satışlar
                        <span className="text-ink-muted tabular-nums">{fmtInt(c.sale_count + c.cancelled_sale_count)}</span>
                      </Link>
                      {isAdmin && c.quote_count + c.cancelled_quote_count === 0 && c.sale_count + c.cancelled_sale_count === 0 ? (
                        <span className="ml-auto">
                          <DeleteCustomer id={c.id} name={c.name} />
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {res.count ? <Pagination basePath={BASE} values={v} page={lp.page} pageSize={lp.pageSize} total={res.count} noun="müşteri" /> : null}
      </Card>
    </>
  );
}

/** Satış veya teklifi olmayan müşteriyi silme düğmesi (yalnız yönetici). */
function DeleteCustomer({ id, name }: { id: string; name: string }) {
  return (
    <DeleteButton action={deleteCustomer} fields={{ id }} title={`${name} silinsin mi?`} label={`${name}: sil`} compact>
      Müşteri kaydı kalıcı olarak silinir. Bu işlem geri alınamaz.
    </DeleteButton>
  );
}

/** Satır işlemleri: müşteri sayfasındaki sekmelere kısayollar; geçmişi olmayan müşteride silme. */
function RowActions({ id, name, deletable }: { id: string; name: string; deletable: boolean }) {
  const icon = `${buttonClass("ghost", "sm")} size-8 px-0`;
  return (
    <div className="inline-flex items-center gap-0.5">
      <Link href={`/musteriler/${id}?sekme=teklifler`} className={icon} title="Teklifler" aria-label={`${name}: teklifler`}>
        <FileText aria-hidden />
      </Link>
      <Link href={`/musteriler/${id}?sekme=satislar`} className={icon} title="Satışlar" aria-label={`${name}: satışlar`}>
        <Receipt aria-hidden />
      </Link>
      {deletable ? <DeleteCustomer id={id} name={name} /> : null}
    </div>
  );
}
