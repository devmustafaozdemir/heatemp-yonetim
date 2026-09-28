import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, FormField, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, Muted, PageHeader, TableWrap } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtMinutes, fmtMoney, fmtUnitMoney } from "@/lib/format";
import type { Product, Simulation, VariantView } from "@/lib/types";
import { createVariant, deleteProduct, removeProductImage, updateProduct, uploadProductImage } from "../actions";
import { productImageUrl } from "../image";
import { ProductFields } from "../ProductFields";
import { VariantFields } from "../VariantFields";

export const metadata: Metadata = { title: "Ürün" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireMember();
  const { data: product } = await ctx.supabase.from("products").select("*").eq("id", id).maybeSingle<Product>();
  if (!product) notFound();
  const { data: variants } = await ctx.supabase
    .from("v_variants")
    .select("*")
    .eq("product_id", id)
    .order("variant_name")
    .returns<VariantView[]>();

  // Varyant başına güncel reçete maliyeti (1 adet) — simülasyon fonksiyonuyla, stok düşürmez.
  const costs = await Promise.all(
    (variants ?? []).map(async (v) => {
      const { data } = await ctx.supabase.rpc("simulate_production", { p_variant_id: v.id, p_quantity: 1 });
      return [v.id, data as Simulation | null] as const;
    }),
  );
  const costMap = new Map(costs);
  const isAdmin = ctx.role === "admin";

  return (
    <>
      <PageHeader
        back={{ href: "/urunler", label: "Ürünler" }}
        title={
          <span className="flex items-center gap-2">
            {product.name} <span className="font-mono text-sm font-normal text-slate-500">{product.code}</span>
            {!product.is_active ? <Badge>Pasif</Badge> : null}
          </span>
        }
        description={product.description ?? undefined}
      />

      <Card
        title="Varyantlar ve ürün maliyeti"
        description="Maliyet: reçetedeki malzemelerin güncel ağırlıklı ortalama maliyetiyle 1 adet tahmini (kayıtlı parti maliyeti değildir)."
        padded={false}
        className="mb-6"
      >
        {(variants ?? []).length === 0 ? (
          <div className="p-4">
            <EmptyState title="Varyant yok" />
          </div>
        ) : (
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Varyant</th>
                  <th>Kod</th>
                  <th className="num">Satış fiyatı</th>
                  <th className="num">Birim süre</th>
                  <th className="num">Kritik / Min / Hedef</th>
                  <th className="num">Reçete</th>
                  <th className="num">Tahmini birim maliyet</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {(variants ?? []).map((v) => {
                  const sim = costMap.get(v.id);
                  return (
                    <tr key={v.id}>
                      <td>
                        <Link href={`/urunler/${id}/varyant/${v.id}`} className="link font-medium">
                          {v.variant_name}
                        </Link>
                      </td>
                      <td className="font-mono text-xs">{v.variant_code}</td>
                      <td className="num">
                        {fmtMoney(v.sale_price, v.currency)}
                        {!v.price_overridden ? <Muted> (ürün)</Muted> : null}
                      </td>
                      <td className="num">{fmtMinutes(v.unit_production_minutes)}</td>
                      <td className="num">
                        {v.critical_stock} / {v.min_stock} / {v.target_stock}
                      </td>
                      <td className="num">{sim?.has_bom ? `${sim.lines.length} kalem` : <Badge tone="amber">Yok</Badge>}</td>
                      <td className="num">
                        {sim?.has_bom ? (
                          <>
                            {fmtUnitMoney(sim.unit_cost_usd, "USD")} <Muted>/ {fmtUnitMoney(sim.unit_cost_try, "TRY")}</Muted>
                            {!sim.cost_complete ? <div className="text-xs text-amber-700">Bazı malzemelerin maliyeti yok</div> : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{v.is_active ? <Badge tone="green">Aktif</Badge> : <Badge>Pasif</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      {isAdmin ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card title="Ürün bilgileri" className="xl:col-span-2">
            <ActionForm action={updateProduct}>
              <input type="hidden" name="id" value={product.id} />
              <ProductFields product={product} />
              <div className="mt-4">
                <SubmitButton>Kaydet</SubmitButton>
              </div>
            </ActionForm>
          </Card>

          <div className="space-y-6">
            <Card title="Görsel (opsiyonel)">
              {product.image_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={productImageUrl(product.image_path)} alt={product.name} className="mb-3 max-h-48 rounded border" />
              ) : (
                <p className="mb-3 text-sm text-slate-500">Görsel yok.</p>
              )}
              <ActionForm action={uploadProductImage} resetOnSuccess>
                <input type="hidden" name="id" value={product.id} />
                <FormField name="image" label="PNG / JPEG / WEBP, en fazla 5 MB">
                  <input type="file" name="image" accept="image/png,image/jpeg,image/webp" className="text-sm" />
                </FormField>
                <div className="mt-3 flex gap-2">
                  <SubmitButton size="sm">Yükle</SubmitButton>
                </div>
              </ActionForm>
              {product.image_path ? (
                <ActionForm action={removeProductImage} confirmMessage="Görsel kaldırılsın mı?" className="mt-2">
                  <input type="hidden" name="id" value={product.id} />
                  <SubmitButton size="sm" variant="secondary">
                    Görseli kaldır
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </Card>

            <Card title="Ürünü sil">
              <p className="mb-3 text-sm text-slate-500">
                Yalnızca hiç üretim veya satış kaydı olmayan ürün silinebilir. Aksi hâlde ürünü pasif yapın.
              </p>
              <ActionForm action={deleteProduct} confirmMessage="Ürün ve varyantları kalıcı olarak silinsin mi?">
                <input type="hidden" name="id" value={product.id} />
                <SubmitButton size="sm" variant="danger">
                  Ürünü sil
                </SubmitButton>
              </ActionForm>
            </Card>
          </div>

          <Card title="Yeni varyant" description="Boş bırakılan fiyat, süre ve eşikler ürünün varsayılanlarından gelir." className="xl:col-span-3">
            <ActionForm action={createVariant} resetOnSuccess>
              <input type="hidden" name="product_id" value={product.id} />
              <VariantFields />
              <div className="mt-4">
                <SubmitButton>Varyant ekle</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        </div>
      ) : null}
    </>
  );
}
