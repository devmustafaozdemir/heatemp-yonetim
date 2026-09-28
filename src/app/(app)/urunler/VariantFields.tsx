"use client";

import { useState } from "react";
import { FormField } from "@/components/forms";
import { FormSection } from "@/components/ui";
import { fmtMinutes, fmtMoney } from "@/lib/format";
import type { Product, ProductVariant } from "@/lib/types";

export type VariantDefaults = Pick<
  Product,
  "default_sale_price" | "default_currency" | "unit_production_minutes" | "critical_stock" | "min_stock" | "target_stock"
>;

/** Varyant alanları. Boş bırakılan fiyat, süre ve eşikler ürünün varsayılanını kullanır (miras). */
export function VariantFields({ variant, defaults }: { variant?: ProductVariant; defaults?: VariantDefaults }) {
  const [override, setOverride] = useState(variant?.critical_stock !== null && variant?.critical_stock !== undefined);
  const priceHint = defaults
    ? `Boş = ürün fiyatı (${defaults.default_sale_price === null ? "tanımsız" : fmtMoney(defaults.default_sale_price, defaults.default_currency)})`
    : "Boş = ürün fiyatı";
  const minutesHint = defaults ? `Boş = ürün süresi (${fmtMinutes(defaults.unit_production_minutes)})` : "Boş = ürün süresi";

  return (
    <div className="grid gap-5">
      <FormSection title="Kimlik">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <FormField name="code" label="Varyant kodu" required>
            <input className="input" name="code" defaultValue={variant?.code} maxLength={40} required aria-required autoComplete="off" />
          </FormField>
          <FormField name="name" label="Varyant adı / detay" hint="ör. NTC10K, 2000 W, 220 V" required>
            <input className="input" name="name" defaultValue={variant?.name} maxLength={160} required aria-required autoComplete="off" />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Fiyat ve üretim süresi" description="Yalnızca bu varyant farklıysa doldurun.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField name="sale_price" label="Satış fiyatı" hint={priceHint}>
            <input className="input" name="sale_price" inputMode="decimal" defaultValue={variant?.sale_price ?? ""} />
          </FormField>
          <FormField name="currency" label="Para birimi" hint="Fiyat girilirse kullanılır">
            <select className="input" name="currency" defaultValue={variant?.currency ?? defaults?.default_currency ?? "USD"}>
              <option value="USD">USD</option>
              <option value="TRY">TRY</option>
            </select>
          </FormField>
          <FormField name="unit_production_minutes" label="Birim üretim süresi (dk)" hint={minutesHint}>
            <input className="input" name="unit_production_minutes" inputMode="decimal" defaultValue={variant?.unit_production_minutes ?? ""} />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Stok eşikleri">
        <label className="mb-3 flex items-start gap-2 text-[13px] text-ink-soft">
          <input
            type="checkbox"
            name="override_thresholds"
            checked={override}
            onChange={(e) => setOverride(e.target.checked)}
            className="mt-0.5 size-4 accent-brand-600"
          />
          <span>
            <span className="font-medium text-ink">Bu varyanta özel stok eşikleri</span>
            <span className="block text-xs text-ink-muted">
              {defaults
                ? `İşaretli değilse ürün eşikleri kullanılır: kritik ${defaults.critical_stock}, minimum ${defaults.min_stock}, hedef ${defaults.target_stock}.`
                : "İşaretli değilse ürün eşikleri kullanılır."}
            </span>
          </span>
        </label>
        {override ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField name="critical_stock" label="Kritik stok" required>
              <input className="input" name="critical_stock" inputMode="numeric" required aria-required defaultValue={variant?.critical_stock ?? defaults?.critical_stock ?? 0} />
            </FormField>
            <FormField name="min_stock" label="Minimum stok" required>
              <input className="input" name="min_stock" inputMode="numeric" required aria-required defaultValue={variant?.min_stock ?? defaults?.min_stock ?? 0} />
            </FormField>
            <FormField name="target_stock" label="Hedef stok" required>
              <input className="input" name="target_stock" inputMode="numeric" required aria-required defaultValue={variant?.target_stock ?? defaults?.target_stock ?? 0} />
            </FormField>
          </div>
        ) : null}
      </FormSection>

      {variant ? (
        <FormSection title="Durum">
          <label className="flex items-start gap-2 text-[13px] text-ink-soft">
            <input type="checkbox" name="is_active" defaultChecked={variant.is_active} className="mt-0.5 size-4 accent-brand-600" />
            <span>
              <span className="font-medium text-ink">Aktif</span>
              <span className="block text-xs text-ink-muted">Pasif varyant geçmiş kayıtlarıyla korunur.</span>
            </span>
          </label>
        </FormSection>
      ) : null}
    </div>
  );
}
