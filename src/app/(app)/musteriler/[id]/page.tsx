import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, FormField, SubmitButton } from "@/components/forms";
import { Card, EmptyState, PageHeader, TableWrap } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtInt, fmtMoney, todayTr } from "@/lib/format";
import type { Customer, QuoteView, SaleView } from "@/lib/types";
import { createQuote, updateCustomer } from "../actions";
import { CustomerFields } from "../CustomerFields";
import { QuoteStatusBadge } from "../QuoteStatus";

export const metadata: Metadata = { title: "Müşteri" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireMember();
  const { data: customer } = await ctx.supabase.from("customers").select("*").eq("id", id).maybeSingle<Customer>();
  if (!customer) notFound();
  const [{ data: quotes }, { data: sales }] = await Promise.all([
    ctx.supabase.from("v_quotes").select("*").eq("customer_id", id).order("created_at", { ascending: false }).returns<QuoteView[]>(),
    ctx.supabase.from("v_sales").select("*").eq("customer_id", id).order("sold_on", { ascending: false }).returns<SaleView[]>(),
  ]);
  const isAdmin = ctx.role === "admin";

  return (
    <>
      <PageHeader
        back={{ href: "/musteriler", label: "Kurumsal müşteriler" }}
        title={customer.name}
        description={[customer.contact_name, customer.phone, customer.email].filter(Boolean).join(" · ") || undefined}
      />

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Toplu satış teklifleri" padded={false} className="xl:col-span-2">
          {(quotes ?? []).length === 0 ? (
            <div className="p-4">
              <EmptyState title="Teklif yok" />
            </div>
          ) : (
            <TableWrap>
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Teklif</th>
                    <th>Tarih</th>
                    <th>Geçerlilik</th>
                    <th className="num">Kalem</th>
                    <th className="num">Adet</th>
                    <th className="num">Tutar</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {(quotes ?? []).map((q) => (
                    <tr key={q.id}>
                      <td>
                        <Link className="link font-mono text-xs" href={`/musteriler/teklif/${q.id}`}>
                          {q.quote_no}
                        </Link>
                      </td>
                      <td>{fmtDate(q.quote_date)}</td>
                      <td>{fmtDate(q.valid_until)}</td>
                      <td className="num">{fmtInt(q.item_count)}</td>
                      <td className="num">{fmtInt(q.total_quantity)}</td>
                      <td className="num">{fmtMoney(q.total_amount, q.currency)}</td>
                      <td>
                        <QuoteStatusBadge status={q.status} />
                        {q.sale_id ? (
                          <Link className="link ml-1 text-xs" href={`/satislar/${q.sale_id}`}>
                            {q.sale_no}
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
        {isAdmin ? (
          <Card title="Yeni teklif">
            <ActionForm action={createQuote}>
              <input type="hidden" name="customer_id" value={customer.id} />
              <div className="grid grid-cols-2 gap-3">
                <FormField name="quote_date" label="Teklif tarihi *">
                  <input className="input" type="date" name="quote_date" defaultValue={todayTr()} />
                </FormField>
                <FormField name="valid_until" label="Geçerlilik">
                  <input className="input" type="date" name="valid_until" />
                </FormField>
                <FormField name="currency" label="Para birimi">
                  <select className="input" name="currency" defaultValue="USD">
                    <option value="USD">USD</option>
                    <option value="TRY">TRY</option>
                  </select>
                </FormField>
                <FormField name="note" label="Not" className="col-span-2">
                  <input className="input" name="note" maxLength={1000} />
                </FormField>
              </div>
              <div className="mt-3">
                <SubmitButton>Teklif oluştur</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        ) : null}
      </div>

      <Card title="Bu müşteriye yapılan satışlar" padded={false} className="mb-6">
        {(sales ?? []).length === 0 ? (
          <div className="p-4">
            <EmptyState title="Satış yok" />
          </div>
        ) : (
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Satış</th>
                  <th>Kalemler</th>
                  <th className="num">Tutar</th>
                  <th className="num">Ciro (TL)</th>
                  <th className="num">Brüt kâr (TL)</th>
                </tr>
              </thead>
              <tbody>
                {(sales ?? []).map((s) => (
                  <tr key={s.id} className={s.status === "cancelled" ? "text-slate-400 line-through" : undefined}>
                    <td>{fmtDate(s.sold_on)}</td>
                    <td>
                      <Link className="link font-mono text-xs" href={`/satislar/${s.id}`}>
                        {s.sale_no}
                      </Link>
                    </td>
                    <td className="text-xs">{s.items_summary}</td>
                    <td className="num">{fmtMoney(s.total_amount, s.currency)}</td>
                    <td className="num">{fmtMoney(s.revenue_try, "TRY")}</td>
                    <td className="num">{fmtMoney(s.gross_profit_try, "TRY")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      {isAdmin ? (
        <Card title="Firma bilgileri">
          <ActionForm action={updateCustomer}>
            <input type="hidden" name="id" value={customer.id} />
            <CustomerFields customer={customer} />
            <div className="mt-4">
              <SubmitButton>Kaydet</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      ) : null}
    </>
  );
}
