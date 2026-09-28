import { ArrowRight, ImageIcon, Layers, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { ActionForm, FormField, SubmitButton } from "@/components/forms";
import { StockStatusBadge } from "@/components/StockStatus";
import { Badge, Card, DefinitionList, EmptyState, ErrorState } from "@/components/ui";
import type { AuthContext } from "@/lib/auth";
import { fmtDate, fmtInt, fmtMinutes, fmtMoney } from "@/lib/format";
import { load } from "@/lib/query";
import type { Product, VariantOverview, VariantView } from "@/lib/types";
import { deleteProduct, removeProductImage, updateProduct, uploadProductImage } from "../actions";
import { productImageUrl } from "../image";
import { ProductFields } from "../ProductFields";

export async function GeneralTab({
  ctx,
  product,
  variants,
  isAdmin,
}: {
  ctx: AuthContext;
  product: Product;
  variants: VariantView[];
  isAdmin: boolean;
}) {
  const overview = await load(
    ctx.supabase
      .from("v_variant_overview")
      .select("variant_id, stock_status, critical_stock, min_stock, target_stock, total_remaining")
      .eq("product_id", product.id)
      .returns<Pick<VariantOverview, "variant_id" | "stock_status" | "critical_stock" | "min_stock" | "target_stock" | "total_remaining">[]>(),
  );
  const stockById = new Map((overview.data ?? []).map((o) => [o.variant_id, o]));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        {isAdmin ? (
          <Card title="Ürün bilgileri" icon={Pencil} description="Fiyat, süre ve eşikler, kendi değeri olmayan varyantlara miras kalır.">
            <ActionForm action={updateProduct}>
              <input type="hidden" name="id" value={product.id} />
              <ProductFields product={product} />
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <p className="text-xs text-ink-muted">Oluşturulma: {fmtDate(product.created_at)}</p>
                <SubmitButton>Değişiklikleri kaydet</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        ) : (
          <Card title="Ürün bilgileri">
            <DefinitionList
              items={[
                ["Ürün kodu", <span key="c" className="code">{product.code}</span>],
                ["Ürün adı", product.name],
                ["Varsayılan satış fiyatı", fmtMoney(product.default_sale_price, product.default_currency)],
                ["Birim üretim süresi", fmtMinutes(product.unit_production_minutes)],
                ["Kritik stok eşiği", fmtInt(product.critical_stock)],
                ["Minimum stok eşiği", fmtInt(product.min_stock)],
                ["Hedef stok", fmtInt(product.target_stock)],
                ["Durum", product.is_active ? <Badge key="s" tone="green">Aktif</Badge> : <Badge key="s">Pasif</Badge>],
                ["Oluşturulma", fmtDate(product.created_at)],
              ]}
            />
            {product.description ? <p className="mt-4 text-[13px] whitespace-pre-line text-ink-soft">{product.description}</p> : null}
          </Card>
        )}
      </div>

      <div className="grid min-w-0 content-start gap-4">
        <Card title="Görsel" icon={ImageIcon}>
          {product.image_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={productImageUrl(product.image_path)}
              alt={product.name}
              className="mb-3 max-h-56 w-full rounded-md border border-line bg-canvas object-contain"
            />
          ) : (
            <div className="mb-3 flex h-32 flex-col items-center justify-center rounded-md border border-dashed border-line-strong bg-canvas text-center">
              <ImageIcon className="mb-1.5 size-6 text-ink-muted/70" aria-hidden />
              <p className="text-xs text-ink-muted">Görsel yüklenmemiş</p>
            </div>
          )}
          {isAdmin ? (
            <>
              <ActionForm action={uploadProductImage} resetOnSuccess>
                <input type="hidden" name="id" value={product.id} />
                <FormField name="image" label={product.image_path ? "Görseli değiştir" : "Görsel seç"} hint="PNG, JPEG veya WEBP · en fazla 5 MB">
                  <input
                    type="file"
                    name="image"
                    accept="image/png,image/jpeg,image/webp"
                    className="block w-full text-[13px] text-ink-soft file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink-soft hover:file:bg-canvas"
                  />
                </FormField>
                <div className="mt-3 flex flex-wrap gap-2">
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
            </>
          ) : null}
        </Card>

        <Card
          title="Varyantlar"
          icon={Layers}
          padded={false}
          footer={
            <Link href={`/urunler/${product.id}?sekme=varyantlar`} className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
              Varyant tablosunu aç
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          }
        >
          {overview.error ? <ErrorState message={overview.error} compact /> : null}
          {variants.length === 0 ? (
            <EmptyState title="Varyant yok" compact />
          ) : (
            <ul className="divide-y divide-line">
              {variants.map((v) => {
                const st = stockById.get(v.id);
                return (
                  <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <Link href={`/urunler/${product.id}/varyant/${v.id}`} className="link break-words">
                        {v.variant_name}
                      </Link>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                        <span className="code">{v.variant_code}</span>
                        {!v.is_active ? <Badge>Pasif</Badge> : null}
                      </div>
                    </div>
                    {st ? (
                      <div className="shrink-0 text-right">
                        <StockStatusBadge row={st} />
                        <div className="mt-0.5 text-xs text-ink-muted tabular-nums">{fmtInt(st.total_remaining)} adet</div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {isAdmin ? (
          <Card title="Ürünü sil" icon={Trash2}>
            <p className="mb-3 text-[13px] text-ink-muted">
              Yalnızca hiç üretim, stok veya satış kaydı olmayan ürün silinebilir. Aksi hâlde ürünü pasif yapın.
            </p>
            <ActionForm action={deleteProduct} confirmMessage="Ürün ve varyantları kalıcı olarak silinsin mi?">
              <input type="hidden" name="id" value={product.id} />
              <SubmitButton size="sm" variant="danger">
                Ürünü sil
              </SubmitButton>
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
