import { AlertTriangle, ListTree, Pencil, Plus } from "lucide-react";
import { Alert, Badge, ButtonLink, Card, EmptyState, ErrorState, TableWrap } from "@/components/ui";
import type { AuthContext } from "@/lib/auth";
import { toUserMessage } from "@/lib/errors";
import { fmtInt, fmtNum, fmtQty, fmtUnitMoney } from "@/lib/format";
import { load } from "@/lib/query";
import type { BomItem, Product, Simulation, VariantView } from "@/lib/types";

/** Ürünün tüm varyantlarının reçete özeti; düzenleme varyant sayfasında yapılır. */
export async function BomTab({ ctx, product, variants, isAdmin }: { ctx: AuthContext; product: Product; variants: VariantView[]; isAdmin: boolean }) {
  const ids = variants.map((v) => v.id);
  const [bom, sims] = await Promise.all([
    load(ctx.supabase.from("bom_items").select("*").in("variant_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).returns<BomItem[]>()),
    Promise.all(
      variants.map(async (v) => {
        const { data, error } = await ctx.supabase.rpc("simulate_production", { p_variant_id: v.id, p_quantity: 1 });
        return [v.id, { sim: error ? null : (data as Simulation), error: error ? toUserMessage(error) : null }] as const;
      }),
    ),
  ]);
  const simById = new Map(sims);
  const entryByKey = new Map((bom.data ?? []).map((b) => [`${b.variant_id}:${b.material_id}`, b]));
  const withoutBom = variants.filter((v) => {
    const r = simById.get(v.id);
    return r?.sim && !r.sim.has_bom;
  });
  const withBom = variants.filter((v) => !withoutBom.includes(v));

  return (
    <div className="grid gap-4">
      <Alert tone="info">
        <strong>Tahmini reçete maliyeti</strong>, reçetedeki malzemelerin güncel hareketli ağırlıklı ortalama maliyetiyle 1 adet için
        hesaplanır; stokta olmayan malzemede son alış maliyeti kullanılır. Gerçekleşmiş parti maliyeti değildir — o, üretim başlatıldığında
        partiye sabitlenir (Maliyet sekmesi).
      </Alert>
      {bom.error ? <ErrorState message={bom.error} compact /> : null}
                </div>
                <ButtonLink href={`/urunler/${product.id}/varyant/${v.id}?sekme=bom`} size="sm" variant={isAdmin ? "soft" : "secondary"}>
                  {isAdmin ? <Plus aria-hidden /> : null}
                  {isAdmin ? "Reçete tanımla" : "Varyantı aç"}
                </ButtonLink>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        {withBom.map((v) => {
          const r = simById.get(v.id);
          const sim = r?.sim ?? null;
          const href = `/urunler/${product.id}/varyant/${v.id}?sekme=bom`;
          return (
            <Card
              key={v.id}
              icon={ListTree}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {v.variant_name} <span className="code font-normal text-ink-muted">{v.variant_code}</span>
                  {!v.is_active ? <Badge>Pasif</Badge> : null}
                </span>
              }
              description={
                sim?.has_bom
                  ? `${fmtInt(sim.lines.length)} kalem · tahmini reçete maliyeti ${fmtUnitMoney(sim.unit_cost_usd, "USD")} (${fmtUnitMoney(sim.unit_cost_try, "TRY")})`
                  : "Reçete tanımlı değil"
              }
              actions={
                <ButtonLink href={href} size="sm" variant={isAdmin ? "soft" : "secondary"}>
                  {isAdmin ? <Pencil aria-hidden /> : null}
                  {isAdmin ? "Reçeteyi düzenle" : "Reçete ayrıntısı"}
                </ButtonLink>
              }
              padded={false}
            >
              {r?.error ? (
                <ErrorState message={r.error} compact />
              ) : !sim?.has_bom ? (
                <EmptyState title="Bu varyantın reçetesi yok" compact>
                  Reçete olmadan tahmini maliyet hesaplanamaz ve simülasyon yapılamaz.
                </EmptyState>
              ) : (
                <>
                  <TableWrap className="relative">
                    <table className="table-base">
                      <thead>
                        <tr>
                          <th>Malzeme</th>
                          <th className="num">1 adet için</th>
                          <th className="num">Birim maliyet (USD)</th>
                          <th className="num">Satır maliyeti (USD)</th>
                          <th className="num">Satır maliyeti (TL)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sim.lines.map((l) => {
                          const entry = entryByKey.get(`${v.id}:${l.material_id}`);
                          return (
                            <tr key={l.material_id}>
                              <td className="min-w-44">
                                <span className="font-medium text-ink">{l.name}</span> <span className="code text-ink-muted">{l.code}</span>
                                <div className="text-xs text-ink-muted">{l.kind === "component" ? "Komponent" : "Hammadde"}</div>
                              </td>
                              <td className="num">
                                {entry ? `${fmtNum(entry.entry_qty, 4)} ${entry.entry_unit}` : fmtQty(l.qty_per_unit, l.display_factor, l.display_unit, 4)}
                              </td>
                              <td className="num">
                                {l.unit_cost_usd === null ? "—" : `${fmtUnitMoney(l.unit_cost_usd, "USD")} / ${l.base_unit}`}
                                {l.cost_basis === "last_purchase" ? <div className="text-xs text-ink-muted">son alış (stok yok)</div> : null}
                              </td>
                              <td className="num">{fmtUnitMoney(l.line_cost_usd, "USD")}</td>
                              <td className="num">{fmtUnitMoney(l.line_cost_try, "TRY")}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={3}>Tahmini reçete maliyeti (1 adet)</td>
                          <td className="num">{fmtUnitMoney(sim.unit_cost_usd, "USD")}</td>
                          <td className="num">{fmtUnitMoney(sim.unit_cost_try, "TRY")}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </TableWrap>
                  {!sim.cost_complete ? (
                    <div className="border-t border-line p-3">
                      <Alert tone="warning">Bazı malzemelerin henüz alış kaydı olmadığı için maliyet eksik hesaplandı.</Alert>
                    </div>
                  ) : null}
                </>
              )}
            </Card>
          );
        })}
      </div>
      {withoutBom.length > 0 ? (
        <Card
          title="Reçetesi olmayan varyantlar"
          icon={AlertTriangle}
          description="Reçete olmadan tahmini maliyet hesaplanamaz ve üretim simülasyonu yapılamaz."
          padded={false}
          actions={<span className="text-xs text-ink-muted">{fmtInt(withoutBom.length)} varyant</span>}
        >
          <ul className="divide-y divide-line">
            {withoutBom.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5">
                <div className="min-w-0">
                  <span className="font-medium text-ink">{v.variant_name}</span> <span className="code text-ink-muted">{v.variant_code}</span>
                  {!v.is_active ? (
                    <span className="ml-2">
                      <Badge>Pasif</Badge>
                    </span>
                  ) : null}
    </div>
  );
}
