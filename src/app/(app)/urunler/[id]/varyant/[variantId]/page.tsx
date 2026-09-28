import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Badge, Card, DefinitionList, EmptyState, Muted, PageHeader, TableWrap } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtMinutes, fmtMoney, fmtNum, fmtQty, fmtUnitMoney } from "@/lib/format";
import type { BomItem, ProductVariant, Simulation, Unit, VariantView } from "@/lib/types";
import { copyBom, deleteBomItem, deleteVariant, saveBomItem, updateVariant } from "../../../actions";
import { BomLineFields, type BomMaterialOption } from "../../../BomLineForm";
import { VariantFields } from "../../../VariantFields";

export const metadata: Metadata = { title: "Varyant ve reçete" };

export default async function VariantPage({ params }: { params: Promise<{ id: string; variantId: string }> }) {
  const { id, variantId } = await params;
  const ctx = await requireMember();
  const [{ data: variant }, { data: effective }] = await Promise.all([
    ctx.supabase.from("product_variants").select("*").eq("id", variantId).eq("product_id", id).maybeSingle<ProductVariant>(),
    ctx.supabase.from("v_variants").select("*").eq("id", variantId).maybeSingle<VariantView>(),
  ]);
  if (!variant || !effective) notFound();

  const [{ data: bom }, { data: materials }, { data: units }, { data: siblings }, { data: sim }] = await Promise.all([
    ctx.supabase.from("bom_items").select("*").eq("variant_id", variantId).returns<BomItem[]>(),
    ctx.supabase
      .from("raw_materials")
      .select("id, code, name, unit_kind, display_unit")
      .eq("is_active", true)
      .order("name")
      .returns<BomMaterialOption[]>(),
    ctx.supabase.from("units").select("*").order("sort_order").returns<Unit[]>(),
    ctx.supabase.from("v_variants").select("id, display_name").neq("id", variantId).order("display_name"),
    ctx.supabase.rpc("simulate_production", { p_variant_id: variantId, p_quantity: 1 }),
  ]);
  const simulation = sim as Simulation | null;
  const lineByMaterial = new Map((simulation?.lines ?? []).map((l) => [l.material_id, l]));
  const materialById = new Map((materials ?? []).map((m) => [m.id, m]));
  const isAdmin = ctx.role === "admin";

  return (
    <>
      <PageHeader
        back={{ href: `/urunler/${id}`, label: effective.product_name }}
        title={
          <span className="flex items-center gap-2">
            {effective.display_name}
            <span className="font-mono text-sm font-normal text-slate-500">{effective.variant_code}</span>
            {!effective.is_active ? <Badge>Pasif</Badge> : null}
          </span>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Ürün maliyeti (1 adet, tahmini)" className="xl:col-span-1">
          {simulation?.has_bom ? (
            <>
              <DefinitionList
                items={[
                  ["Malzeme maliyeti (USD)", fmtUnitMoney(simulation.unit_cost_usd, "USD")],
                  ["TL karşılığı (kayıt değeri)", fmtUnitMoney(simulation.unit_cost_try, "TRY")],
                  ["Birim üretim süresi", fmtMinutes(effective.unit_production_minutes)],
                  ["Satış fiyatı", fmtMoney(effective.sale_price, effective.currency)],
                ]}
              />
              {!simulation.cost_complete ? (
                <div className="mt-3">
                  <Alert tone="warning">Bazı malzemelerin henüz alış kaydı olmadığı için maliyet eksik hesaplandı.</Alert>
                </div>
              ) : null}
              <p className="mt-3 text-xs text-slate-500">
                Güncel hareketli ağırlıklı ortalama maliyetlerle hesaplanır. Gerçek maliyet, üretim başlatıldığında partiye
                sabitlenir.
              </p>
            </>
          ) : (
            <EmptyState title="Reçete boş">Aşağıdan malzeme ekleyin.</EmptyState>
          )}
        </Card>

        <Card title="Reçete (BOM) — 1 adet için" padded={false} className="xl:col-span-2">
          {(bom ?? []).length === 0 ? (
            <div className="p-4">
              <EmptyState title="Bu varyantın reçetesi yok" />
            </div>
          ) : (
            <TableWrap>
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Malzeme</th>
                    <th className="num">Girilen</th>
                    <th className="num">Temel birimde</th>
                    <th className="num">Birim maliyet (USD)</th>
                    <th className="num">Satır maliyeti</th>
                    {isAdmin ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {(bom ?? []).map((b) => {
                    const line = lineByMaterial.get(b.material_id);
                    const m = materialById.get(b.material_id);
                    return (
                      <tr key={b.id}>
                        <td>
                          {line?.name ?? m?.name ?? "—"} <Muted>{line?.code ?? m?.code}</Muted>
                          {b.note ? <div className="text-xs text-slate-500">{b.note}</div> : null}
                        </td>
                        <td className="num">
                          {fmtNum(b.entry_qty, 4)} {b.entry_unit}
                        </td>
                        <td className="num">
                          {fmtNum(b.qty_per_unit, 6)} {line?.base_unit ?? ""}
                        </td>
                        <td className="num">
                          {line ? `${fmtUnitMoney(line.unit_cost_usd, "USD")} / ${line.base_unit}` : "—"}
                          {line?.cost_basis === "last_purchase" ? <div className="text-xs text-slate-500">son alış (stok yok)</div> : null}
                        </td>
                        <td className="num">
                          {fmtUnitMoney(line?.line_cost_usd, "USD")}
                          <div className="text-xs text-slate-500">{fmtUnitMoney(line?.line_cost_try, "TRY")}</div>
                        </td>
                        {isAdmin ? (
                          <td className="text-right">
                            <ActionForm action={deleteBomItem} confirmMessage="Reçete satırı silinsin mi?" showSuccess={false}>
                              <input type="hidden" name="id" value={b.id} />
                              <SubmitButton size="sm" variant="secondary">
                                Sil
                              </SubmitButton>
                            </ActionForm>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
          {isAdmin ? (
            <div className="border-t border-slate-100 p-4">
              <h3 className="mb-2 text-sm font-medium">Malzeme ekle / miktarı güncelle</h3>
              {(materials ?? []).length === 0 ? (
                <Alert tone="info">Önce Hammadde ekranından malzeme tanımlayın.</Alert>
              ) : (
                <ActionForm action={saveBomItem} resetOnSuccess>
                  <input type="hidden" name="variant_id" value={variantId} />
                  <BomLineFields materials={materials ?? []} units={units ?? []} />
                  <p className="mt-2 text-xs text-slate-500">
                    Birimler temel birime çevrilir (ör. 0,25 kg = 250 g). Reçetede zaten olan malzeme seçilirse miktarı
                    güncellenir.
                  </p>
                  <div className="mt-3">
                    <SubmitButton>Reçeteye kaydet</SubmitButton>
                  </div>
                </ActionForm>
              )}
              {(siblings ?? []).length > 0 ? (
                <ActionForm
                  action={copyBom}
                  confirmMessage="Bu varyantın mevcut reçetesi silinip seçilen varyantın reçetesi kopyalanacak. Devam edilsin mi?"
                  className="mt-4 flex flex-wrap items-end gap-2"
                >
                  <input type="hidden" name="variant_id" value={variantId} />
                  <label className="block">
                    <span className="label">Başka varyantın reçetesini kopyala</span>
                    <select className="input" name="from_variant_id" defaultValue="">
                      <option value="">Seçin…</option>
                      {(siblings ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SubmitButton variant="secondary">Kopyala</SubmitButton>
                </ActionForm>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>

      {simulation?.has_bom ? (
        <p className="mb-6 text-xs text-slate-500">
          Toplam temel miktarlar: {simulation.lines.map((l) => `${l.name} ${fmtQty(l.qty_per_unit, l.display_factor, l.display_unit, 4)}`).join(" · ")}
        </p>
      ) : null}

      {isAdmin ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card title="Varyant bilgileri" className="xl:col-span-2">
            <ActionForm action={updateVariant}>
              <input type="hidden" name="id" value={variant.id} />
              <VariantFields variant={variant} />
              <div className="mt-4">
                <SubmitButton>Kaydet</SubmitButton>
              </div>
            </ActionForm>
          </Card>
          <Card title="Varyantı sil">
            <p className="mb-3 text-sm text-slate-500">
              Üretim veya satış kaydı olan varyant silinemez; pasif yapın. Ürünün son varyantı silinemez.
            </p>
            <ActionForm action={deleteVariant} confirmMessage="Varyant ve reçetesi silinsin mi?">
              <input type="hidden" name="id" value={variant.id} />
              <input type="hidden" name="product_id" value={id} />
              <SubmitButton size="sm" variant="danger">
                Varyantı sil
              </SubmitButton>
            </ActionForm>
          </Card>
        </div>
      ) : null}
    </>
  );
}
