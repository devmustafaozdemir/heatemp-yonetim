import { AlertCircle, Ban, Banknote, FileText, Layers, Plus, Receipt, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ActionForm, FormField, SubmitButton } from "@/components/forms";
import { fxSourceLabel } from "@/components/FxBadge";
import { BatchStatusBadge, SaleStatusBadge } from "@/components/status";
import { Alert, Badge, ButtonLink, Card, cx, DefinitionList, EmptyState, ErrorState, PageHeader, StatCard, TableWrap } from "@/components/ui";
import { Modal } from "@/components/ui/dialog";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtInt, fmtMoney, fmtRate, fmtUnitMoney } from "@/lib/format";
import { daysBetween } from "@/lib/period";
import { load, must } from "@/lib/query";
import type { SaleAllocationView, SaleItemView, SaleView } from "@/lib/types";
import { fmtRatio, marginPct } from "../_components/fmt";
import { cancelSale } from "../actions";

export const metadata: Metadata = { title: "Satış" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requireMember();
  const sale = await must(ctx.supabase.from("v_sales").select("*").eq("id", id).maybeSingle<SaleView>(), "Satış");
  if (!sale) notFound();

  const [items, lines, allocations, quote] = await Promise.all([
    load(ctx.supabase.from("v_sale_items").select("*").eq("sale_id", id).order("display_name").returns<SaleItemView[]>()),
    load(ctx.supabase.from("v_sale_lines").select("id, product_id").eq("sale_id", id).returns<{ id: string; product_id: string }[]>()),
    load(ctx.supabase.from("v_sale_allocations").select("*").eq("sale_id", id).order("id").returns<SaleAllocationView[]>()),
    sale.quote_id
      ? load(
          ctx.supabase
            .from("quotes")
            .select("id, quote_no, quote_date")
            .eq("id", sale.quote_id)
            .maybeSingle<{ id: string; quote_no: string; quote_date: string }>(),
        )
      : Promise.resolve(null),
  ]);
  const batchIds = Array.from(new Set((allocations.data ?? []).map((a) => a.batch_id)));
  const kinds =
    batchIds.length > 0
      ? await load(
          ctx.supabase.from("production_batches").select("id, kind").in("id", batchIds).returns<{ id: string; kind: "production" | "opening" }[]>(),
        )
      : null;
  const kindById = new Map((kinds?.data ?? []).map((b) => [b.id, b.kind]));
  const productByLine = new Map((lines.data ?? []).map((l) => [l.id, l.product_id]));
  const itemList = items.data ?? [];
  const itemById = new Map(itemList.map((it) => [it.id, it]));
  const multi = itemList.length > 1;

  const cancelled = sale.status === "cancelled";
  const isAdmin = ctx.role === "admin";
  const cur = sale.currency;
  const qty = Number(sale.total_quantity);
  const revenue = Number(sale.revenue_try);
  const cogs = Number(sale.cogs_try);
  const profit = Number(sale.gross_profit_try);
  const allocs = allocations.data ?? [];
  const batchCount = new Set(allocs.map((a) => a.batch_id)).size;
  const deliveryCount = new Set(allocs.map((a) => a.delivery_id)).size;
  const allocQty = allocs.reduce((s, a) => s + a.quantity, 0);
  const allocCost = allocs.reduce((s, a) => s + Number(a.cost_try), 0);
  // Marj tek kaynaktan (kâr / ciro, 1 ondalık); maliyet payı 100 − marj olduğundan ikisi her zaman %100,0 eder.
  const margin = marginPct(profit, revenue);
  const costPct = margin !== null ? 100 - margin : null;
  const costShare = costPct !== null ? Math.min(100, Math.max(0, costPct)) : 0;
  const profitShare = revenue > 0 ? Math.max(0, 100 - costShare) : 0;
  const fxText = `${fxSourceLabel(sale.fx_source)}, ${fmtDate(sale.fx_rate_date)}`;
  const q = quote?.data ?? null;
  // İptal edilen satışın tutarları gösterilir ama gerçekleşmiş sayılmaz: soluk ve üstü çizili.
  const money = (text: string) => (cancelled ? <span className="text-ink-muted line-through decoration-ink-muted/60">{text}</span> : text);
  const cardTone = (tone: "brand" | "blue" | "violet" | "teal" | "red") => (cancelled ? "slate" : tone);
  const cardScope = (scope?: string) => (cancelled ? "İptal edildi" : scope);
  const listDiff = (it: SaleItemView) => {
    const lp = it.list_price !== null ? Number(it.list_price) : null;
    const same = lp !== null && (it.list_currency ?? cur) === cur;
    const diff = same && lp > 0 ? ((Number(it.unit_price) - lp) / lp) * 100 : null;
    return { lp, same, diff };
  };

  return (
    <>
      <PageHeader
        title={sale.sale_no}
        meta={
          <>
            <SaleStatusBadge status={sale.status} />
            {sale.quote_id ? (
              <Badge tone="blue" icon={FileText}>
                Tekliften
              </Badge>
            ) : null}
          </>
        }
        description={
          <>
            {fmtDate(sale.sold_on)} ·{" "}
            {sale.customer_id ? (
              <Link href={`/musteriler/${sale.customer_id}`} className="link">
                {sale.customer_name}
              </Link>
            ) : (
              "Perakende / müşteri belirtilmemiş"
            )}{" "}
            · {cur} satış · {fmtInt(qty)} adet
          </>
        }
        actions={
          isAdmin ? (
            <>
              {!cancelled ? (
                <Modal
                  trigger={
                    <>
                      <Ban aria-hidden />
                      Satışı iptal et
                    </>
                  }
                  triggerVariant="secondary"
                  title={`${sale.sale_no} satışını iptal et`}
                  description="Hatalı girişler içindir. İşlem geri alınamaz."
                  size="sm"
                >
                  <ActionForm action={cancelSale}>
                    <input type="hidden" name="sale_id" value={sale.id} />
                    <Alert tone="warning" className="mb-4">
                      Satış ciro ve kâr toplamlarından çıkar. FIFO tahsisleri aynı parti katmanlarına bir kez geri döner; {fmtInt(qty)} adet Mekonsis
                      rafına geri alınır.
                    </Alert>
                    <FormField name="reason" label="İptal gerekçesi" required hint="En fazla 500 karakter. Satış kaydında saklanır.">
                      <textarea className="input min-h-24" name="reason" maxLength={500} required aria-required="true" />
                    </FormField>
                    <div className="mt-4 flex justify-end">
                      <SubmitButton variant="danger">
                        <Ban aria-hidden />
                        İptali onayla
                      </SubmitButton>
                    </div>
                  </ActionForm>
                </Modal>
              ) : null}
              <ButtonLink href="/satislar/yeni">
                <Plus aria-hidden />
                Satış ekle
              </ButtonLink>
            </>
          ) : null
        }
      />

      {cancelled ? (
        <Alert tone="warning" title="Bu satış iptal edildi" className="mb-4">
          {fmtDateTime(sale.cancelled_at)} · Gerekçe: {sale.cancel_reason}. Ciro ve kâr toplamlarına dahil değildir; ürünler Mekonsis rafına geri
          döndü.
        </Alert>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Toplam satış"
          scope={cardScope(cur)}
          value={money(fmtMoney(sale.total_amount, cur))}
          icon={Receipt}
          tone={cardTone("brand")}
          description={`${fmtInt(qty)} adet · ort. birim fiyat ${fmtUnitMoney(qty > 0 ? Number(sale.total_amount) / qty : null, cur)}`}
        />
        <StatCard
          label="Ciro (TL)"
          scope={cardScope("Satış günü kuru")}
          value={money(fmtMoney(revenue, "TRY"))}
          icon={Banknote}
          tone={cardTone("blue")}
          description={
            cancelled
              ? "Ciro toplamlarına dahil değil"
              : cur === "USD"
                ? `USD/TRY ${fmtRate(sale.fx_rate)} · ${fxText}`
                : `TL satış · USD karşılığı ${fmtMoney(sale.revenue_usd, "USD")}`
          }
        />
        <StatCard
          label="FIFO maliyeti"
          scope={cardScope()}
          value={money(fmtMoney(cogs, "TRY"))}
          icon={Layers}
          tone={cardTone("violet")}
          description={
            cancelled
              ? `${fmtInt(qty)} adet aynı parti katmanlarına geri döndü`
              : `FIFO · ${fmtInt(batchCount)} parti · ort. ${fmtUnitMoney(qty > 0 ? cogs / qty : null, "TRY")} / adet`
          }
        />
        <StatCard
          label="Brüt kâr"
          scope={cardScope()}
          value={money(fmtMoney(profit, "TRY"))}
          icon={cancelled ? Ban : TrendingUp}
          tone={cardTone(profit < 0 ? "red" : "teal")}
          description={cancelled ? `Kâr toplamlarına dahil değil · marj ${fmtRatio(margin)}` : `Gerçekleşmiş · marj ${fmtRatio(margin)}`}
        />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Kâr hesabı"
          icon={TrendingUp}
          description={
            cancelled
              ? "Satış iptal edildi; aşağıdaki tutarlar bilgi amaçlıdır ve ciro/kâr toplamlarına dahil değildir."
              : "Satış günü kuruyla ciro, FIFO ile tahsis edilen parti maliyeti"
          }
        >
          <dl className={cx("text-[13px]", cancelled && "text-ink-muted")}>
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="text-ink-muted">Ciro (TL, satış günü)</dt>
              <dd className={cx("font-medium tabular-nums", cancelled ? STRIKE : "text-ink")}>{fmtMoney(revenue, "TRY")}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="text-ink-muted">Satılan ürün maliyeti (FIFO, TL)</dt>
              <dd className={cx("font-medium tabular-nums", cancelled ? STRIKE : "text-ink")}>−{fmtMoney(cogs, "TRY")}</dd>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-line-strong pt-2.5">
              {cancelled ? (
                <dt className="font-semibold text-ink-soft">
                  İptal edilen satışın brüt kârı (TL)
                  <span className="block text-xs font-normal text-ink-muted">Toplamlara dahil değil</span>
                </dt>
              ) : (
                <dt className="font-semibold text-ink">Gerçekleşmiş brüt kâr (TL)</dt>
              )}
              <dd className={cx("text-[17px] font-semibold tabular-nums", cancelled ? STRIKE : profitTone(profit))}>{fmtMoney(profit, "TRY")}</dd>
            </div>
          </dl>
          {revenue > 0 ? (
            <div className="mt-4">
              <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-canvas" aria-hidden>
                <div
                  className={cx("h-full", cancelled ? "bg-line-strong" : profit < 0 ? "bg-chart-red" : "bg-chart-violet")}
                  style={{ width: `${costShare}%` }}
                />
                {profitShare > 0 ? (
                  <div className={cx("h-full", cancelled ? "bg-ink-muted/30" : "bg-chart-teal")} style={{ width: `${profitShare}%` }} />
                ) : null}
              </div>
              <ul className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-ink-soft tabular-nums">
                <li className="inline-flex items-center gap-1.5">
                  <span className={cx("size-2.5 rounded-sm", cancelled ? "bg-line-strong" : "bg-chart-violet")} aria-hidden />
                  Maliyet payı {fmtRatio(costPct)}
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <span className={cx("size-2.5 rounded-sm", cancelled ? "bg-ink-muted/30" : "bg-chart-teal")} aria-hidden />
                  Brüt marj {fmtRatio(margin)}
                </li>
              </ul>
            </div>
          ) : null}
          <div className="mt-4 rounded-md bg-canvas px-3 py-2 text-xs text-ink-soft">
            <span className="font-medium text-ink-soft">Bilgi amaçlı (USD):</span> ciro {fmtMoney(sale.revenue_usd, "USD")} · maliyet{" "}
            {fmtMoney(sale.cogs_usd, "USD")} · brüt kâr {fmtMoney(sale.gross_profit_usd, "USD")}
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            Ciro satış günündeki kurla TL&apos;ye çevrilip sabitlenir; maliyet, tahsis edilen partilerin üretimde kaydedilen TL maliyetidir. Mekonsis
            komisyonu yoktur; satış tutarının tamamı Heatemp gelirdir.
          </p>
        </Card>

        <Card title="Satış bilgileri" icon={FileText}>
          <DefinitionList
            columns={1}
            items={[
              [
                "Satış no",
                <span key="n" className="font-mono text-xs">
                  {sale.sale_no}
                </span>,
              ],
              ["Satış tarihi", fmtDate(sale.sold_on)],
              [
                "Müşteri",
                sale.customer_id ? (
                  <Link key="m" href={`/musteriler/${sale.customer_id}`} className="link">
                    {sale.customer_name}
                  </Link>
                ) : (
                  <span key="m" className="text-ink-muted">
                    Perakende / belirtilmemiş
                  </span>
                ),
              ],
              ["Para birimi", cur],
              [
                "İşlem kuru (USD/TRY)",
                <span key="k">
                  {fmtRate(sale.fx_rate)}
                  <span className="block text-xs font-normal text-ink-muted">{fxText}</span>
                </span>,
              ],
              sale.quote_id
                ? [
                    "Kaynak teklif",
                    q ? (
                      <Link key="t" href={`/musteriler/teklif/${q.id}`} className="link">
                        {q.quote_no}
                        <span className="ml-1 text-xs font-normal text-ink-muted">({fmtDate(q.quote_date)})</span>
                      </Link>
                    ) : (
                      <span key="t" className="text-xs text-ink-muted">
                        {quote?.error ? "Teklif bilgisi yüklenemedi" : "Teklif bulunamadı"}
                      </span>
                    ),
                  ]
                : [
                    "Kaynak",
                    <span key="t" className="text-ink-muted">
                      Doğrudan satış girişi
                    </span>,
                  ],
              ["Kayıt zamanı", fmtDateTime(sale.created_at)],
              ...(sale.note
                ? ([
                    [
                      "Açıklama",
                      <span key="a" className="font-normal whitespace-pre-line">
                        {sale.note}
                      </span>,
                    ],
                  ] as [string, ReactNode][])
                : []),
              ...(cancelled
                ? ([
                    ["İptal zamanı", fmtDateTime(sale.cancelled_at)],
                    [
                      "İptal gerekçesi",
                      <span key="g" className="font-normal">
                        {sale.cancel_reason}
                      </span>,
                    ],
                  ] as [string, ReactNode][])
                : []),
            ]}
          />
        </Card>
      </div>

      <Card
        title="Kalemler"
        padded={false}
        className="mb-4"
        description="Birim fiyat ve tutar satışın para birimindedir; ciro, maliyet ve kâr TL'dir."
      >
        {items.error ? (
          <ErrorState message={items.error} compact />
        ) : itemList.length === 0 ? (
          <EmptyState title="Bu satışta kalem yok" compact />
        ) : (
          <>
            {/* Telefon: kalem başına kompakt kart */}
            <ul className="divide-y divide-line sm:hidden">
              {itemList.map((it) => {
                const { lp, same, diff } = listDiff(it);
                const itMargin = marginPct(it.gross_profit_try, it.revenue_try);
                return (
                  <li key={it.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <VariantName it={it} productId={productByLine.get(it.id)} />
                        <span className="code block">{it.variant_code}</span>
                      </div>
                      <span className="shrink-0 text-[13px] font-semibold text-ink tabular-nums">{fmtInt(it.quantity)} adet</span>
                    </div>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-soft tabular-nums">
                      <span>
                        {fmtInt(it.quantity)} × {fmtUnitMoney(it.unit_price, cur)} ={" "}
                        <strong className={cx("font-semibold text-ink", cancelled && STRIKE)}>{fmtMoney(it.line_total, cur)}</strong>
                      </span>
                      {lp !== null ? <ListDiffBadge diff={diff} same={same} /> : null}
                    </p>
                    <dl className={cx("mt-2 grid grid-cols-3 gap-2 rounded-md bg-canvas px-2.5 py-2 text-xs tabular-nums", cancelled && STRIKE)}>
                      <div className="min-w-0">
                        <dt className="text-ink-muted">Ciro</dt>
                        <dd className="font-medium text-ink">{fmtMoney(it.revenue_try, "TRY")}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-ink-muted">FIFO maliyeti</dt>
                        <dd className="font-medium text-ink">{fmtMoney(it.cogs_try, "TRY")}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-ink-muted">Brüt kâr · {fmtRatio(itMargin)}</dt>
                        <dd className={cx("font-medium", cancelled ? "text-ink" : profitTone(it.gross_profit_try))}>{fmtMoney(it.gross_profit_try, "TRY")}</dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>
            <TableWrap className="hidden sm:block">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Ürün / varyant</th>
                    <th className="num">Adet</th>
                    <th className="num">Birim fiyat</th>
                    <th className="num hidden lg:table-cell">Liste fiyatı</th>
                    <th className="num hidden md:table-cell">Tutar</th>
                    <th className="num">Ciro (TL)</th>
                    <th className="num hidden lg:table-cell">FIFO maliyeti (TL)</th>
                    <th className="num">Brüt kâr (TL)</th>
                    <th className="num hidden lg:table-cell">Marj</th>
                  </tr>
                </thead>
                <tbody className={cx(cancelled && "text-ink-muted")}>
                  {itemList.map((it) => {
                    const { lp, same, diff } = listDiff(it);
                    const itMargin = marginPct(it.gross_profit_try, it.revenue_try);
                    return (
                      <tr key={it.id}>
                        <td className="min-w-[14rem]">
                          <VariantName it={it} productId={productByLine.get(it.id)} />
                          <span className="code block">{it.variant_code}</span>
                        </td>
                        <td className="num font-medium">{fmtInt(it.quantity)}</td>
                        <td className="num">{fmtUnitMoney(it.unit_price, cur)}</td>
                        <td className="num hidden lg:table-cell">
                          {lp !== null ? fmtUnitMoney(lp, it.list_currency ?? cur) : <span className="text-ink-muted">—</span>}
                          {lp !== null ? (
                            <span className="mt-0.5 block">
                              <ListDiffBadge diff={diff} same={same} />
                            </span>
                          ) : null}
                        </td>
                        <td className={cx("num hidden md:table-cell", cancelled && STRIKE)}>{fmtMoney(it.line_total, cur)}</td>
                        <td className={cx("num", cancelled && STRIKE)}>{fmtMoney(it.revenue_try, "TRY")}</td>
                        <td className={cx("num hidden lg:table-cell", cancelled && STRIKE)}>
                          {fmtMoney(it.cogs_try, "TRY")}
                          <span className="block text-[11px] text-ink-muted">
                            {fmtUnitMoney(it.quantity ? Number(it.cogs_try) / it.quantity : null, "TRY")} / adet
                          </span>
                        </td>
                        <td className={cx("num font-medium", cancelled ? STRIKE : profitTone(it.gross_profit_try))}>{fmtMoney(it.gross_profit_try, "TRY")}</td>
                        <td className={cx("num hidden lg:table-cell", cancelled && STRIKE)}>{fmtRatio(itMargin)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {multi ? (
                  <tfoot>
                    <tr>
                      <td>Toplam</td>
                      <td className="num">{fmtInt(qty)}</td>
                      <td />
                      <td className="hidden lg:table-cell" />
                      <td className={cx("num hidden md:table-cell", cancelled && STRIKE)}>{fmtMoney(sale.total_amount, cur)}</td>
                      <td className={cx("num", cancelled && STRIKE)}>{fmtMoney(revenue, "TRY")}</td>
                      <td className={cx("num hidden lg:table-cell", cancelled && STRIKE)}>{fmtMoney(cogs, "TRY")}</td>
                      <td className={cx("num", cancelled && STRIKE)}>{fmtMoney(profit, "TRY")}</td>
                      <td className={cx("num hidden lg:table-cell", cancelled && STRIKE)}>{fmtRatio(margin)}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </TableWrap>
          </>
        )}
        {lines.error && !items.error ? (
          <p className="flex items-start gap-1.5 border-t border-line px-4 py-2 text-xs text-chart-red" role="status">
            <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
            Ürün bilgisi yüklenemedi; varyant sayfası bağlantıları gösterilemiyor ({lines.error}).
          </p>
        ) : null}
      </Card>

      <Card
        title="Kullanılan partiler (FIFO)"
        icon={Layers}
        padded={false}
        description={
          cancelled
            ? "Satış iptal edildiği için bu adetler aynı parti katmanlarına, Mekonsis rafına geri döndü."
            : "Satılan adetler Mekonsis rafındaki en eski teslimat katmanlarından düşülür. Maliyet, partinin üretimde kaydedilen TL birim maliyetidir."
        }
      >
        {allocations.error ? (
          <ErrorState message={allocations.error} compact />
        ) : allocs.length === 0 ? (
          <EmptyState title="Parti tahsisi bulunamadı" compact />
        ) : (
          <>
            {/* Telefon: tahsis başına kompakt kart */}
            <ul className="divide-y divide-line sm:hidden">
              {allocs.map((a) => {
                const waited = daysBetween(a.delivered_on, sale.sold_on) - 1;
                return (
                  <li key={a.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <Link href={`/uretim/${a.batch_id}`} className="link font-mono text-xs">
                          {a.batch_no}
                        </Link>
                        <BatchKind kind={kindById.get(a.batch_id)} />
                      </div>
                      <span className="shrink-0 text-[13px] font-semibold text-ink tabular-nums">{fmtInt(a.quantity)} adet</span>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted tabular-nums">
                      Teslimat{" "}
                      <Link href={`/teslimatlar/${a.delivery_id}`} className="link font-mono">
                        {a.delivery_no}
                      </Link>{" "}
                      · {fmtDate(a.delivered_on)} · {waited <= 0 ? "aynı gün satıldı" : `${fmtInt(waited)} gün rafta`}
                    </p>
                    {multi ? <p className="mt-0.5 truncate text-xs text-ink-soft">{itemById.get(a.sale_item_id)?.display_name ?? "—"}</p> : null}
                    <p className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-xs text-ink-soft tabular-nums">
                      <span>
                        {fmtUnitMoney(a.unit_cost_try, "TRY")} / adet · pay {fmtRatio(cogs > 0 ? (Number(a.cost_try) / cogs) * 100 : null)}
                      </span>
                      <strong className="font-semibold text-ink">{fmtMoney(a.cost_try, "TRY")}</strong>
                    </p>
                  </li>
                );
              })}
              <li className="flex flex-wrap justify-between gap-x-3 bg-canvas/60 px-4 py-2.5 text-xs font-semibold text-ink tabular-nums">
                <span>
                  Toplam · {fmtInt(batchCount)} parti · {fmtInt(allocQty)} adet
                </span>
                <span>{fmtMoney(allocCost, "TRY")}</span>
              </li>
            </ul>
            <TableWrap className="hidden sm:block">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Parti</th>
                    <th>Teslimat</th>
                    <th className="num hidden lg:table-cell">Rafta bekleme</th>
                    {multi ? <th className="hidden md:table-cell">Kalem</th> : null}
                    <th className="num">Adet</th>
                    <th className="num">Birim maliyet (TL)</th>
                    <th className="num">Maliyet (TL)</th>
                    <th className="num hidden lg:table-cell">Maliyet payı</th>
                  </tr>
                </thead>
                <tbody>
                  {allocs.map((a) => {
                    const waited = daysBetween(a.delivered_on, sale.sold_on) - 1;
                    return (
                      <tr key={a.id}>
                        <td className="whitespace-nowrap">
                          <Link href={`/uretim/${a.batch_id}`} className="link font-mono text-xs">
                            {a.batch_no}
                          </Link>
                          <span className="ml-2">
                            <BatchKind kind={kindById.get(a.batch_id)} />
                          </span>
                        </td>
                        <td className="whitespace-nowrap">
                          <Link href={`/teslimatlar/${a.delivery_id}`} className="link font-mono text-xs">
                            {a.delivery_no}
                          </Link>
                          <span className="block text-[11px] text-ink-muted tabular-nums">{fmtDate(a.delivered_on)} teslim</span>
                        </td>
                        <td className="num hidden text-ink-soft lg:table-cell">{waited <= 0 ? "aynı gün" : `${fmtInt(waited)} gün`}</td>
                        {multi ? <td className="hidden text-xs md:table-cell">{itemById.get(a.sale_item_id)?.display_name ?? "—"}</td> : null}
                        <td className="num font-medium">{fmtInt(a.quantity)}</td>
                        <td className="num">{fmtUnitMoney(a.unit_cost_try, "TRY")}</td>
                        <td className="num">{fmtMoney(a.cost_try, "TRY")}</td>
                        <td className="num hidden text-ink-soft lg:table-cell">{fmtRatio(cogs > 0 ? (Number(a.cost_try) / cogs) * 100 : null)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>
                      Toplam · {fmtInt(batchCount)} parti · {fmtInt(deliveryCount)} teslimat
                    </td>
                    <td className="hidden lg:table-cell" />
                    {multi ? <td className="hidden md:table-cell" /> : null}
                    <td className="num">{fmtInt(allocQty)}</td>
                    <td className="num">{fmtUnitMoney(qty > 0 ? cogs / qty : null, "TRY")}</td>
                    <td className="num">{fmtMoney(allocCost, "TRY")}</td>
                    <td className="num hidden lg:table-cell">{fmtRatio(100)}</td>
                  </tr>
                </tfoot>
              </table>
            </TableWrap>
          </>
        )}
        {kinds?.error && !allocations.error ? (
          <p className="flex items-start gap-1.5 border-t border-line px-4 py-2 text-xs text-chart-red" role="status">
            <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
            Parti türü yüklenemedi; açılış stoğu partileri işaretlenemiyor ({kinds.error}). Parti bağlantısından türünü kontrol edin.
          </p>
        ) : null}
      </Card>
    </>
  );
}

/** İptal satırlarında ve kartlarında tutarlar için (toplamlara dahil değil). */
const STRIKE = "line-through decoration-ink-muted/60";

/** Negatif kâr kırmızı; pozitif kâr için tema rengi olmadığından nötr metin rengi. */
function profitTone(value: number | string | null | undefined) {
  return Number(value) < 0 ? "text-chart-red" : "text-ink";
}

function VariantName({ it, productId }: { it: SaleItemView; productId: string | undefined }) {
  return productId ? (
    <Link href={`/urunler/${productId}/varyant/${it.variant_id}?sekme=stok`} className="font-medium text-ink hover:text-brand-600 hover:underline">
      {it.display_name}
    </Link>
  ) : (
    <span className="font-medium text-ink">{it.display_name}</span>
  );
}

/** Gerçek birim fiyatın liste fiyatına göre farkı; para birimi farklıysa karşılaştırılmaz. */
function ListDiffBadge({ diff, same }: { diff: number | null; same: boolean }) {
  if (!same) return <Badge tone="gray">farklı para birimi</Badge>;
  if (diff === null) return null;
  if (Math.abs(diff) < 0.005) return <Badge tone="gray">liste fiyatında</Badge>;
  return diff < 0 ? (
    <Badge tone="amber" title="Liste fiyatının altında satıldı">
      liste fiyatının {fmtRatio(Math.abs(diff))} altında
    </Badge>
  ) : (
    <Badge tone="green" title="Liste fiyatının üstünde satıldı">
      liste fiyatının {fmtRatio(diff)} üstünde
    </Badge>
  );
}

function BatchKind({ kind }: { kind: "production" | "opening" | undefined }) {
  return kind === "opening" ? <BatchStatusBadge status="completed" kind="opening" /> : null;
}
