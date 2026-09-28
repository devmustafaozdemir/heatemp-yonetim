import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, FormField, SubmitButton } from "@/components/forms";
import { Badge, Card, DefinitionList, EmptyState, Muted, PageHeader, TableWrap } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtMoney, fmtNum, fmtQty, fmtRate, fmtUnitMoney, todayTr } from "@/lib/format";
import type { MaterialMovement, MaterialView, Unit } from "@/lib/types";
import { updateMaterial, writeOffMaterial } from "../actions";
import { MaterialFields } from "../MaterialForm";
import { ReceiveForm } from "../ReceiveForm";

export const metadata: Metadata = { title: "Malzeme" };

const MOVEMENT_LABEL: Record<MaterialMovement["movement_type"], { label: string; tone: "green" | "orange" | "blue" | "red" }> = {
  purchase: { label: "Alış", tone: "green" },
  production_consume: { label: "Üretim tüketimi", tone: "orange" },
  production_return: { label: "Parti iptali iadesi", tone: "blue" },
  write_off: { label: "Fire / sayım düşümü", tone: "red" },
};

export default async function MaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireMember();
  const { data: material } = await ctx.supabase.from("v_materials").select("*").eq("id", id).maybeSingle<MaterialView>();
  if (!material) notFound();
  const [{ data: movements }, { data: units }, { data: bomUse }] = await Promise.all([
    ctx.supabase
      .from("material_movements")
      .select("*")
      .eq("material_id", id)
      .order("id", { ascending: false })
      .limit(200)
      .returns<MaterialMovement[]>(),
    ctx.supabase.from("units").select("*").eq("kind", material.unit_kind).order("sort_order").returns<Unit[]>(),
    ctx.supabase.from("bom_items").select("variant_id, qty_per_unit").eq("material_id", id),
  ]);
  const usedVariantIds = (bomUse ?? []).map((b) => b.variant_id);
  const { data: usedVariants } = usedVariantIds.length
    ? await ctx.supabase.from("v_variants").select("id, display_name, product_id").in("id", usedVariantIds)
    : { data: [] as { id: string; display_name: string; product_id: string }[] };
  const variantInfo = new Map((usedVariants ?? []).map((v) => [v.id, v]));
  const batchIds = [...new Set((movements ?? []).map((m) => m.batch_id).filter(Boolean))] as string[];
  const { data: batches } = batchIds.length
    ? await ctx.supabase.from("production_batches").select("id, batch_no").in("id", batchIds)
    : { data: [] as { id: string; batch_no: string }[] };
  const batchNo = new Map((batches ?? []).map((b) => [b.id, b.batch_no]));
  const isAdmin = ctx.role === "admin";
  const allUnits = units ?? [];

  return (
    <>
      <PageHeader
        back={{ href: "/hammadde", label: "Hammadde" }}
        title={
          <span className="flex items-center gap-2">
            {material.name} <span className="font-mono text-sm font-normal text-slate-500">{material.code}</span>
            {material.kind === "component" ? <Badge tone="blue">Komponent</Badge> : <Badge>Hammadde</Badge>}
          </span>
        }
      />

      <Card title="Stok ve maliyet" className="mb-6">
        <DefinitionList
          items={[
            ["Mevcut miktar", `${fmtNum(material.qty_display, 4)} ${material.display_unit}`],
            ["Temel birimde", `${fmtNum(material.qty, 4)} ${material.base_unit}`],
            ["Stok değeri (TL, tarihsel)", fmtMoney(material.value_try, "TRY")],
            ["Ort. maliyet (USD)", material.avg_cost_usd_display !== null ? `${fmtUnitMoney(material.avg_cost_usd_display, "USD")} / ${material.display_unit}` : "—"],
            ["Ort. maliyet (TL)", material.avg_cost_try_display !== null ? `${fmtUnitMoney(material.avg_cost_try_display, "TRY")} / ${material.display_unit}` : "—"],
            ["USD karşılığı (bilgi)", fmtMoney(material.value_usd, "USD")],
          ]}
        />
        {(bomUse ?? []).length > 0 ? (
          <p className="mt-3 text-xs text-slate-500">
            Kullanıldığı reçeteler:{" "}
            {(bomUse ?? []).map((b, i) => {
              const v = variantInfo.get(b.variant_id);
              return (
                <span key={b.variant_id}>
                  {i > 0 ? ", " : ""}
                  <Link className="link" href={`/urunler/${v?.product_id}/varyant/${b.variant_id}`}>
                    {v?.display_name}
                  </Link>{" "}
                  ({fmtQty(b.qty_per_unit, material.display_factor, material.display_unit, 4)}/adet)
                </span>
              );
            })}
          </p>
        ) : null}
      </Card>

      {isAdmin ? (
        <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card title="Alış (stok girişi)" description="Her alış ayrı bir maliyet hareketi olarak saklanır ve kendi günündeki kurla sabitlenir." className="xl:col-span-2">
            <ReceiveForm materialId={material.id} units={allUnits} defaultUnit={material.display_unit} today={todayTr()} />
          </Card>
          <Card title="Fire / sayım düşümü" description="Ortalama maliyetle stoktan düşer. Gerekçe zorunludur.">
            <ActionForm action={writeOffMaterial} resetOnSuccess>
              <input type="hidden" name="material_id" value={material.id} />
              <div className="grid grid-cols-2 gap-3">
                <FormField name="qty" label="Miktar *">
                  <input className="input" name="qty" inputMode="decimal" />
                </FormField>
                <FormField name="unit" label="Birim">
                  <select className="input" name="unit" defaultValue={material.display_unit}>
                    {allUnits.map((u) => (
                      <option key={u.code} value={u.code}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField name="reason" label="Gerekçe *" className="col-span-2">
                  <input className="input" name="reason" maxLength={500} placeholder="ör. sayım farkı, hasarlı parça" />
                </FormField>
              </div>
              <div className="mt-3">
                <SubmitButton variant="secondary">Stoktan düş</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        </div>
      ) : null}

      <Card title="Hareketler" padded={false} className="mb-6">
        {(movements ?? []).length === 0 ? (
          <div className="p-4">
            <EmptyState title="Henüz hareket yok">İlk alışı yukarıdaki formdan kaydedin.</EmptyState>
          </div>
        ) : (
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Hareket</th>
                  <th className="num">Miktar</th>
                  <th className="num">Özgün tutar</th>
                  <th className="num">Kur</th>
                  <th className="num">Birim maliyet</th>
                  <th className="num">Değer (TL)</th>
                  <th className="num">Sonraki bakiye</th>
                  <th>Açıklama</th>
                </tr>
              </thead>
              <tbody>
                {(movements ?? []).map((m) => {
                  const t = MOVEMENT_LABEL[m.movement_type];
                  return (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap">{fmtDate(m.movement_date)}</td>
                      <td>
                        <Badge tone={t.tone}>{t.label}</Badge>
                      </td>
                      <td className="num">
                        {m.qty > 0 ? "+" : "−"}
                        {fmtQty(Math.abs(m.qty), material.display_factor, material.display_unit, 4)}
                        {m.entry_unit && m.entry_unit !== material.display_unit ? (
                          <div className="text-xs text-slate-500">
                            girilen: {fmtNum(m.entry_qty, 4)} {m.entry_unit}
                          </div>
                        ) : null}
                      </td>
                      <td className="num">
                        {m.total_amount !== null && m.currency ? (
                          <>
                            {fmtMoney(m.total_amount, m.currency)}
                            <div className="text-xs text-slate-500">
                              {fmtUnitMoney(m.unit_price, m.currency)} / {m.entry_unit}
                            </div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="num">{m.fx_rate ? fmtRate(m.fx_rate) : "—"}</td>
                      <td className="num">
                        {fmtUnitMoney(Number(m.unit_cost_usd) * material.display_factor, "USD")}
                        <div className="text-xs text-slate-500">
                          {fmtUnitMoney(Number(m.unit_cost_try) * material.display_factor, "TRY")} / {material.display_unit}
                        </div>
                      </td>
                      <td className="num">{fmtMoney(m.value_try, "TRY")}</td>
                      <td className="num">{fmtQty(m.balance_qty_after, material.display_factor, material.display_unit, 4)}</td>
                      <td className="text-xs">
                        {m.batch_id ? (
                          <Link className="link" href={`/uretim/${m.batch_id}`}>
                            {batchNo.get(m.batch_id) ?? "Parti"}
                          </Link>
                        ) : null}
                        {m.supplier ? <div>{m.supplier}</div> : null}
                        {m.note ? <Muted>{m.note}</Muted> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      {isAdmin ? (
        <Card title="Malzeme bilgileri">
          <ActionForm action={updateMaterial}>
            <input type="hidden" name="id" value={material.id} />
            <MaterialFields units={allUnits} material={material} />
            <div className="mt-4">
              <SubmitButton>Kaydet</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      ) : null}
    </>
  );
}
