"use client";

import { useState } from "react";
import { ActionForm, FieldError, FormField, SubmitButton } from "@/components/forms";
import { FxRateField } from "@/components/FxRateField";
import type { FxSuggestion } from "@/lib/fx/service";
import { startProduction } from "../uretim/actions";

export function StartProductionForm({
  variantId,
  quantity,
  today,
  disabled,
}: {
  variantId: string;
  quantity: number;
  today: string;
  disabled: boolean;
}) {
  const [fx, setFx] = useState<FxSuggestion | null>(null);
  return (
    <ActionForm
      action={startProduction}
      confirmMessage={`${quantity} adetlik üretim başlatılsın mı? Reçetedeki hammaddeler stoktan düşülecek.`}
    >
      <input type="hidden" name="variant_id" value={variantId} />
      <input type="hidden" name="quantity" value={quantity} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div>
          <FxRateField date={today} canManual onChange={setFx} />
          <FieldError name="fx_rate_id" />
        </div>
        <FormField name="note" label="Not (opsiyonel)">
          <input className="input" name="note" maxLength={500} />
        </FormField>
      </div>
      <div className="mt-3">
        <SubmitButton disabled={disabled || !fx}>Üretimi Başlat</SubmitButton>
      </div>
    </ActionForm>
  );
}
