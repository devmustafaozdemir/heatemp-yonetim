import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, Muted, PageHeader, Stat, TableWrap } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtInt, fmtMoney, fmtUnitMoney } from "@/lib/format";
import type { DeliveryView, MekonsisShelfRow } from "@/lib/types";
import { cancelDelivery } from "../rafim/actions";

export const metadata: Metadata = { title: "Mekonsis Rafı ve Teslimatlar" };

export default async function MekonsisPage() {
  const ctx = await requireMember();
  const [{ data: shelf, error }, { data: deliveries }] = await Promise.all([
    ctx.supabase
      .from("v_mekonsis_shelf")
      .select("*")
      .eq("delivery_status", "active")
      .order("delivered_on", { ascending: false })
      .returns<MekonsisShelfRow[]>(),
    ctx.supabase.from("v_deliveries").select("*").order("delivered_on", { ascending: false }).limit(200).returns<DeliveryView[]>(),
  ]);
  if (error) throw new Error("Mekonsis rafı yüklenemedi.");
  const rows = shelf ?? [];

  const summary = new Map<string, { name: string; delivered: number; sold: number; remaining: number; value: number }>();
  for (const r of rows) {
    const s = summary.get(r.variant_id) ?? { name: r.display_name, delivered: 0, sold: 0, remaining: 0, value: 0 };
    s.delivered += r.delivered_qty;
    s.sold += r.sold_qty;
    s.remaining += r.qty_remaining;
    s.value += Number(r.value_try);
    summary.set(r.variant_id, s);
  }
  const tot = Array.from(summary.values()).reduce(
    (a, s) => ({ delivered: a.delivered + s.delivered, sold: a.sold + s.sold, remaining: a.remaining + s.remaining, value: a.value + s.value }),
    { delivered: 0, sold: 0, remaining: 0, value: 0 },
  );

  return (
    <>
      <PageHeader
        title="Mekonsis rafı ve teslimatlar"
        description="Mekonsis'teki ürünler satılana kadar Heatemp varlığıdır ve toplam stok değerine dahildir. Satışlar bu raftaki partilerden FIFO ile düşer."
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Teslim edilen" value={fmtInt(tot.delivered)} />
        <Stat label="Mekonsis'in sattığı" value={fmtInt(tot.sold)} />
        <Stat label="Mekonsis rafında kalan" value={fmtInt(tot.remaining)} />
        <Stat label="Raf maliyet değeri (TL, Heatemp varlığı)" value={fmtMoney(tot.value, "TRY")} />
      </div>

      <Card title="Varyant özeti" padded={false} className="mb-6">
        {summary.size === 0 ? (
          <div className="p-4">
            <EmptyState title="Henüz teslimat yok">Rafım ekranından Mekonsis&apos;e teslim edin.</EmptyState>
          </div>
        ) : (
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Ürün / varyant</th>
                  <th className="num">Teslim edilen</th>
                  <th className="num">Satılan</th>
                  <th className="num">Kalan</th>
                  <th className="num">Kalan maliyet değeri (TL)</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(summary.entries()).map(([vid, s]) => (
                  <tr key={vid}>
                    <td className="font-medium">{s.name}</td>
                    <td className="num">{fmtInt(s.delivered)}</td>
                    <td className="num">{fmtInt(s.sold)}</td>
                    <td className="num font-medium">{fmtInt(s.remaining)}</td>
                    <td className="num">{fmtMoney(s.value, "TRY")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      {rows.length > 0 ? (
        <Card title="Raf — teslimat ve parti bazında" description="Satışlar en eski teslimattan başlayarak (FIFO) tahsis edilir." padded={false} className="mb-6">
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Teslimat tarihi</th>
                  <th>Teslimat</th>
                  <th>Ürün / varyant</th>
                  <th>Parti</th>
                  <th className="num">Teslim edilen</th>
                  <th className="num">Satılan</th>
                  <th className="num">Kalan</th>
                  <th className="num">Birim maliyet</th>
                  <th className="num">Kalan değer (TL)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.layer_id} className={r.qty_remaining === 0 ? "text-slate-400" : undefined}>
                    <td className="whitespace-nowrap">{fmtDate(r.delivered_on)}</td>
                    <td className="font-mono text-xs">{r.delivery_no}</td>
                    <td>{r.display_name}</td>
                    <td>
                      <Link className="link font-mono text-xs" href={`/uretim/${r.batch_id}`}>
                        {r.batch_no}
                      </Link>
                    </td>
                    <td className="num">{fmtInt(r.delivered_qty)}</td>
                    <td className="num">{fmtInt(r.sold_qty)}</td>
                    <td className="num font-medium">{fmtInt(r.qty_remaining)}</td>
                    <td className="num">{fmtUnitMoney(r.unit_cost_try, "TRY")}</td>
                    <td className="num">{fmtMoney(r.value_try, "TRY")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      ) : null}

      <Card title="Teslimat geçmişi" padded={false}>
        {(deliveries ?? []).length === 0 ? (
          <div className="p-4">
            <EmptyState title="Teslimat yok" />
          </div>
        ) : (
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Teslimat</th>
                  <th>Ürün / varyant</th>
                  <th>Partiler</th>
                  <th className="num">Adet</th>
                  <th className="num">Satılan</th>
                  <th className="num">Kalan</th>
                  <th>Durum</th>
                  {ctx.role === "admin" ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {(deliveries ?? []).map((d) => (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap">{fmtDate(d.delivered_on)}</td>
                    <td className="font-mono text-xs">{d.delivery_no}</td>
                    <td>
                      {d.display_name}
                      {d.note ? <div className="text-xs text-slate-500">{d.note}</div> : null}
                    </td>
                    <td className="text-xs">{d.batches}</td>
                    <td className="num">{fmtInt(d.quantity)}</td>
                    <td className="num">{fmtInt(d.sold_qty)}</td>
                    <td className="num">{fmtInt(d.remaining_qty)}</td>
                    <td>
                      {d.status === "active" ? (
                        <Badge tone="green">Aktif</Badge>
                      ) : (
                        <span title={d.cancel_reason ?? undefined}>
                          <Badge>Geri alındı</Badge>
                        </span>
                      )}
                    </td>
                    {ctx.role === "admin" ? (
                      <td>
                        {d.status === "active" && d.sold_qty === 0 ? (
                          <ActionForm
                            action={cancelDelivery}
                            confirmMessage="Teslimat geri alınsın mı? Ürünler Heatemp rafına döner."
                            className="flex items-center gap-1"
                          >
                            <input type="hidden" name="delivery_id" value={d.id} />
                            <input className="input w-36 py-1 text-xs" name="reason" placeholder="Gerekçe" maxLength={500} />
                            <SubmitButton size="sm" variant="secondary">
                              Geri al
                            </SubmitButton>
                          </ActionForm>
                        ) : (
                          <Muted>—</Muted>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
