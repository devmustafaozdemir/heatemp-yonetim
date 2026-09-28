import { FormField } from "@/components/forms";
import type { Product } from "@/lib/types";

/** Ürün formu alanları (oluşturma ve düzenleme). */
export function ProductFields({ product }: { product?: Product }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <FormField name="code" label="Ürün kodu *">
        <input className="input" name="code" defaultValue={product?.code} maxLength={40} required />
      </FormField>
      <FormField name="name" label="Ürün adı *" className="sm:col-span-1 lg:col-span-3">
        <input className="input" name="name" defaultValue={product?.name} maxLength={160} required />
      </FormField>
      <FormField name="description" label="Detay / açıklama" className="sm:col-span-2 lg:col-span-4">
        <textarea className="input" name="description" rows={2} defaultValue={product?.description ?? ""} />
      </FormField>
      <FormField name="default_sale_price" label="Varsayılan satış fiyatı" hint="Boş bırakılabilir">
        <input
          className="input"
          name="default_sale_price"
          inputMode="decimal"
          defaultValue={product?.default_sale_price ?? ""}
        />
      </FormField>
      <FormField name="default_currency" label="Para birimi">
        <select className="input" name="default_currency" defaultValue={product?.default_currency ?? "USD"}>
          <option value="USD">USD</option>
          <option value="TRY">TRY</option>
        </select>
      </FormField>
      <FormField name="unit_production_minutes" label="Birim üretim süresi (dk) *" hint="1 adet için sabit süre">
        <input
          className="input"
          name="unit_production_minutes"
          inputMode="decimal"
          defaultValue={product?.unit_production_minutes ?? 0}
        />
      </FormField>
      <div />
      <FormField name="critical_stock" label="Kritik stok eşiği *">
        <input className="input" name="critical_stock" inputMode="numeric" defaultValue={product?.critical_stock ?? 0} />
      </FormField>
      <FormField name="min_stock" label="Minimum stok eşiği *">
        <input className="input" name="min_stock" inputMode="numeric" defaultValue={product?.min_stock ?? 0} />
      </FormField>
      <FormField name="target_stock" label="Hedef stok *">
        <input className="input" name="target_stock" inputMode="numeric" defaultValue={product?.target_stock ?? 0} />
      </FormField>
      {product ? (
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={product.is_active} /> Aktif
        </label>
      ) : null}
    </div>
  );
}
