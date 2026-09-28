import { Calculator, Copy, ListTree, PieChart, Plus, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, ButtonLink, Card, DefinitionList, EmptyState, ErrorState, TableWrap } from "@/components/ui";
import type { AuthContext } from "@/lib/auth";
import { fmtInt, fmtMinutes, fmtMoney, fmtNum, fmtQty, fmtUnitMoney, toNumber } from "@/lib/format";
import { load } from "@/lib/query";
import type { BomItem, Unit } from "@/lib/types";
import { priceMinusEstimate } from "../../../_components/bits";
import { CostShareChart } from "../../../_components/CostShareChart";
import { copyBom, deleteBomItem, saveBomItem } from "../../../actions";
import { BomLineFields, type BomMaterialOption } from "../../../BomLineForm";
import type { VariantPageData } from "./types";

export async function VariantBomTab({ ctx, data, isAdmin }: { ctx: AuthContext; data: VariantPageData; isAdmin: boolean }) {
  const { product, variant, effective: e, sim } = data;
  const [bom, materials, units, siblings] = await Promise.all([
    load(ctx.supabase.from("bom_items").select("*").eq("variant_id", variant.id).returns<BomItem[]>()),
    isAdmin
      ? load(
          ctx.supabase
            .from("raw_materials")
            .select("id, code, name, unit_kind, display_unit")
            .eq("is_active", true)
            .order("name")
            .returns<BomMaterialOption[]>(),
        )
      : Promise.resolve({ data: [] as BomMaterialOption[], error: null, count: null }),
    isAdmin
      ? load(ctx.supabase.from("units").select("*").order("sort_order").returns<Unit[]>())
      : Promise.resolve({ data: [] as Unit[], error: null, count: null }),
    isAdmin
      ? load(ctx.supabase.from("v_variants").select("id, display_name").neq("id", variant.id).order("display_name").returns<{ id: string; display_name: string }[]>())
      : Promise.resolve({ data: [] as { id: string; display_name: string }[], error: null, count: null }),
  ]);
  const lineByMaterial = new Map((sim?.lines ?? []).map((l) => [l.material_id, l]));
  const materialById = new Map((materials.data ?? []).map((m) => [m.id, m]));
  const rows = bom.data ?? [];
  const totalUsd = toNumber(sim?.unit_cost_usd) ?? 0;
  const share = (sim?.lines ?? [])
    .filter((l) => toNumber(l.line_cost_usd) !== null)
    .map((l) => ({ key: l.material_id, label: l.name, value: Number(l.line_cost_usd) }))
    .sort((a, b) => b.value - a.value);
  const margin = sim?.has_bom
    ? priceMinusEstimate(e.sale_price, e.currency, { bom_line_count: sim.lines.length, est_unit_cost_usd: sim.unit_cost_usd, est_unit_cost_try: sim.unit_cost_try })
    : null;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid min-w-0 content-start gap-4">
        <Card
          title="Reçete (BOM) — 1 adet için"
          icon={ListTree}
          description="Girilen miktar, malzemenin temel birimine çevrilerek saklanır (ör. 250 g = 0,25 kg)."
          padded={false}
          actions={rows.length ? <span className="text-xs text-ink-muted">{fmtInt(rows.length)} kalem</span> : null}
        >
          {bom.error ? (
            <ErrorState message={bom.error} compact />
          ) : rows.length === 0 ? (
            <EmptyState title="Bu varyantın reçetesi yok" compact>
              {isAdmin ? "Aşağıdaki formdan malzeme ekleyin veya başka bir varyantın reçetesini kopyalayın." : "Yönetici reçete tanımladığında burada görünür."}
            </EmptyState>
          ) : (
            <TableWrap className="relative">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Malzeme</th>
                    <th className="num" title="Girilen miktar; altında temel birimdeki karşılığı">
                      Miktar (1 adet)
                    </th>
                    <th className="num">Birim maliyet (USD)</th>
                    <th className="num">Satır maliyeti</th>
                    <th className="num" title="Tahmini reçete maliyeti içindeki pay">
                      Pay
                    </th>
                    {isAdmin ? <th aria-label="İşlemler" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => {
                    const line = lineByMaterial.get(b.material_id);
                    const m = materialById.get(b.material_id);
                    const lineUsd = toNumber(line?.line_cost_usd);
                    return (
                      <tr key={b.id}>
                        <td className="min-w-48">
                          <span className="font-medium text-ink">{line?.name ?? m?.name ?? "—"}</span>{" "}
                          <span className="code text-ink-muted">{line?.code ?? m?.code}</span>
                          <div className="text-xs text-ink-muted">
                            {line ? (line.kind === "component" ? "Komponent" : "Hammadde") : null}
                            {b.note ? ` · ${b.note}` : null}
                          </div>
                        </td>
                        <td className="num">
                          {fmtNum(b.entry_qty, 4)} {b.entry_unit}
                          {line && line.base_unit !== b.entry_unit ? (
                            <div className="text-xs text-ink-muted">
                              = {fmtNum(b.qty_per_unit, 6)} {line.base_unit}
                            </div>
                          ) : null}
                        </td>
                        <td className="num">
                          {line && line.unit_cost_usd !== null ? `${fmtUnitMoney(line.unit_cost_usd, "USD")} / ${line.base_unit}` : "—"}
                          {line?.cost_basis === "last_purchase" ? <div className="text-xs text-ink-muted">son alış (stok yok)</div> : null}
                          {line?.cost_basis === "none" ? <div className="text-xs text-amber-700">maliyet yok</div> : null}
                        </td>
                        <td className="num">
                          {fmtUnitMoney(line?.line_cost_usd, "USD")}
                          <div className="text-xs text-ink-muted">{fmtUnitMoney(line?.line_cost_try, "TRY")}</div>
                        </td>
                        <td className="num">
                          {lineUsd !== null && totalUsd > 0
                            ? `%${((lineUsd / totalUsd) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`
                            : "—"}
                        </td>
                        {isAdmin ? (
                          <td className="text-right">
                            <ActionForm action={deleteBomItem} confirmMessage="Reçete satırı silinsin mi?">
                              <input type="hidden" name="id" value={b.id} />
                              <SubmitButton size="sm" variant="ghost">
                                <Trash2 aria-hidden />
                                <span className="sr-only">Sil: {line?.name ?? m?.name ?? "reçete satırı"}</span>
                              </SubmitButton>
                            </ActionForm>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
                {sim?.has_bom ? (
                  <tfoot>
                    <tr>
                      <td colSpan={3}>Tahmini reçete maliyeti (1 adet)</td>
                      <td className="num">
                        {fmtUnitMoney(sim.unit_cost_usd, "USD")}
                        <div className="text-xs font-medium text-ink-muted">{fmtUnitMoney(sim.unit_cost_try, "TRY")}</div>
                      </td>
                      <td className="num">%100</td>
                      {isAdmin ? <td /> : null}
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </TableWrap>
          )}

          {isAdmin ? (
            <div className="border-t border-line bg-canvas/40 p-4">
              <h3 className="mb-0.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                <Plus className="size-4 text-ink-muted" aria-hidden />
                Malzeme ekle / miktarı güncelle
              </h3>
              <p className="mb-3 text-xs text-ink-muted">Reçetede zaten olan malzeme seçilirse miktarı güncellenir.</p>
              {materials.error ? (
                <ErrorState message={materials.error} compact />
              ) : (materials.data ?? []).length === 0 ? (
                <Alert tone="info">Önce Hammadde ekranından malzeme tanımlayın.</Alert>
              ) : (
                <ActionForm action={saveBomItem} resetOnSuccess>
                  <input type="hidden" name="variant_id" value={variant.id} />
                  <BomLineFields materials={materials.data ?? []} units={units.data ?? []} />
                  <div className="mt-3 flex justify-end">
                    <SubmitButton>Reçeteye kaydet</SubmitButton>
                  </div>
                </ActionForm>
              )}
            </div>
          ) : null}
        </Card>

        {isAdmin && (siblings.data ?? []).length > 0 ? (
          <Card title="Başka varyantın reçetesini kopyala" icon={Copy} description="Bu varyantın mevcut reçetesi silinir ve seçilen varyantın reçetesi aynen kopyalanır.">
            <ActionForm
              action={copyBom}
              confirmMessage="Bu varyantın mevcut reçetesi silinip seçilen varyantın reçetesi kopyalanacak. Devam edilsin mi?"
              className="flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="variant_id" value={variant.id} />
              <label className="block min-w-0 flex-1 basis-64">
                <span className="label">Kaynak varyant</span>
                <select className="input" name="from_variant_id" defaultValue="">
                  <option value="">Seçin…</option>
                  {(siblings.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <SubmitButton variant="secondary">Kopyala</SubmitButton>
            </ActionForm>
          </Card>
        ) : null}
      </div>

      <div className="grid min-w-0 content-start gap-4">
        <Card title="Tahmini reçete maliyeti" description="Güncel hareketli ağırlıklı ortalama malzeme maliyetiyle, 1 adet">
          {data.simError ? (
            <ErrorState message={data.simError} compact />
          ) : sim?.has_bom ? (
            <>
              <p className="text-2xl font-semibold text-ink tabular-nums">{fmtUnitMoney(sim.unit_cost_usd, "USD")}</p>
              <p className="mb-3 text-xs text-ink-muted">TL karşılığı (kayıt değeri): {fmtUnitMoney(sim.unit_cost_try, "TRY")}</p>
              <DefinitionList
                columns={1}
                items={[
                  ["Tanımlı satış fiyatı", fmtMoney(e.sale_price, e.currency)],
                  ["Fiyat − tahmini maliyet", margin ? fmtUnitMoney(margin.diff, e.currency) : "—"],
                  ["Birim üretim süresi", fmtMinutes(e.unit_production_minutes)],
                  ["Mevcut hammaddeyle üretilebilir", `${fmtInt(sim.max_producible)} adet`],
                ]}
              />
              {!sim.cost_complete ? (
                <Alert tone="warning" className="mt-3">
                  Bazı malzemelerin henüz alış kaydı olmadığı için maliyet eksik hesaplandı.
                </Alert>
              ) : null}
              <p className="mt-3 text-xs text-ink-muted">
                Gerçekleşmiş parti maliyeti değildir; gerçek maliyet üretim başlatıldığında partiye sabitlenir.
              </p>
              <ButtonLink href={`/simulasyon?varyant=${variant.id}&adet=1`} variant="secondary" size="sm" className="mt-3">
                <Calculator aria-hidden />
                Simülasyonda aç
              </ButtonLink>
            </>
          ) : (
            <EmptyState title="Reçete boş" compact>
              Malzeme eklendiğinde tahmini maliyet burada hesaplanır.
            </EmptyState>
          )}
        </Card>

        {sim?.has_bom && share.length > 0 ? (
          <Card title="Maliyet dağılımı" icon={PieChart} description="Reçete satırlarının tahmini maliyeti (USD, 1 adet)">
            <CostShareChart data={share} total={totalUsd} />
          </Card>
        ) : null}

        {sim?.has_bom ? (
          <Card title="Temel miktarlar" description={`${product.name} — ${variant.name}, 1 adet`}>
            <ul className="space-y-1.5 text-[13px]">
              {sim.lines.map((l) => (
                <li key={l.material_id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-ink-soft">{l.name}</span>
                  <span className="shrink-0 font-medium text-ink tabular-nums">{fmtQty(l.qty_per_unit, l.display_factor, l.display_unit, 4)}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
