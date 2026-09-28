"use client";

import { useState } from "react";
import { ActionForm, FormField, SubmitButton } from "@/components/forms";
import { fmtInt, fmtMoney } from "@/lib/format";
import type { Currency } from "@/lib/types";
import { saveQuoteItem } from "../actions";

export interface QuoteVariantOption {
  id: string;
  display_name: string;
  sale_price: number | null;
  currency: Currency;
  mekonsis_qty: number;
}

export function QuoteItemForm({ quoteId, currency, variants }: { quoteId: string; currency: Currency; variants: QuoteVariantOption[] }) {
  const [variantId, setVariantId] = useState("");
  const v = variants.find((x) => x.id === variantId);
  return (
    <ActionForm action={saveQuoteItem} resetOnSuccess onSuccess={() => setVariantId("")}>
      <input type="hidden" name="quote_id" value={quoteId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[3fr_1fr_1fr]">
        <FormField
          name="variant_id"
          label="Varyant *"
          hint={v ? `Liste fiyatı ${fmtMoney(v.sale_price, v.currency)} · Mekonsis'te ${fmtInt(v.mekonsis_qty)} adet` : "Aynı varyant tekrar eklenirse satır güncellenir"}
        >
          <select className="input" name="variant_id" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
            <option value="">Seçin…</option>
            {variants.map((x) => (
              <option key={x.id} value={x.id}>
                {x.display_name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField name="quantity" label="Adet *">
          <input className="input" name="quantity" inputMode="numeric" />
        </FormField>
        <FormField name="unit_price" label={`Özel birim fiyat (${currency}) *`}>
          <input className="input" name="unit_price" inputMode="decimal" />
        </FormField>
      </div>
      <div className="mt-3">
        <SubmitButton size="sm">Kalemi kaydet</SubmitButton>
      </div>
    </ActionForm>
  );
}
