import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, Muted, PageHeader, TableWrap } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtInt } from "@/lib/format";
import type { Customer } from "@/lib/types";
import { createCustomer } from "./actions";
import { CustomerFields } from "./CustomerFields";

export const metadata: Metadata = { title: "Kurumsal Müşteriler" };

export default async function CustomersPage() {
  const ctx = await requireMember();
  const [{ data: customers, error }, { data: quotes }] = await Promise.all([
    ctx.supabase.from("customers").select("*").order("name").returns<Customer[]>(),
    ctx.supabase.from("quotes").select("customer_id, status"),
  ]);
  if (error) throw new Error("Müşteriler yüklenemedi.");
  const openQuotes = new Map<string, number>();
  for (const q of quotes ?? []) if (q.status === "open") openQuotes.set(q.customer_id, (openQuotes.get(q.customer_id) ?? 0) + 1);

  return (
    <>
      <PageHeader
        title="Kurumsal müşteriler"
        description="Basit firma ve iletişim bilgileri ile toplu satış teklifleri. Teklif stok düşürmez; “Satışa Dönüştür” normal satış akışını bir kez çalıştırır."
      />
      {ctx.role === "admin" ? (
        <Card title="Yeni müşteri" className="mb-6">
          <ActionForm action={createCustomer} resetOnSuccess>
            <CustomerFields />
            <div className="mt-4">
              <SubmitButton>Müşteriyi ekle</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      ) : null}
      {(customers ?? []).length === 0 ? (
        <EmptyState title="Müşteri yok" />
      ) : (
        <Card padded={false}>
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Firma</th>
                  <th>Yetkili</th>
                  <th>Telefon</th>
                  <th>E-posta</th>
                  <th className="num">Açık teklif</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {(customers ?? []).map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/musteriler/${c.id}`} className="link font-medium">
                        {c.name}
                      </Link>
                      {c.tax_number ? <div className="text-xs text-slate-500">VKN {c.tax_number}</div> : null}
                    </td>
                    <td>{c.contact_name ?? <Muted>—</Muted>}</td>
                    <td>{c.phone ?? <Muted>—</Muted>}</td>
                    <td>{c.email ?? <Muted>—</Muted>}</td>
                    <td className="num">{fmtInt(openQuotes.get(c.id) ?? 0)}</td>
                    <td>{c.is_active ? <Badge tone="green">Aktif</Badge> : <Badge>Pasif</Badge>}</td>
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
