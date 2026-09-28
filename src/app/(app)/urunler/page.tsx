import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, PageHeader, TableWrap } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtInt, fmtMinutes, fmtMoney } from "@/lib/format";
import type { Product } from "@/lib/types";
import { createProduct } from "./actions";
import { ProductFields } from "./ProductFields";
import { productImageUrl } from "./image";

export const metadata: Metadata = { title: "Ürünler ve BOM" };

export default async function ProductsPage() {
  const ctx = await requireMember();
  const [{ data: products, error }, { data: variants }] = await Promise.all([
    ctx.supabase.from("products").select("*").order("name"),
    ctx.supabase.from("product_variants").select("id, product_id"),
  ]);
  if (error) throw new Error("Ürünler yüklenemedi.");
  const counts = new Map<string, number>();
  for (const v of variants ?? []) counts.set(v.product_id, (counts.get(v.product_id) ?? 0) + 1);

  return (
    <>
      <PageHeader
        title="Ürünler ve BOM"
        description="Ürün, varyant, fiyat, birim üretim süresi, stok eşikleri ve varyant bazında bir adetlik hammadde reçetesi."
      />

      {ctx.role === "admin" ? (
        <Card title="Yeni ürün" description="Ürün, “Standart” adlı bir varyantla oluşturulur; varyantları ürün sayfasından ekleyebilirsiniz." className="mb-6">
          <ActionForm action={createProduct} resetOnSuccess>
            <ProductFields />
            <div className="mt-4">
              <SubmitButton>Ürünü oluştur</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      ) : null}

      {(products ?? []).length === 0 ? (
        <EmptyState title="Henüz ürün yok">Yukarıdaki formdan ilk ürünü ekleyin.</EmptyState>
      ) : (
        <Card padded={false}>
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th className="w-12" />
                  <th>Kod</th>
                  <th>Ürün</th>
                  <th className="num">Varyant</th>
                  <th className="num">Varsayılan fiyat</th>
                  <th className="num">Birim süre</th>
                  <th className="num">Kritik / Min / Hedef</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {(products as Product[]).map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.image_path ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={productImageUrl(p.image_path)} alt="" className="size-9 rounded object-cover" />
                      ) : (
                        <div className="size-9 rounded bg-slate-100" />
                      )}
                    </td>
                    <td className="font-mono text-xs">{p.code}</td>
                    <td>
                      <Link href={`/urunler/${p.id}`} className="link font-medium">
                        {p.name}
                      </Link>
                      {p.description ? <div className="text-xs text-slate-500 line-clamp-1">{p.description}</div> : null}
                    </td>
                    <td className="num">{fmtInt(counts.get(p.id) ?? 0)}</td>
                    <td className="num">{fmtMoney(p.default_sale_price, p.default_currency)}</td>
                    <td className="num">{fmtMinutes(p.unit_production_minutes)}</td>
                    <td className="num">
                      {p.critical_stock} / {p.min_stock} / {p.target_stock}
                    </td>
                    <td>{p.is_active ? <Badge tone="green">Aktif</Badge> : <Badge>Pasif</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
    </>
  );
}
