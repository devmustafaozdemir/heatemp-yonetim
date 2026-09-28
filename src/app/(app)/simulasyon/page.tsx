import type { Metadata } from "next";
import { Alert, Badge, Card, DefinitionList, EmptyState, Muted, PageHeader, TableWrap } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { toUserMessage } from "@/lib/errors";
import { fmtInt, fmtMinutes, fmtMoney, fmtQty, fmtUnitMoney, todayTr } from "@/lib/format";
import { isUuid } from "@/lib/parse";
import type { Simulation } from "@/lib/types";
import { SimulationPicker, type PickerVariant } from "./Picker";
import { StartProductionForm } from "./StartForm";

export const metadata: Metadata = { title: "Üretim Simülasyonu" };

export default async function SimulationPage({
  searchParams,
}: {
  searchParams: Promise<{ varyant?: string; adet?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireMember();
  const variantId = isUuid(sp.varyant) ? sp.varyant : null;
  const qty = Math.max(1, Math.floor(Number(sp.adet) || 1));

  const { data: variants } = await ctx.supabase
    .from("v_variants")
    .select("id, product_id, product_name, variant_name, is_active")
    .order("product_name")
    .order("variant_name")
    .returns<PickerVariant[]>();

  let sim: Simulation | null = null;
  let error: string | null = null;
  if (variantId) {
    const { data, error: e } = await ctx.supabase.rpc("simulate_production", { p_variant_id: variantId, p_quantity: qty });
    if (e) error = toUserMessage(e);
    else sim = data as Simulation;
  }

  return (
    <>
      <PageHeader
        title="Üretim simülasyonu"
        description="Simülasyon stok düşürmez. Gerekli malzemeleri, eksikleri, maksimum üretilebilir adedi, tahmini maliyeti ve süreyi gösterir. Yeterli stok varsa buradan üretimi başlatabilirsiniz."
      />
      <Card className="mb-6">
        {(variants ?? []).length === 0 ? (
          <EmptyState title="Önce ürün ve reçete tanımlayın" />
        ) : (
          <SimulationPicker variants={variants ?? []} initialVariant={variantId} initialQty={qty} />
        )}
      </Card>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {sim ? (
        <>
          <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card title={`${sim.variant.display_name} × ${fmtInt(sim.quantity)}`} className="xl:col-span-2">
              <DefinitionList
                items={[
                  ["Maksimum üretilebilir", <strong key="m">{fmtInt(sim.max_producible)} adet</strong>],
                  ["Stok durumu", sim.all_available ? <Badge tone="green" key="s">Yeterli</Badge> : <Badge tone="red" key="s">Eksik var</Badge>],
                  ["Tahmini toplam maliyet (USD)", fmtMoney(sim.total_cost_usd, "USD")],
                  ["TL karşılığı (kayıt değeri)", fmtMoney(sim.total_cost_try, "TRY")],
                  ["Tahmini birim maliyet (USD)", fmtUnitMoney(sim.unit_cost_usd, "USD")],
                  ["Birim maliyet TL karşılığı", fmtUnitMoney(sim.unit_cost_try, "TRY")],
                  ["Birim üretim süresi", fmtMinutes(sim.unit_production_minutes)],
                  ["Tahmini üretim süresi", `${fmtMinutes(sim.estimated_minutes)} (${fmtInt(sim.quantity)} × ${fmtMinutes(sim.unit_production_minutes)})`],
                  ["Satış fiyatı", fmtMoney(sim.variant.sale_price, sim.variant.currency)],
                ]}
              />
              {!sim.cost_complete && sim.has_bom ? (
                <div className="mt-3">
                  <Alert tone="warning">Bazı malzemelerin hiç alış kaydı yok; maliyet eksik hesaplandı.</Alert>
                </div>
              ) : null}
              <p className="mt-3 text-xs text-slate-500">
                Tahmin, malzemelerin güncel hareketli ağırlıklı ortalama maliyetiyle yapılır. Üretim başlatıldığında o andaki
                birim maliyetler ve kur partiye sabitlenir (kayıtlı gerçek maliyet).
              </p>
            </Card>
            <Card title="Üretimi başlat">
              {!sim.has_bom ? (
                <Alert tone="warning">Bu varyantın reçetesi (BOM) yok.</Alert>
              ) : !sim.variant.is_active ? (
                <Alert tone="warning">Varyant veya ürün pasif.</Alert>
              ) : !sim.all_available ? (
                <Alert tone="error" title="Yetersiz hammadde">
                  Bu adet için stok yetersiz. En fazla {fmtInt(sim.max_producible)} adet üretilebilir.
                </Alert>
              ) : ctx.role !== "admin" ? (
                <Alert tone="info">Üretim başlatmak için yönetici yetkisi gerekir.</Alert>
              ) : null}
              {ctx.role === "admin" && sim.has_bom ? (
                <div className="mt-3">
                  <StartProductionForm variantId={sim.variant.id} quantity={sim.quantity} today={todayTr()} disabled={!sim.can_start} />
                </div>
              ) : null}
            </Card>
          </div>

          <Card title="Gerekli malzemeler" padded={false}>
            {sim.lines.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Reçete boş" />
              </div>
            ) : (
              <TableWrap>
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Malzeme</th>
                      <th className="num">1 adet için</th>
                      <th className="num">Gerekli</th>
                      <th className="num">Mevcut</th>
                      <th className="num">Eksik</th>
                      <th className="num">Bu malzemeyle en fazla</th>
                      <th className="num">Birim maliyet (USD)</th>
                      <th className="num">Tahmini maliyet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sim.lines.map((l) => (
                      <tr key={l.material_id} className={l.shortage > 0 ? "bg-red-50/60" : undefined}>
                        <td>
                          {l.name} <Muted>{l.code}</Muted>
                        </td>
                        <td className="num">{fmtQty(l.qty_per_unit, l.display_factor, l.display_unit, 4)}</td>
                        <td className="num">{fmtQty(l.required, l.display_factor, l.display_unit)}</td>
                        <td className="num">{fmtQty(l.available, l.display_factor, l.display_unit)}</td>
                        <td className="num">
                          {l.shortage > 0 ? (
                            <span className="font-semibold text-red-700">{fmtQty(l.shortage, l.display_factor, l.display_unit)}</span>
                          ) : (
                            <Badge tone="green">Yeterli</Badge>
                          )}
                        </td>
                        <td className="num">{fmtInt(l.max_units)} adet</td>
                        <td className="num">
                          {l.unit_cost_usd !== null ? `${fmtUnitMoney(Number(l.unit_cost_usd) * l.display_factor, "USD")} / ${l.display_unit}` : "—"}
                          {l.cost_basis === "last_purchase" ? <div className="text-xs text-slate-500">son alış fiyatı</div> : null}
                          {l.cost_basis === "none" ? <div className="text-xs text-amber-700">maliyet yok</div> : null}
                        </td>
                        <td className="num">
                          {fmtMoney(l.line_cost_usd, "USD")}
                          <div className="text-xs text-slate-500">{fmtMoney(l.line_cost_try, "TRY")}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>
        </>
      ) : !error ? (
        <EmptyState title="Ürün, varyant ve adet seçip “Hesapla”ya basın" />
      ) : null}
    </>
  );
}
