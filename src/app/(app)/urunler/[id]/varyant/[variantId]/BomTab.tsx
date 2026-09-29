import { Calculator, Copy, ListTree, PieChart, Plus, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, ButtonLink, Card, DefinitionList, EmptyState, ErrorState, TableWrap } from "@/components/ui";
import type { AuthContext } from "@/lib/auth";
import { fmtInt, fmtMinutes, fmtMoney, fmtNum, fmtQty, fmtUnitMoney, toNumber } from "@/lib/format";
import { load, type Loaded } from "@/lib/query";
import type { BomItem, Unit, VariantView } from "@/lib/types";
import { materialUnitCost, priceMinusEstimate } from "../../../_components/bits";
import { CostShareChart } from "../../../_components/CostShareChart";
import { deleteBomItem, saveBomItem } from "../../../actions";
import { BomLineFields, type BomMaterialOption } from "../../../BomLineForm";
import type { RecipeCostRow } from "../../../_components/types";
import { CopyBomForm, type CopySourceGroup } from "./CopyBomForm";
import type { VariantPageData } from "./types";

/**
 * Reçete kopyalama kaynakları: reçetesi olan (bom_line_count > 0) diğer varyantlar, ürüne göre
 * gruplu; bu ürünün varyantları önce. Boş reçeteli varyant kaynak olamaz (copy_bom hata verir).
 */
async function loadCopySources(ctx: AuthContext, variantId: string, productId: string): Promise<Loaded<CopySourceGroup[]>> {
  const rc = await load(
    ctx.supabase
      .from("v_variant_recipe_cost")
      .select("variant_id, bom_line_count")
      .gt("bom_line_count", 0)
      .neq("variant_id", variantId)
      .returns<Pick<RecipeCostRow, "variant_id" | "bom_line_count">[]>(),
  );
  if (rc.error || !rc.data || rc.data.length === 0) return { data: rc.error ? null : [], error: rc.error, count: null };
  const lines = new Map(rc.data.map((r) => [r.variant_id, r.bom_line_count]));
  const vs = await load(
    ctx.supabase
      .from("v_variants")
      .select("id, product_id, product_name, variant_name, variant_code, display_name, is_active")
      .in("id", [...lines.keys()])
      .order("product_name")
      .order("variant_name")
      .returns<Pick<VariantView, "id" | "product_id" | "product_name" | "variant_name" | "variant_code" | "display_name" | "is_active">[]>(),
  );
  if (vs.error || !vs.data) return { data: null, error: vs.error, count: null };
  const groups = new Map<string, CopySourceGroup>();
  for (const v of vs.data) {
    const key = v.product_id === productId ? "" : v.product_id;
    const g = groups.get(key) ?? { label: v.product_id === productId ? `Bu ürün — ${v.product_name}` : v.product_name, options: [] };
    g.options.push({
      id: v.id,
      displayName: v.display_name,
      label: `${v.variant_name} (${v.variant_code}) · ${fmtInt(lines.get(v.id))} kalem${v.is_active ? "" : " · pasif"}`,
    });
    groups.set(key, g);
  }
  const own = groups.get("");
  groups.delete("");
  return { data: own ? [own, ...groups.values()] : [...groups.values()], error: null, count: null };
}

export async function VariantBomTab({ ctx, data, isAdmin }: { ctx: AuthContext; data: VariantPageData; isAdmin: boolean }) {
  const { product, variant, effective: e, sim } = data;
  const [bom, materials, units, sources] = await Promise.all([
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
    isAdmin ? loadCopySources(ctx, variant.id, product.id) : Promise.resolve({ data: [] as CopySourceGroup[], error: null, count: null }),
  ]);
  const hasSources = (sources.data ?? []).length > 0;
  // Reçete boşken yan sütun (tahmini maliyet, dağılım, miktarlar) gösterilmez: ana kart zaten
  // "reçete yok" diyor; aynı mesajı ikinci kez göstermek yerine ana kart tam genişlik kullanır.
  const showSide = Boolean(data.simError || sim?.has_bom);
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
    <div className={showSide ? "grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]" : "grid grid-cols-1 gap-4"}>
      <div className="grid min-w-0 content-start gap-4">
        <Card
          title="Reçete (BOM) — 1 adet için"
          icon={ListTree}
          description="Miktar seçilen birimle girilir ve malzemenin temel biriminde saklanır (ör. kütlede temel birim gramdır: 0,25 kg → 250 g)."
          padded={false}
          actions={rows.length ? <span className="text-xs text-ink-muted">{fmtInt(rows.length)} kalem</span> : null}
        >
          {bom.error ? (
            <ErrorState message={bom.error} compact />
          ) : rows.length === 0 ? (
            <EmptyState title="Bu varyantın reçetesi yok" compact>
              {!isAdmin
                ? "Yönetici reçete tanımladığında burada görünür."
                : hasSources
                  ? "Aşağıdaki formdan malzeme ekleyin veya reçetesi olan başka bir varyantın reçetesini kopyalayın."
                  : "Aşağıdaki formdan malzeme ekleyin."}
            </EmptyState>
          ) : (
            <>
              <TableWrap className="relative hidden sm:block">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Malzeme</th>
                      <th className="num" title="Girilen miktar; altında temel birimdeki karşılığı">
                        Miktar (1 adet)
                      </th>
                      <th className="num" title="Malzemenin güncel ortalama maliyeti, gösterim birimi başına">
                        Birim maliyet (USD)
                      </th>
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
                            {line ? materialUnitCost(line) : "—"}
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
              <ul className="divide-y divide-line sm:hidden">
                {rows.map((b) => {
                  const line = lineByMaterial.get(b.material_id);
                  const m = materialById.get(b.material_id);
                  const lineUsd = toNumber(line?.line_cost_usd);
                  return (
                    <li key={b.id} className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0 text-[13px]">
                        <div>
                          <span className="font-medium text-ink">{line?.name ?? m?.name ?? "—"}</span>{" "}
                          <span className="code text-ink-muted">{line?.code ?? m?.code}</span>
                        </div>
                        <div className="mt-0.5 text-ink-soft tabular-nums">
                          {fmtNum(b.entry_qty, 4)} {b.entry_unit} · {fmtUnitMoney(line?.line_cost_usd, "USD")}{" "}
                          <span className="text-ink-muted">({fmtUnitMoney(line?.line_cost_try, "TRY")})</span>
                        </div>
                        <div className="text-xs text-ink-muted">
                          {line && line.unit_cost_usd !== null ? materialUnitCost(line) : "Maliyet yok"}
                          {lineUsd !== null && totalUsd > 0 ? ` · pay %${((lineUsd / totalUsd) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}` : ""}
                          {b.note ? ` · ${b.note}` : ""}
                        </div>
                      </div>
                      {isAdmin ? (
                        <ActionForm action={deleteBomItem} confirmMessage="Reçete satırı silinsin mi?">
                          <input type="hidden" name="id" value={b.id} />
                          <SubmitButton size="sm" variant="ghost">
                            <Trash2 aria-hidden />
                            <span className="sr-only">Sil: {line?.name ?? m?.name ?? "reçete satırı"}</span>
                          </SubmitButton>
                        </ActionForm>
                      ) : null}
                    </li>
                  );
                })}
                {sim?.has_bom ? (
                  <li className="flex items-baseline justify-between gap-3 bg-canvas/60 px-4 py-2.5 text-[13px] font-semibold text-ink">
                    <span>Tahmini reçete maliyeti</span>
                    <span className="tabular-nums">
                      {fmtUnitMoney(sim.unit_cost_usd, "USD")} <span className="text-xs font-medium text-ink-muted">({fmtUnitMoney(sim.unit_cost_try, "TRY")})</span>
                    </span>
                  </li>
                ) : null}
              </ul>
            </>
          )}

          {isAdmin ? (
            <div className="border-t border-line bg-canvas/40 p-4">
              <h3 className="mb-0.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                <Plus className="size-4 text-ink-muted" aria-hidden />
                Malzeme ekle / miktarı güncelle
              </h3>
              <p className="mb-3 text-xs text-ink-muted">Reçetede zaten olan malzeme seçilirse miktarı güncellenir.</p>
              {materials.error || units.error ? (
                <ErrorState
                  message={(materials.error ?? units.error) as string}
                  compact
                  title={materials.error ? "Malzeme listesi yüklenemedi" : "Birim listesi yüklenemedi"}
                />
              ) : (units.data ?? []).length === 0 ? (
                <Alert tone="warning">Ölçü birimi tanımı bulunamadı; reçete satırı eklemek için birimler gerekir.</Alert>
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

        {/* Kaynak yoksa (başka hiçbir varyantın reçetesi yok) kart gösterilmez. */}
        {isAdmin && (sources.error || hasSources) ? (
          <Card
            title="Başka varyantın reçetesini kopyala"
            icon={Copy}
            description="Yalnız reçetesi olan varyantlar listelenir. Bu varyantın mevcut reçetesi silinir ve seçilen reçete aynen kopyalanır."
          >
            {sources.error ? (
              <ErrorState message={sources.error} compact title="Kopyalanabilecek reçeteler yüklenemedi" />
            ) : (
              <CopyBomForm variantId={variant.id} groups={sources.data ?? []} />
            )}
          </Card>
        ) : null}
      </div>

      {showSide ? (
        <div className="grid min-w-0 content-start items-start gap-4 md:grid-cols-2 xl:grid-cols-1">
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
            ) : null}
          </Card>

          {sim?.has_bom && share.length > 0 ? (
            <Card title="Maliyet dağılımı" icon={PieChart} description="Reçete satırlarının tahmini maliyeti (USD, 1 adet)">
              <CostShareChart data={share} total={totalUsd} />
            </Card>
          ) : null}

          {sim?.has_bom ? (
            <Card title="Miktarlar (gösterim birimi)" description={`${product.name} — ${variant.name}, 1 adet · temel birim karşılığı altında`}>
              <ul className="space-y-1.5 text-[13px]">
                {sim.lines.map((l) => (
                  <li key={l.material_id} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-ink-soft">{l.name}</span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="font-medium text-ink">{fmtQty(l.qty_per_unit, l.display_factor, l.display_unit, 4)}</span>
                      {l.display_unit !== l.base_unit ? (
                        <span className="block text-xs text-ink-muted">
                          = {fmtNum(l.qty_per_unit, 6)} {l.base_unit}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
