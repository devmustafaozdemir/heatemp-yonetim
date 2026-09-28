"use client";

import { useState } from "react";
import { ActionForm, FieldError, FormField, SubmitButton } from "@/components/forms";
import { FxRateField } from "@/components/FxRateField";
import type { FxSuggestion } from "@/lib/fx/service";
import { convertQuote } from "../actions";

export function ConvertForm({ quoteId, today, disabled }: { quoteId: string; today: string; disabled: boolean }) {
  const [date, setDate] = useState(today);
  const [fx, setFx] = useState<FxSuggestion | null>(null);
  return (
    <ActionForm
      action={convertQuote}
      confirmMessage="Teklif satışa dönüştürülsün mü? Güncel Mekonsis stoğu yeniden kontrol edilir ve ürünler FIFO ile düşülür."
    >
      <input type="hidden" name="quote_id" value={quoteId} />
      <div className="space-y-3">
        <FormField name="sold_on" label="Satış tarihi *">
          <input className="input" type="date" name="sold_on" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        <div>
          <FxRateField date={date} canManual onChange={setFx} />
          <FieldError name="fx_rate_id" />
        </div>
      </div>
      <div className="mt-3">
        <SubmitButton disabled={disabled || !fx}>Satışa Dönüştür</SubmitButton>
      </div>
    </ActionForm>
  );
}
