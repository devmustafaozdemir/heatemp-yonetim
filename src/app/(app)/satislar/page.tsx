import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, Card, EmptyState, Muted, PageHeader, Stat, TableWrap } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtInt, fmtMoney, fmtPct, fmtRate } from "@/lib/format";
import type { SaleView } from "@/lib/types";

export const metadata: Metadata = { title: "Satışlar" };

export default async function SalesPage() {
  const ctx = await requireMember();
  const { data: sales, error } = await ctx.supabase
    .from("v_sales")
    .select("*")
    .order("sold_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500)
    .returns<SaleView[]>();
  if (error) throw new Error("Satışlar yüklenemedi.");
  const active = (sales ?? []).filter((s) => s.status === "completed");
  const sum = (k: keyof SaleView) => active.reduce((a, s) => a + Number(s[k] ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Satışlar"
        description="Mekonsis'in gerçekleştirdiği satışlar. Ciro ve kâr yalnızca satış anında oluşur; maliyet, Mekonsis rafındaki partilerden FIFO ile tahsis edilir."
        actions={ctx.role === "admin" ? <ButtonLink href="/satislar/yeni">Yeni satış</ButtonLink> : null}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Satılan adet" value={fmtInt(sum("total_quantity"))} />
        <Stat label="Ciro (TL, işlem günü)" value={fmtMoney(sum("revenue_try"), "TRY")} />
        <Stat label="Satılan ürün maliyeti (FIFO)" value={fmtMoney(sum("cogs_try"), "TRY")} />
        <Stat label="Gerçekleşmiş brüt kâr" value={fmtMoney(sum("gross_profit_try"), "TRY")} tone={sum("gross_profit_try") >= 0 ? "positive" : "negative"} />
      </div>
      {(sales ?? []).length === 0 ? (
        <EmptyState title="Henüz satış yok" />
      ) : (
        <Card padded={false}>
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Satış</th>
                  <th>Müşteri</th>
                  <th>Kalemler</th>
                  <th className="num">Adet</th>
                  <th className="num">Toplam tutar</th>
                  <th className="num">Kur</th>
                  <th className="num">Ciro (TL)</th>
                  <th className="num">SMM (TL)</th>
                  <th className="num">Brüt kâr (TL)</th>
                  <th className="num">Marj</th>
                </tr>
              </thead>
              <tbody>
                {(sales ?? []).map((s) => (
                  <tr key={s.id} className={s.status === "cancelled" ? "text-slate-400 line-through decoration-slate-300" : undefined}>
                    <td className="whitespace-nowrap">{fmtDate(s.sold_on)}</td>
                    <td className="whitespace-nowrap">
                      <Link href={`/satislar/${s.id}`} className="link font-mono text-xs">
                        {s.sale_no}
                      </Link>
                      {s.status === "cancelled" ? (
                        <span className="ml-1 no-underline">
                          <Badge>İptal</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td>{s.customer_name ?? <Muted>—</Muted>}</td>
                    <td className="max-w-72 text-xs">{s.items_summary}</td>
                    <td className="num">{fmtInt(s.total_quantity)}</td>
                    <td className="num">{fmtMoney(s.total_amount, s.currency)}</td>
                    <td className="num text-xs">{s.currency === "USD" ? fmtRate(s.fx_rate) : "—"}</td>
                    <td className="num">{fmtMoney(s.revenue_try, "TRY")}</td>
                    <td className="num">{fmtMoney(s.cogs_try, "TRY")}</td>
                    <td className="num">{fmtMoney(s.gross_profit_try, "TRY")}</td>
                    <td className="num">{fmtPct(s.margin_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
    </>
  );
}
