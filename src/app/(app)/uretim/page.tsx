import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Card, EmptyState, Muted, PageHeader, TableWrap, cx } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtDateTime, fmtInt, fmtMinutes, fmtMoney, fmtUnitMoney } from "@/lib/format";
import type { BatchView } from "@/lib/types";
import { BatchStatusBadge, CostChange } from "./StatusBadge";

export const metadata: Metadata = { title: "Üretim ve Partiler" };

const FILTERS = [
  { key: "", label: "Tümü" },
  { key: "in_production", label: "Üretimde" },
  { key: "completed", label: "Tamamlandı" },
  { key: "cancelled", label: "İptal" },
];

export default async function BatchesPage({ searchParams }: { searchParams: Promise<{ durum?: string }> }) {
  const { durum = "" } = await searchParams;
  const ctx = await requireMember();
  let q = ctx.supabase.from("v_batches").select("*").order("started_at", { ascending: false }).limit(300);
  if (FILTERS.some((f) => f.key === durum && f.key)) q = q.eq("status", durum);
  const { data: batches, error } = await q.returns<BatchView[]>();
  if (error) throw new Error("Partiler yüklenemedi.");

  return (
    <>
      <PageHeader
        title="Üretim ve partiler"
        description="Her üretim bir partidir. Başlatınca malzeme tüketilir ve maliyet partiye sabitlenir; tamamlayınca mamul Heatemp rafına girer."
        actions={ctx.role === "admin" ? <ButtonLink href="/simulasyon">Yeni üretim (simülasyon)</ButtonLink> : null}
      />
      <div className="mb-3 flex gap-1">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key ? `/uretim?durum=${f.key}` : "/uretim"}
            className={cx(
              "rounded-md px-3 py-1.5 text-sm",
              durum === f.key ? "bg-slate-800 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>
      {(batches ?? []).length === 0 ? (
        <EmptyState title="Parti yok">Üretim, simülasyon ekranından başlatılır.</EmptyState>
      ) : (
        <Card padded={false}>
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Parti</th>
                  <th>Ürün — varyant (fiyat)</th>
                  <th className="num">Adet</th>
                  <th>Durum</th>
                  <th>Başlangıç</th>
                  <th>Tamamlanma</th>
                  <th className="num">Süre (tahmini / gerçek)</th>
                  <th className="num">Birim maliyet</th>
                  <th className="num">Toplam maliyet (TL)</th>
                  <th className="num">Değişim (USD)</th>
                </tr>
              </thead>
              <tbody>
                {(batches ?? []).map((b) => (
                  <tr key={b.id}>
                    <td className="whitespace-nowrap">
                      <Link href={`/uretim/${b.id}`} className="link font-mono text-xs font-medium">
                        {b.batch_no}
                      </Link>
                    </td>
                    <td>
                      <div className="font-medium">{b.product_name}</div>
                      <div className="text-xs text-slate-500">
                        {b.variant_name} · {fmtMoney(b.current_sale_price, b.current_currency)}
                      </div>
                    </td>
                    <td className="num">{fmtInt(b.quantity)}</td>
                    <td>
                      <BatchStatusBadge status={b.status} />
                    </td>
                    <td className="whitespace-nowrap text-xs">{fmtDateTime(b.started_at)}</td>
                    <td className="whitespace-nowrap text-xs">{fmtDateTime(b.completed_at ?? b.cancelled_at)}</td>
                    <td className="num">
                      {fmtMinutes(b.estimated_minutes)}
                      <div className="text-xs text-slate-500">
                        {b.status === "completed" ? fmtMinutes(b.actual_minutes) : b.status === "in_production" ? `geçen ${fmtMinutes(b.elapsed_minutes)}` : "—"}
                      </div>
                    </td>
                    <td className="num">
                      {fmtUnitMoney(b.unit_cost_usd, "USD")}
                      <div className="text-xs text-slate-500">{fmtUnitMoney(b.unit_cost_try, "TRY")}</div>
                    </td>
                    <td className="num">{fmtMoney(b.total_cost_try, "TRY")}</td>
                    <td className="num">
                      {b.status === "completed" ? <CostChange pct={b.unit_cost_usd_change_pct} prev={b.prev_batch_no} /> : <Muted>—</Muted>}
                    </td>
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
