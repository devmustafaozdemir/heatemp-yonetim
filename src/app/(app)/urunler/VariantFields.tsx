"use client";

import { useState } from "react";
import { FormField } from "@/components/forms";
import type { ProductVariant } from "@/lib/types";

/** Varyant alanları. Boş bırakılan değerler ürünün varsayılanını kullanır. */
export function VariantFields({ variant }: { variant?: ProductVariant }) {
  const [override, setOverride] = useState(variant?.critical_stock !== null && variant?.critical_stock !== undefined);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <FormField name="code" label="Varyant kodu *">
        <input className="input" name="code" defaultValue={variant?.code} maxLength={40} required />
      </FormField>
      <FormField name="name" label="Varyant adı / detay *" className="lg:col-span-3" hint="ör. 2000 W, 220 V, beyaz">
        <input className="input" name="name" defaultValue={variant?.name} maxLength={160} required />
      </FormField>
      <FormField name="sale_price" label="Satış fiyatı" hint="Boş = ürün fiyatı">
        <input className="input" name="sale_price" inputMode="decimal" defaultValue={variant?.sale_price ?? ""} />
      </FormField>
      <FormField name="currency" label="Para birimi">
        <select className="input" name="currency" defaultValue={variant?.currency ?? "USD"}>
          <option value="USD">USD</option>
          <option value="TRY">TRY</option>
        </select>
      </FormField>
      <FormField name="unit_production_minutes" label="Birim üretim süresi (dk)" hint="Boş = ürün süresi">
        <input
          className="input"
          name="unit_production_minutes"
          inputMode="decimal"
          defaultValue={variant?.unit_production_minutes ?? ""}
        />
      </FormField>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input
          type="checkbox"
          name="override_thresholds"
          checked={override}
          onChange={(e) => setOverride(e.target.checked)}
        />
        Bu varyanta özel stok eşikleri
      </label>
      {override ? (
        <>
          <FormField name="critical_stock" label="Kritik stok">
            <input className="input" name="critical_stock" inputMode="numeric" defaultValue={variant?.critical_stock ?? 0} />
          </FormField>
          <FormField name="min_stock" label="Minimum stok">
            <input className="input" name="min_stock" inputMode="numeric" defaultValue={variant?.min_stock ?? 0} />
          </FormField>
          <FormField name="target_stock" label="Hedef stok">
            <input className="input" name="target_stock" inputMode="numeric" defaultValue={variant?.target_stock ?? 0} />
          </FormField>
        </>
      ) : null}
      {variant ? (
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={variant.is_active} /> Aktif
        </label>
      ) : null}
    </div>
  );
}
