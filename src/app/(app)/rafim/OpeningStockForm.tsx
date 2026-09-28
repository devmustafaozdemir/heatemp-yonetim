"use client";

import { useState } from "react";
import { ActionForm, FieldError, FormField, SubmitButton } from "@/components/forms";
import { FxRateField } from "@/components/FxRateField";
import type { FxSuggestion } from "@/lib/fx/service";
import { recordOpeningStock } from "./actions";

/** Sistem öncesi üretilmiş mamulün açıkça girilmesi (otomatik içe aktarma yoktur). */
export function OpeningStockForm({ variants, today }: { variants: { id: string; display_name: string }[]; today: string }) {
  const [date, setDate] = useState(today);
  const [fx, setFx] = useState<FxSuggestion | null>(null);
  return (
    <ActionForm
      action={recordOpeningStock}
      resetOnSuccess
      confirmMessage="Açılış stoğu Heatemp rafına eklensin mi? Bu işlem hammadde tüketmez ve geri alınamaz."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FormField name="variant_id" label="Ürün / varyant *" className="lg:col-span-2">
          <select className="input" name="variant_id" defaultValue="">
            <option value="">Seçin…</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.display_name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField name="quantity" label="Adet *">
          <input className="input" name="quantity" inputMode="numeric" />
        </FormField>
        <FormField name="stock_date" label="Sayım / açılış tarihi *">
          <input className="input" type="date" name="stock_date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        <FormField name="unit_cost" label="Gerçek birim maliyet *">
          <input className="input" name="unit_cost" inputMode="decimal" />
        </FormField>
        <FormField name="currency" label="Para birimi">
          <select className="input" name="currency" defaultValue="USD">
            <option value="USD">USD</option>
            <option value="TRY">TRY</option>
          </select>
        </FormField>
        <div className="sm:col-span-2">
          <FxRateField date={date} canManual onChange={setFx} />
          <FieldError name="fx_rate_id" />
        </div>
        <FormField name="note" label="Kaynak / açıklama *" className="sm:col-span-2 lg:col-span-4" hint='ör. "Excel sayımı 30.09.2026, Mekonsis rafındaki 40 adet dahil"'>
          <input className="input" name="note" maxLength={500} />
        </FormField>
      </div>
      <div className="mt-3">
        <SubmitButton variant="secondary" disabled={!fx}>
          Açılış stoğunu kaydet
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
