import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, FormField, SubmitButton } from "@/components/forms";
import { fxSourceLabel } from "@/components/FxBadge";
import { Alert, Badge, Card, DefinitionList, Muted, PageHeader, TableWrap } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtInt, fmtMoney, fmtPct, fmtRate, fmtUnitMoney } from "@/lib/format";
import type { SaleAllocationView, SaleItemView, SaleView } from "@/lib/types";
import { cancelSale } from "../actions";

export const metadata: Metadata = { title: "Satış" };

export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireMember();
  const { data: sale } = await ctx.supabase.from("v_sales").select("*").eq("id", id).maybeSingle<SaleView>();
  if (!sale) notFound();
  const [{ data: items }, { data: allocations }, { data: quote }] = await Promise.all([
    ctx.supabase.from("v_sale_items").select("*").eq("sale_id", id).order("display_name").returns<SaleItemView[]>(),
    ctx.supabase.from("v_sale_allocations").select("*").eq("sale_id", id).order("id").returns<SaleAllocationView[]>(),
    sale.quote_id
      ? ctx.supabase.from("quotes").select("id, quote_no").eq("id", sale.quote_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const allocByItem = new Map<string, SaleAllocationView[]>();
  for (const a of allocations ?? []) {
    allocByItem.set(a.sale_item_id, [...(allocByItem.get(a.sale_item_id) ?? []), a]);
  }
  const cancelled = sale.status === "cancelled";

  return (
    <>
      <PageHeader
        back={{ href: "/satislar", label: "Satışlar" }}
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono">{sale.sale_no}</span>
            {cancelled ? <Badge>İptal</Badge> : <Badge tone="green">Gerçekleşti</Badge>}
          </span>
        }
        description={`${fmtDate(sale.sold_on)} · ${sale.customer_name ?? "Müşteri belirtilmedi"}`}
      />

      {cancelled ? (
        <div className="mb-6">
          <Alert tone="warning" title="Bu satış iptal edildi">
            {fmtDateTime(sale.cancelled_at)} — {sale.cancel_reason}. Ciro ve kâr toplamlarına dahil değildir; ürünler Mekonsis
            rafına geri döndü.
          </Alert>
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Satış sonucu" className="xl:col-span-2">
          <DefinitionList
            items={[
              ["Gerçek toplam satış tutarı", <strong key="t">{fmtMoney(sale.total_amount, sale.currency)}</strong>],
              ["Satılan adet", fmtInt(sale.total_quantity)],
              [
                "İşlem kuru (USD/TRY)",
                `${fmtRate(sale.fx_rate)} — ${fxSourceLabel(sale.fx_source)}, ${fmtDate(sale.fx_rate_date)}`,
              ],
              ["Ciro (TL, satış günü)", <strong key="c">{fmtMoney(sale.revenue_try, "TRY")}</strong>],
              ["Satılan ürün maliyeti (FIFO, TL)", fmtMoney(sale.cogs_try, "TRY")],
              [
                "Gerçekleşmiş brüt kâr (TL)",
                <strong key="k" className={sale.gross_profit_try >= 0 ? "text-emerald-700" : "text-red-700"}>
                  {fmtMoney(sale.gross_profit_try, "TRY")}
                </strong>,
              ],
              ["Brüt marj", fmtPct(sale.margin_pct)],
              ["Ciro (USD, bilgi amaçlı)", fmtMoney(sale.revenue_usd, "USD")],
              ["Brüt kâr (USD, bilgi amaçlı)", fmtMoney(sale.gross_profit_usd, "USD")],
            ]}
          />
          <p className="mt-3 text-xs text-slate-500">
            Ciro satış günündeki kurla TL&apos;ye çevrilir; maliyet, tahsis edilen partilerin üretimde kaydedilen TL
            maliyetidir. Mekonsis komisyonu yoktur; satış tutarının tamamı Heatemp gelirdir.
          </p>
          {sale.note ? <p className="mt-2 text-sm text-slate-600">Açıklama: {sale.note}</p> : null}
          {quote ? (
            <p className="mt-2 text-sm">
              Kaynak teklif:{" "}
              <Link className="link" href={`/musteriler/teklif/${quote.id}`}>
                {quote.quote_no}
              </Link>
            </p>
          ) : null}
        </Card>
        {ctx.role === "admin" && !cancelled ? (
          <Card title="Satışı iptal et" description="Hatalı girişler için. FIFO tahsisleri aynı parti katmanlarına bir kez geri döner.">
            <ActionForm action={cancelSale} confirmMessage="Satış iptal edilsin mi?">
              <input type="hidden" name="sale_id" value={sale.id} />
              <FormField name="reason" label="Gerekçe *">
                <input className="input" name="reason" maxLength={500} />
              </FormField>
              <div className="mt-3">
                <SubmitButton variant="danger" size="sm">
                  İptal et
                </SubmitButton>
              </div>
            </ActionForm>
          </Card>
        ) : null}
      </div>

      <Card title="Kalemler ve FIFO tahsisleri" padded={false}>
        <TableWrap>
          <table className="table-base">
            <thead>
              <tr>
                <th>Varyant / parti</th>
                <th className="num">Adet</th>
                <th className="num">Birim fiyat</th>
                <th className="num">Tutar</th>
                <th className="num">Ciro (TL)</th>
                <th className="num">Birim maliyet (TL)</th>
                <th className="num">Maliyet (TL)</th>
                <th className="num">Brüt kâr (TL)</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((it) => (
                <ItemRows key={it.id} item={it} currency={sale.currency} allocations={allocByItem.get(it.id) ?? []} />
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Toplam</td>
                <td className="num">{fmtInt(sale.total_quantity)}</td>
                <td />
                <td className="num">{fmtMoney(sale.total_amount, sale.currency)}</td>
                <td className="num">{fmtMoney(sale.revenue_try, "TRY")}</td>
                <td />
                <td className="num">{fmtMoney(sale.cogs_try, "TRY")}</td>
                <td className="num">{fmtMoney(sale.gross_profit_try, "TRY")}</td>
              </tr>
            </tfoot>
          </table>
        </TableWrap>
      </Card>
    </>
  );
}

function ItemRows({
  item,
  currency,
  allocations,
}: {
  item: SaleItemView;
  currency: string;
  allocations: SaleAllocationView[];
}) {
  return (
    <>
      <tr className="bg-slate-50/60">
        <td className="font-medium">
          {item.display_name}
          {item.list_price ? (
            <div className="text-xs font-normal text-slate-500">
              liste fiyatı {fmtMoney(item.list_price, item.list_currency ?? currency)}
            </div>
          ) : null}
        </td>
        <td className="num font-medium">{fmtInt(item.quantity)}</td>
        <td className="num">{fmtUnitMoney(item.unit_price, currency)}</td>
        <td className="num">{fmtMoney(item.line_total, currency)}</td>
        <td className="num">{fmtMoney(item.revenue_try, "TRY")}</td>
        <td className="num">{fmtUnitMoney(item.quantity ? item.cogs_try / item.quantity : null, "TRY")}</td>
        <td className="num">{fmtMoney(item.cogs_try, "TRY")}</td>
        <td className="num">{fmtMoney(item.gross_profit_try, "TRY")}</td>
      </tr>
      {allocations.map((a) => (
        <tr key={a.id} className="text-xs text-slate-600">
          <td className="pl-8">
            ↳ Parti{" "}
            <Link href={`/uretim/${a.batch_id}`} className="link font-mono">
              {a.batch_no}
            </Link>{" "}
            <Muted>
              · teslimat {a.delivery_no} ({fmtDate(a.delivered_on)})
            </Muted>
          </td>
          <td className="num">{fmtInt(a.quantity)}</td>
          <td />
          <td />
          <td />
          <td className="num">{fmtUnitMoney(a.unit_cost_try, "TRY")}</td>
          <td className="num">{fmtMoney(a.cost_try, "TRY")}</td>
          <td />
        </tr>
      ))}
    </>
  );
}
