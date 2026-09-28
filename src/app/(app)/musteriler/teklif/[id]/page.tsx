import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, FormField, SubmitButton } from "@/components/forms";
import { fxSourceLabel } from "@/components/FxBadge";
import { Alert, Card, DefinitionList, EmptyState, Muted, PageHeader, TableWrap } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtInt, fmtMoney, fmtPct, fmtRate, fmtUnitMoney, todayTr } from "@/lib/format";
import type { QuoteEstimate, QuoteView, VariantOverview } from "@/lib/types";
import { deleteQuoteItem, setQuoteStatus, updateQuote } from "../../actions";
import { QuoteStatusBadge } from "../../QuoteStatus";
import { ConvertForm } from "../ConvertForm";
import { QuoteItemForm, type QuoteVariantOption } from "../ItemForm";

export const metadata: Metadata = { title: "Teklif" };

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireMember();
  const { data: quote } = await ctx.supabase.from("v_quotes").select("*").eq("id", id).maybeSingle<QuoteView>();
  if (!quote) notFound();
  const [{ data: est, error: estError }, { data: variants }] = await Promise.all([
    ctx.supabase.rpc("quote_estimate", { p_quote_id: id }),
    ctx.supabase
      .from("v_variant_overview")
      .select("variant_id, display_name, sale_price, currency, mekonsis_qty, is_active")
      .eq("is_active", true)
      .order("display_name")
      .returns<Pick<VariantOverview, "variant_id" | "display_name" | "sale_price" | "currency" | "mekonsis_qty" | "is_active">[]>(),
  ]);
  const estimate = est as QuoteEstimate | null;
  const options: QuoteVariantOption[] = (variants ?? []).map((v) => ({
    id: v.variant_id,
    display_name: v.display_name,
    sale_price: v.sale_price,
    currency: v.currency,
    mekonsis_qty: v.mekonsis_qty,
  }));
  const isAdmin = ctx.role === "admin";
  const open = quote.status === "open";

  return (
    <>
      <PageHeader
        back={{ href: `/musteriler/${quote.customer_id}`, label: quote.customer_name }}
        title={
          <span className="flex items-center gap-2">
            Teklif <span className="font-mono">{quote.quote_no}</span> <QuoteStatusBadge status={quote.status} />
          </span>
        }
        description={`${quote.customer_name} · ${fmtDate(quote.quote_date)}${quote.valid_until ? ` · geçerlilik ${fmtDate(quote.valid_until)}` : ""} · ${quote.currency}`}
      />

      {quote.status === "converted" && quote.sale_id ? (
        <div className="mb-6">
          <Alert tone="success" title="Satışa dönüştürüldü">
            Bu teklif{" "}
            <Link className="link" href={`/satislar/${quote.sale_id}`}>
              {quote.sale_no}
            </Link>{" "}
            numaralı satışa dönüştü. Tekrar dönüştürülemez; satış iptal edilirse teklif yeniden açılır.
          </Alert>
        </div>
      ) : null}
      {estError ? <Alert tone="error">Tahmin hesaplanamadı.</Alert> : null}

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Tahmini sonuç (stok düşürmez)" className="xl:col-span-2">
          {estimate && estimate.lines.length > 0 ? (
            <>
              <DefinitionList
                items={[
                  ["Teklif tutarı", <strong key="a">{fmtMoney(estimate.total_amount, estimate.currency)}</strong>],
                  ["Tahmini ciro (TL)", fmtMoney(estimate.revenue_try, "TRY")],
                  ["Tahmini maliyet (FIFO önizleme, TL)", fmtMoney(estimate.cost_try, "TRY")],
                  ["Tahmini brüt kâr (TL)", <strong key="k">{fmtMoney(estimate.gross_profit_try, "TRY")}</strong>],
                  ["Tahmini marj", fmtPct(estimate.margin_pct)],
                  [
                    "Kullanılan kur (güncel)",
                    estimate.fx ? `${fmtRate(estimate.fx.rate)} — ${fxSourceLabel(estimate.fx.source)}, ${fmtDate(estimate.fx.rate_date)}` : "Kur yok",
                  ],
                ]}
              />
              <p className="mt-3 text-xs text-slate-500">
                Maliyet, Mekonsis rafındaki mevcut partilerden FIFO sırasıyla tahmin edilir; stok yetmeyen kısım için son
                tamamlanan partinin birim maliyeti kullanılır. Kesin değerler satışa dönüştürmede hesaplanır.
              </p>
              {estimate.has_shortage ? (
                <div className="mt-3">
                  <Alert tone="warning">
                    Bazı kalemler için Mekonsis rafında yeterli stok yok; bu hâliyle satışa dönüştürme reddedilir.
                  </Alert>
                </div>
              ) : null}
              {estimate.cost_unknown ? (
                <div className="mt-2">
                  <Alert tone="warning">Hiç üretilmemiş varyantların maliyeti bilinmiyor; kâr fazla görünebilir.</Alert>
                </div>
              ) : null}
              {estimate.fx && !estimate.fx.is_valid ? (
                <div className="mt-2">
                  <Alert tone="warning">Güncel kur eski; TL tahmini yaklaşık değerdir.</Alert>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState title="Teklifte kalem yok">Aşağıdan varyant, adet ve özel fiyat ekleyin.</EmptyState>
          )}
        </Card>
        <div className="space-y-6">
          {isAdmin && open ? (
            <Card title="Satışa dönüştür" description="Güncel Mekonsis stoğu yeniden kontrol edilir; satış yalnızca bir kez oluşturulur.">
              <ConvertForm quoteId={quote.id} today={todayTr()} disabled={!estimate || estimate.lines.length === 0 || estimate.has_shortage} />
            </Card>
          ) : null}
          {isAdmin && quote.status !== "converted" ? (
            <Card title="Teklif durumu">
              <ActionForm action={setQuoteStatus} confirmMessage={open ? "Teklif iptal edilsin mi?" : "Teklif yeniden açılsın mı?"}>
                <input type="hidden" name="id" value={quote.id} />
                <input type="hidden" name="status" value={open ? "cancelled" : "open"} />
                <SubmitButton size="sm" variant="secondary">
                  {open ? "Teklifi iptal et" : "Teklifi yeniden aç"}
                </SubmitButton>
              </ActionForm>
            </Card>
          ) : null}
        </div>
      </div>

      <Card title="Kalemler" padded={false} className="mb-6">
        {estimate && estimate.lines.length > 0 ? (
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Varyant</th>
                  <th className="num">Adet</th>
                  <th className="num">Özel fiyat</th>
                  <th className="num">Liste fiyatı</th>
                  <th className="num">İndirim</th>
                  <th className="num">Tutar</th>
                  <th className="num">Mekonsis stoğu</th>
                  <th className="num">Tahmini maliyet (TL)</th>
                  <th className="num">Tahmini kâr (TL)</th>
                  <th className="num">Marj</th>
                  {isAdmin && open ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {estimate.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="font-medium">{l.display_name}</td>
                    <td className="num">{fmtInt(l.quantity)}</td>
                    <td className="num">{fmtUnitMoney(l.unit_price, estimate.currency)}</td>
                    <td className="num">{l.list_price ? fmtUnitMoney(l.list_price, l.list_currency ?? estimate.currency) : "—"}</td>
                    <td className="num">{l.discount_pct !== null ? fmtPct(l.discount_pct) : <Muted>—</Muted>}</td>
                    <td className="num">{fmtMoney(l.line_total, estimate.currency)}</td>
                    <td className="num">
                      {fmtInt(l.mekonsis_available)}
                      {l.shortage > 0 ? <div className="text-xs font-medium text-red-700">{fmtInt(l.shortage)} eksik</div> : null}
                    </td>
                    <td className="num">
                      {fmtMoney(l.cost_try, "TRY")}
                      {l.cost_unknown ? <div className="text-xs text-amber-700">maliyet bilinmiyor</div> : null}
                    </td>
                    <td className="num">{fmtMoney(l.gross_profit_try, "TRY")}</td>
                    <td className="num">{fmtPct(l.margin_pct)}</td>
                    {isAdmin && open ? (
                      <td className="text-right">
                        <ActionForm action={deleteQuoteItem} showSuccess={false}>
                          <input type="hidden" name="id" value={l.id} />
                          <SubmitButton size="sm" variant="secondary">
                            Sil
                          </SubmitButton>
                        </ActionForm>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : (
          <div className="p-4">
            <EmptyState title="Kalem yok" />
          </div>
        )}
        {isAdmin && open ? (
          <div className="border-t border-slate-100 p-4">
            <QuoteItemForm quoteId={quote.id} currency={quote.currency} variants={options} />
          </div>
        ) : null}
      </Card>

      {isAdmin && open ? (
        <Card title="Teklif bilgileri">
          <ActionForm action={updateQuote}>
            <input type="hidden" name="id" value={quote.id} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <FormField name="quote_date" label="Teklif tarihi *">
                <input className="input" type="date" name="quote_date" defaultValue={quote.quote_date} />
              </FormField>
              <FormField name="valid_until" label="Geçerlilik">
                <input className="input" type="date" name="valid_until" defaultValue={quote.valid_until ?? ""} />
              </FormField>
              <FormField name="currency" label="Para birimi">
                <select className="input" name="currency" defaultValue={quote.currency}>
                  <option value="USD">USD</option>
                  <option value="TRY">TRY</option>
                </select>
              </FormField>
              <FormField name="note" label="Not">
                <input className="input" name="note" defaultValue={quote.note ?? ""} maxLength={1000} />
              </FormField>
            </div>
            <div className="mt-3">
              <SubmitButton size="sm">Kaydet</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      ) : null}
    </>
  );
}
