import { ArrowRight, Layers, ListTree, Pencil, SlidersHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Badge, Card, DefinitionList, ErrorState } from "@/components/ui";
import type { AuthContext } from "@/lib/auth";
import { fmtInt, fmtMinutes, fmtMoney, fmtUnitMoney } from "@/lib/format";
import { load } from "@/lib/query";
import type { VariantView } from "@/lib/types";
import { SourceTag, priceMinusEstimate } from "../../../_components/bits";
import { deleteVariant, updateVariant } from "../../../actions";
import { VariantFields } from "../../../VariantFields";
import type { VariantPageData } from "./types";

export async function VariantGeneralTab({ ctx, data, isAdmin }: { ctx: AuthContext; data: VariantPageData; isAdmin: boolean }) {
  const { product, variant, effective: e, sim } = data;
  const siblings = await load(
    ctx.supabase
      .from("v_variants")
      .select("id, variant_name, variant_code, is_active")
      .eq("product_id", product.id)
      .neq("id", variant.id)
      .order("variant_name")
      .returns<Pick<VariantView, "id" | "variant_name" | "variant_code" | "is_active">[]>(),
  );
  const margin = sim?.has_bom
    ? priceMinusEstimate(e.sale_price, e.currency, { bom_line_count: sim.lines.length, est_unit_cost_usd: sim.unit_cost_usd, est_unit_cost_try: sim.unit_cost_try })
    : null;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        {isAdmin ? (
          <Card title="Varyant bilgileri" icon={Pencil} description="Boş bırakılan fiyat, süre ve eşikler ürünün varsayılanından gelir (miras).">
            <ActionForm action={updateVariant}>
              <input type="hidden" name="id" value={variant.id} />
              <VariantFields variant={variant} defaults={product} />
              <div className="mt-5 flex justify-end border-t border-line pt-4">
                <SubmitButton>Değişiklikleri kaydet</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        ) : (
          <Card title="Varyant bilgileri">
            <DefinitionList
              items={[
                ["Varyant kodu", <span key="c" className="code">{variant.code}</span>],
                ["Varyant adı / detay", variant.name],
                ["Ürün", <Link key="p" href={`/urunler/${product.id}`} className="link">{product.name}</Link>],
                ["Durum", e.is_active ? <Badge key="s" tone="green">Aktif</Badge> : <Badge key="s">Pasif</Badge>],
              ]}
            />
          </Card>
        )}
      </div>

      <div className="grid min-w-0 content-start gap-4">
        <Card title="Geçerli değerler" icon={SlidersHorizontal} description="Varyantın kullandığı değerler ve kaynağı">
          <DefinitionList
            columns={1}
            items={[
              [
                "Tanımlı satış fiyatı",
                <span key="p" className="inline-flex items-center gap-1.5">
                  {fmtMoney(e.sale_price, e.currency)} <SourceTag overridden={e.price_overridden} />
                </span>,
              ],
              [
                "Birim üretim süresi",
                <span key="m" className="inline-flex items-center gap-1.5">
                  {fmtMinutes(e.unit_production_minutes)} <SourceTag overridden={e.minutes_overridden} />
                </span>,
              ],
              [
                "Kritik / min / hedef",
                <span key="t" className="inline-flex items-center gap-1.5">
                  {fmtInt(e.critical_stock)} / {fmtInt(e.min_stock)} / {fmtInt(e.target_stock)} <SourceTag overridden={e.thresholds_overridden} />
                </span>,
              ],
            ]}
          />
        </Card>

        <Card
          title="Reçete özeti"
          icon={ListTree}
          footer={
            <Link href={`/urunler/${product.id}/varyant/${variant.id}?sekme=bom`} className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
              {isAdmin ? "Reçeteyi düzenle" : "Reçete ayrıntısı"}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          }
        >
          {data.simError ? (
            <ErrorState message={data.simError} compact />
          ) : sim?.has_bom ? (
            <>
              <DefinitionList
                columns={1}
                items={[
                  ["Reçete kalemi", `${fmtInt(sim.lines.length)} malzeme`],
                  ["Tahmini reçete maliyeti", `${fmtUnitMoney(sim.unit_cost_usd, "USD")} · ${fmtUnitMoney(sim.unit_cost_try, "TRY")}`],
                  ["Fiyat − tahmini maliyet", margin ? fmtUnitMoney(margin.diff, e.currency) : "—"],
                  ["Mevcut hammaddeyle üretilebilir", `${fmtInt(sim.max_producible)} adet`],
                ]}
              />
              {!sim.cost_complete ? (
                <Alert tone="warning" className="mt-3">
                  Bazı malzemelerin alış kaydı olmadığı için maliyet eksik.
                </Alert>
              ) : null}
            </>
          ) : (
            <Alert tone="warning">Bu varyantın reçetesi yok. Tahmini maliyet ve üretim simülasyonu için reçete tanımlayın.</Alert>
          )}
        </Card>

        <Card title="Diğer varyantlar" icon={Layers} padded={false}>
          {siblings.error ? (
            <ErrorState message={siblings.error} compact />
          ) : (siblings.data ?? []).length === 0 ? (
            <p className="px-4 py-3 text-[13px] text-ink-muted">Bu ürünün başka varyantı yok.</p>
          ) : (
            <ul className="divide-y divide-line">
              {(siblings.data ?? []).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/urunler/${product.id}/varyant/${s.id}`} className="link break-words">
                      {s.variant_name}
                    </Link>
                    <div className="code text-ink-muted">{s.variant_code}</div>
                  </div>
                  {!s.is_active ? <Badge>Pasif</Badge> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {isAdmin ? (
          <Card title="Varyantı sil" icon={Trash2}>
            <p className="mb-3 text-[13px] text-ink-muted">
              Üretim, stok veya satış kaydı olan varyant silinemez; pasif yapın. Ürünün son varyantı silinemez.
            </p>
            <ActionForm action={deleteVariant} confirmMessage="Varyant ve reçetesi silinsin mi?">
              <input type="hidden" name="id" value={variant.id} />
              <input type="hidden" name="product_id" value={product.id} />
              <SubmitButton size="sm" variant="danger">
                Varyantı sil
              </SubmitButton>
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
