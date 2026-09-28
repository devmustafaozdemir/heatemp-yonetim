"use client";

import { Info, Play } from "lucide-react";
import { useState } from "react";
import { ActionForm, FieldError, FormField, SubmitButton } from "@/components/forms";
import { FxRateField } from "@/components/FxRateField";
import type { FxSuggestion } from "@/lib/fx/service";
import { startProduction } from "../uretim/actions";

/**
 * Üretimi başlatma formu. `blockedReason` doluysa düğme kilitlidir ve neden
 * düğmenin altında açıkça yazılır; geçerli işlem kuru yoksa da başlatılamaz.
 */
export function StartProductionForm({
  variantId,
  quantity,
  today,
  blockedReason,
}: {
  variantId: string;
  quantity: number;
  today: string;
  blockedReason: string | null;
}) {
  const [fx, setFx] = useState<FxSuggestion | null>(null);
  const reason = blockedReason ?? (!fx ? "Geçerli bir işlem kuru olmadan üretim başlatılamaz. Kuru güncelleyin veya manuel kur girin." : null);
  return (
    <ActionForm
      action={startProduction}
      confirmMessage={`${quantity} adetlik üretim başlatılsın mı? Reçetedeki hammaddeler stoktan düşülecek.`}
    >
      <input type="hidden" name="variant_id" value={variantId} />
      <input type="hidden" name="quantity" value={quantity} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <FxRateField date={today} canManual onChange={setFx} />
          <FieldError name="fx_rate_id" />
        </div>
        <FormField name="note" label="Not" hint="İsteğe bağlı; partiye kaydedilir (en fazla 500 karakter).">
          <input className="input" name="note" maxLength={500} />
        </FormField>
      </div>
      <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
        <SubmitButton disabled={!!reason}>
          <Play aria-hidden />
          Üretimi Başlat
        </SubmitButton>
        {reason ? (
          <p className="flex items-start gap-1.5 text-xs text-ink-muted" id="start-blocked">
            <Info className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>{reason}</span>
          </p>
        ) : (
          <p className="text-xs text-ink-muted">
            {quantity.toLocaleString("tr-TR")} adet için reçetedeki malzemeler ortalama maliyetle stoktan düşer; maliyet ve kur partiye sabitlenir.
          </p>
        )}
      </div>
    </ActionForm>
  );
}
