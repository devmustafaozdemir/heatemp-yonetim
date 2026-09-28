"use client";

import { useState } from "react";
import { ActionForm, FieldError, FormField, SubmitButton } from "@/components/forms";
import { FxRateField } from "@/components/FxRateField";
import { Alert, Button, FormSection } from "@/components/ui";
import { useDialog } from "@/components/ui/dialog";
import type { FxSuggestion } from "@/lib/fx/service";
import { fmtInt, fmtMoney } from "@/lib/format";
import { parseDecimal, parseInteger } from "@/lib/parse";
import { recordOpeningStock } from "./actions";

/** Pozitif sayı değilse null (sunucuyla aynı ayrıştırma: "1.234,56" = "1234.56"). */
function positive(n: number | null): number | null {
  return n !== null && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Sistem öncesi üretilmiş mamulün açıkça girilmesi (otomatik içe aktarma yoktur).
 * Hammadde tüketmez, üretim sayılmaz; "Açılış stoğu" partisi olarak Heatemp rafına girer.
 */
export function OpeningStockForm({ variants, today }: { variants: { id: string; display_name: string }[]; today: string }) {
  const dialog = useDialog();
  const [date, setDate] = useState(today);
  const [fx, setFx] = useState<FxSuggestion | null>(null);
  const [qtyText, setQtyText] = useState("");
  const [costText, setCostText] = useState("");
  const [currency, setCurrency] = useState<"USD" | "TRY">("USD");

  const qty = positive(parseInteger(qtyText));
  const unit = positive(parseDecimal(costText));
  const total = qty && unit ? qty * unit : null;
  const totalTry = total !== null && fx ? (currency === "USD" ? total * fx.rate : total) : null;
  const totalUsd = total !== null && fx ? (currency === "USD" ? total : total / fx.rate) : null;

  return (
    <ActionForm
      action={recordOpeningStock}
      confirmMessage="Açılış stoğu Heatemp rafına eklensin mi? Bu işlem hammadde tüketmez ve geri alınamaz."
    >
      <div className="space-y-5">
        <Alert tone="warning" title="Yalnız sistem öncesi stok için">
          Uygulamaya geçerken eldeki mamulü gerçek birim maliyetiyle bir kez girin. Üretim sayılmaz, hammadde tüketmez ve maliyet
          karşılaştırmasına katılmaz. Mekonsis&apos;te duran mevcut stok için önce burada açılış girip ardından aynı tarihli
          teslimat kaydedin. Excel&apos;den otomatik aktarım yapılmaz.
        </Alert>

        <FormSection title="Ürün ve miktar">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField name="variant_id" label="Ürün / varyant" required className="sm:col-span-2">
              <select className="input" name="variant_id" defaultValue="" required aria-required>
                <option value="">Seçin…</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.display_name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField name="quantity" label="Adet" required>
              <input
                className="input"
                name="quantity"
                inputMode="numeric"
                autoComplete="off"
                required
                aria-required
                value={qtyText}
                onChange={(e) => setQtyText(e.target.value)}
              />
            </FormField>
            <FormField name="stock_date" label="Sayım / açılış tarihi" required>
              <input
                className="input"
                type="date"
                name="stock_date"
                value={date}
                max={today}
                required
                aria-required
                onChange={(e) => setDate(e.target.value)}
              />
            </FormField>
          </div>
        </FormSection>

        <FormSection title="Gerçek birim maliyet" description="Kur, açılış tarihine göre sabitlenir; TL ve USD değerleri bu kurla kaydedilir.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField name="unit_cost" label="Birim maliyet" required>
              <input
                className="input"
                name="unit_cost"
                inputMode="decimal"
                autoComplete="off"
                required
                aria-required
                value={costText}
                onChange={(e) => setCostText(e.target.value)}
              />
            </FormField>
            <FormField name="currency" label="Para birimi">
              <select className="input" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value as "USD" | "TRY")}>
                <option value="USD">USD</option>
                <option value="TRY">TRY</option>
              </select>
            </FormField>
            <div className="min-w-0 sm:col-span-2">
              <FxRateField date={date} canManual onChange={setFx} />
              <FieldError name="fx_rate_id" />
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-2 rounded-md border border-line bg-canvas/60 px-3 py-2.5 text-[13px] sm:grid-cols-2">
            <div className="flex items-baseline justify-between gap-3 sm:block">
              <dt className="text-xs text-ink-muted">Raf maliyet değeri (TL)</dt>
              <dd className="font-semibold text-ink tabular-nums">{totalTry !== null ? fmtMoney(totalTry, "TRY") : "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 sm:block">
              <dt className="text-xs text-ink-muted">USD karşılığı (bilgi)</dt>
              <dd className="font-semibold text-ink tabular-nums">
                {totalUsd !== null ? fmtMoney(totalUsd, "USD") : "—"}
                {qty ? <span className="ml-1 text-xs font-normal text-ink-muted">· {fmtInt(qty)} adet</span> : null}
              </dd>
            </div>
          </dl>
        </FormSection>

        <FormSection title="Kaynak">
          <FormField name="note" label="Kaynak / açıklama" required hint='ör. "Excel sayımı 30.09.2026, Mekonsis rafındaki 40 adet dahil"'>
            <input className="input" name="note" maxLength={500} required aria-required />
          </FormField>
        </FormSection>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        {dialog ? (
          <Button type="button" variant="secondary" onClick={dialog.close}>
            Vazgeç
          </Button>
        ) : null}
        <SubmitButton disabled={!fx}>Açılış stoğunu kaydet</SubmitButton>
      </div>
    </ActionForm>
  );
}
