import { FormField } from "@/components/forms";
import { FormSection } from "@/components/ui";
import type { Product } from "@/lib/types";

/** Ürün formu alanları (oluşturma ve düzenleme), mantıksal gruplar halinde. */
export function ProductFields({ product }: { product?: Product }) {
  return (
    <div className="grid gap-5">
      <FormSection
        title="Kimlik"
        description={product ? "Ürün kodu benzersizdir; varyant kodları varyant sayfasından değiştirilir." : "Ürün kodu benzersizdir. İlk varyant “Standart” adıyla ve ürün koduyla oluşturulur."}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <FormField name="code" label="Ürün kodu" required>
            <input className="input" name="code" defaultValue={product?.code} maxLength={40} required aria-required autoComplete="off" />
          </FormField>
          <FormField name="name" label="Ürün adı" required>
            <input className="input" name="name" defaultValue={product?.name} maxLength={160} required aria-required autoComplete="off" />
          </FormField>
          <FormField name="description" label="Detay / açıklama" className="sm:col-span-2">
            <textarea className="input" name="description" rows={2} maxLength={2000} defaultValue={product?.description ?? ""} />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Fiyat ve üretim süresi" description="Varyantlar kendi değerini girmezse bu varsayılanları kullanır.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField name="default_sale_price" label="Varsayılan satış fiyatı" hint="Boş bırakılabilir">
            <input className="input" name="default_sale_price" inputMode="decimal" defaultValue={product?.default_sale_price ?? ""} />
          </FormField>
          <FormField name="default_currency" label="Para birimi">
            <select className="input" name="default_currency" defaultValue={product?.default_currency ?? "USD"}>
              <option value="USD">USD</option>
              <option value="TRY">TRY</option>
            </select>
          </FormField>
          <FormField name="unit_production_minutes" label="Birim üretim süresi (dk)" hint="1 adet için sabit süre" required>
            <input
              className="input"
              name="unit_production_minutes"
              inputMode="decimal"
              required
              aria-required
              defaultValue={product?.unit_production_minutes ?? 0}
            />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Stok eşikleri" description="Kritik ≤ minimum ≤ hedef. Varyantın toplam stoğu (Heatemp + Mekonsis) bu eşiklerle karşılaştırılır.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField name="critical_stock" label="Kritik stok eşiği" required>
            <input className="input" name="critical_stock" inputMode="numeric" required aria-required defaultValue={product?.critical_stock ?? 0} />
          </FormField>
          <FormField name="min_stock" label="Minimum stok eşiği" required>
            <input className="input" name="min_stock" inputMode="numeric" required aria-required defaultValue={product?.min_stock ?? 0} />
          </FormField>
          <FormField name="target_stock" label="Hedef stok" required>
            <input className="input" name="target_stock" inputMode="numeric" required aria-required defaultValue={product?.target_stock ?? 0} />
          </FormField>
        </div>
      </FormSection>

      {product ? (
        <FormSection title="Durum">
          <label className="flex items-start gap-2 text-[13px] text-ink-soft">
            <input type="checkbox" name="is_active" defaultChecked={product.is_active} className="mt-0.5 size-4 accent-brand-600" />
            <span>
              <span className="font-medium text-ink">Aktif</span>
              <span className="block text-xs text-ink-muted">Pasif ürünün tüm varyantları pasif sayılır; geçmiş üretim, stok ve satış kayıtları korunur.</span>
            </span>
          </label>
        </FormSection>
      ) : null}
    </div>
  );
}
