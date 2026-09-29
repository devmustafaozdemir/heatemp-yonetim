"use client";

import { Info, Loader2, Play } from "lucide-react";
import { useId, useState } from "react";
import { ActionForm, FieldError, FormField, useFormPending } from "@/components/forms";
import { FxRateField } from "@/components/FxRateField";
import { Button } from "@/components/ui";
import type { FxSuggestion } from "@/lib/fx/service";
import { startProduction } from "../uretim/actions";

/**
 * Üretimi başlatma formu. `blockedReason` doluysa düğme kilitlidir ve neden
 * düğmenin altında açıkça yazılır (aria-describedby ile düğmeye bağlı); geçerli
 * işlem kuru yoksa da başlatılamaz.
 *
 * `initialFx`: sayfanın sunucuda okuduğu geçerli bugünkü kur. Kur alanı kendi
 * sorgusunu bitirene kadar düğme bu kurla etkin kalır ve form bu kuru gönderir;
 * böylece düğme ilk açılışta gereksiz yere kilitli görünmez.
 */
export function StartProductionForm({
  variantId,
  quantity,
  today,
  blockedReason,
  initialFx,
}: {
  variantId: string;
  quantity: number;
  today: string;
  blockedReason: string | null;
  initialFx: FxSuggestion | null;
}) {
  const [fx, setFx] = useState<FxSuggestion | null>(initialFx);
  // Kur alanı ilk sonucunu bildirene kadar sunucudaki kur gizli alanla gönderilir;
  // bildirdikten sonra alan kendi gizli girdisini yazar (çift değer oluşmaz).
  const [fieldReady, setFieldReady] = useState(false);
  const reasonId = useId();
  const reason =
    blockedReason ?? (!fx ? "Geçerli bir işlem kuru olmadan üretim başlatılamaz. Kuru güncelleyin veya manuel kur girin." : null);
  return (
    <ActionForm
      action={startProduction}
      confirmMessage={`${quantity.toLocaleString("tr-TR")} adetlik üretim başlatılsın mı? Reçetedeki hammaddeler stoktan düşülecek.`}
    >
      <input type="hidden" name="variant_id" value={variantId} />
      <input type="hidden" name="quantity" value={quantity} />
      {!fieldReady && fx ? <input type="hidden" name="fx_rate_id" value={fx.id} /> : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="min-w-0">
          <FxRateField
            date={today}
            canManual
            onChange={(next) => {
              setFx(next);
              setFieldReady(true);
            }}
          />
          <FieldError name="fx_rate_id" />
        </div>
        <FormField name="note" label="Not" hint="İsteğe bağlı; partiye kaydedilir (en fazla 500 karakter).">
          <input className="input" name="note" maxLength={500} />
        </FormField>
      </div>
      <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
        <StartButton disabled={!!reason} describedBy={reason ? reasonId : undefined} />
        {reason ? (
          <p className="flex items-start gap-1.5 text-xs text-ink-muted" id={reasonId}>
            <Info className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>{reason}</span>
          </p>
        ) : (
          <p className="text-xs text-ink-muted">
            {quantity.toLocaleString("tr-TR")} adet için reçetedeki malzemeler ortalama maliyetle stoktan düşer; maliyet ve kur partiye
            sabitlenir.
          </p>
        )}
      </div>
    </ActionForm>
  );
}

/** SubmitButton ile aynı davranış (bekleme durumu, çift gönderim engeli) + kilit nedenine bağlı açıklama. */
function StartButton({ disabled, describedBy }: { disabled: boolean; describedBy?: string }) {
  const pending = useFormPending();
  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending} aria-describedby={describedBy}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          Kaydediliyor…
        </>
      ) : (
        <>
          <Play aria-hidden />
          Üretimi Başlat
        </>
      )}
    </Button>
  );
}
