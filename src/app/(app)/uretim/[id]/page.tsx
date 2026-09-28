import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, FormField, SubmitButton } from "@/components/forms";
import { Alert, Card, DefinitionList, Muted, PageHeader, TableWrap } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtDateTime, fmtInt, fmtMinutes, fmtMoney, fmtPct, fmtQty, fmtRate, fmtUnitMoney } from "@/lib/format";
import type { BatchConsumption, BatchView } from "@/lib/types";
import { cancelProduction, completeProduction } from "../actions";
import { BatchStatusBadge, CostChange } from "../StatusBadge";

export const metadata: Metadata = { title: "Parti" };

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireMember();
  const { data: batch } = await ctx.supabase.from("v_batches").select("*").eq("id", id).maybeSingle<BatchView>();
  if (!batch) notFound();
  const [{ data: lines }, { data: fx }] = await Promise.all([
    ctx.supabase.from("v_batch_consumptions").select("*").eq("batch_id", id).order("material_name").returns<BatchConsumption[]>(),
    ctx.supabase.from("fx_rates").select("source, rate_type, rate_date").eq("id", batch.fx_rate_id).single(),
  ]);
  const isAdmin = ctx.role === "admin";

  return (
    <>
      <PageHeader
        back={{ href: "/uretim", label: "Üretim ve partiler" }}
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono">{batch.batch_no}</span> <BatchStatusBadge status={batch.status} />
          </span>
        }
        description={`${batch.product_name} — ${batch.variant_name} (${fmtMoney(batch.current_sale_price, batch.current_currency)})`}
      />

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Parti bilgileri" className="xl:col-span-2">
          <DefinitionList
            items={[
              ["Ürün / varyant", batch.display_name],
              ["Adet", fmtInt(batch.quantity)],
              ["Başlangıç", fmtDateTime(batch.started_at)],
              [batch.status === "cancelled" ? "İptal" : "Tamamlanma", fmtDateTime(batch.completed_at ?? batch.cancelled_at)],
              ["Tahmini süre", `${fmtMinutes(batch.estimated_minutes)} (${fmtMinutes(batch.unit_production_minutes)} / adet)`],
              [batch.status === "completed" ? "Gerçek süre" : "Geçen süre", fmtMinutes(batch.status === "completed" ? batch.actual_minutes : batch.elapsed_minutes)],
              ["Toplam maliyet (TL, kayıtlı)", fmtMoney(batch.total_cost_try, "TRY")],
              ["Toplam maliyet (USD)", fmtMoney(batch.total_cost_usd, "USD")],
              ["Birim maliyet (USD)", fmtUnitMoney(batch.unit_cost_usd, "USD")],
              ["Birim maliyet (TL)", fmtUnitMoney(batch.unit_cost_try, "TRY")],
              ["Başlangıç kuru", `${fmtRate(batch.fx_rate)} (${fx?.source ?? ""} ${fx?.rate_date ?? ""})`],
              ["Başlangıçtaki satış fiyatı", fmtMoney(batch.sale_price_snapshot, batch.sale_currency_snapshot ?? "USD")],
              ["Heatemp rafında kalan", batch.heatemp_remaining !== null ? `${fmtInt(batch.heatemp_remaining)} adet` : "—"],
            ]}
          />
          {batch.note ? <p className="mt-3 text-sm text-slate-600">Not: {batch.note}</p> : null}
          {batch.cancel_reason ? <p className="mt-3 text-sm text-slate-600">İptal gerekçesi: {batch.cancel_reason}</p> : null}
        </Card>

        <div className="space-y-6">
          <Card title="Önceki partiye göre birim maliyet">
            {batch.status !== "completed" ? (
              <p className="text-sm text-slate-500">Karşılaştırma yalnızca tamamlanan partiler arasında yapılır.</p>
            ) : batch.prev_batch_no ? (
              <DefinitionList
                items={[
                  ["Önceki parti", batch.prev_batch_no],
                  ["Önceki birim (USD)", fmtUnitMoney(batch.prev_unit_cost_usd, "USD")],
                  ["Bu parti (USD)", fmtUnitMoney(batch.unit_cost_usd, "USD")],
                  ["Değişim (USD)", <CostChange key="c" pct={batch.unit_cost_usd_change_pct} prev={batch.prev_batch_no} />],
                  ["Önceki birim (TL, tarihsel)", fmtUnitMoney(batch.prev_unit_cost_try, "TRY")],
                  ["Değişim (TL, tarihsel)", fmtPct(batch.unit_cost_try_change_pct, true)],
                ]}
              />
            ) : (
              <p className="text-sm text-slate-500">Bu varyantın ilk tamamlanan partisi; karşılaştırılacak önceki parti yok.</p>
            )}
          </Card>

          {isAdmin && batch.status === "in_production" ? (
            <Card title="İşlemler">
              <ActionForm
                action={completeProduction}
                confirmMessage={`${batch.quantity} adet Heatemp rafına eklensin mi?`}
              >
                <input type="hidden" name="batch_id" value={batch.id} />
                <SubmitButton>Tamamla → Heatemp rafına ekle</SubmitButton>
              </ActionForm>
              <hr className="my-4 border-slate-100" />
              <ActionForm
                action={cancelProduction}
                confirmMessage="Parti iptal edilsin mi? Tüketilen malzemeler aynı maliyetle stoğa iade edilecek."
              >
                <input type="hidden" name="batch_id" value={batch.id} />
                <FormField name="reason" label="İptal gerekçesi">
                  <input className="input" name="reason" maxLength={500} />
                </FormField>
                <div className="mt-2">
                  <SubmitButton variant="danger" size="sm">
                    Partiyi iptal et
                  </SubmitButton>
                </div>
              </ActionForm>
            </Card>
          ) : null}
          {batch.status === "completed" ? (
            <Alert tone="info">
              Tamamlanan parti tekrar tamamlanamaz veya iptal edilemez. Mamul{" "}
              <Link className="link" href="/rafim">
                Heatemp rafında
              </Link>
              .
            </Alert>
          ) : null}
        </div>
      </div>

      <Card title="Malzeme tüketimi (partiye sabitlenmiş maliyetler)" padded={false}>
        <TableWrap>
          <table className="table-base">
            <thead>
              <tr>
                <th>Malzeme</th>
                <th className="num">1 adet için</th>
                <th className="num">Tüketilen</th>
                <th className="num">Birim maliyet (USD)</th>
                <th className="num">Birim maliyet (TL)</th>
                <th className="num">Toplam (USD)</th>
                <th className="num">Toplam (TL)</th>
                <th>İade</th>
              </tr>
            </thead>
            <tbody>
              {(lines ?? []).map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link href={`/hammadde/${l.material_id}`} className="link">
                      {l.material_name}
                    </Link>{" "}
                    <Muted>{l.material_code}</Muted>
                  </td>
                  <td className="num">{fmtQty(l.qty_per_unit, l.display_factor, l.display_unit, 4)}</td>
                  <td className="num">{fmtQty(l.qty, l.display_factor, l.display_unit)}</td>
                  <td className="num">
                    {fmtUnitMoney(Number(l.unit_cost_usd) * l.display_factor, "USD")} <Muted>/ {l.display_unit}</Muted>
                  </td>
                  <td className="num">
                    {fmtUnitMoney(Number(l.unit_cost_try) * l.display_factor, "TRY")} <Muted>/ {l.display_unit}</Muted>
                  </td>
                  <td className="num">{fmtMoney(l.total_usd, "USD")}</td>
                  <td className="num">{fmtMoney(l.total_try, "TRY")}</td>
                  <td>{l.returned ? "İade edildi" : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}>Toplam</td>
                <td className="num">{fmtMoney(batch.total_cost_usd, "USD")}</td>
                <td className="num">{fmtMoney(batch.total_cost_try, "TRY")}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </TableWrap>
      </Card>
    </>
  );
}
