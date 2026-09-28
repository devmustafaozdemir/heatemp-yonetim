"use client";

import { useState } from "react";
import { ActionForm, FormField, SubmitButton } from "@/components/forms";
import { fmtDate, fmtInt } from "@/lib/format";
import { deliverToMekonsis } from "./actions";

export interface DeliverOption {
  variant_id: string;
  display_name: string;
  available: number;
  batches: { batch_id: string; batch_no: string; qty: number; completed_on: string }[];
}

export function DeliverForm({ options, today, initialVariant }: { options: DeliverOption[]; today: string; initialVariant?: string }) {
  const [variantId, setVariantId] = useState(initialVariant ?? options[0]?.variant_id ?? "");
  const [batchId, setBatchId] = useState("");
  const option = options.find((o) => o.variant_id === variantId);
  const batch = option?.batches.find((b) => b.batch_id === batchId);
  const max = batch ? batch.qty : (option?.available ?? 0);

  return (
    <ActionForm action={deliverToMekonsis} resetOnSuccess>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_2fr_1fr_1fr]">
        <FormField name="variant_id" label="Ürün / varyant *">
          <select
            className="input"
            name="variant_id"
            value={variantId}
            onChange={(e) => {
              setVariantId(e.target.value);
              setBatchId("");
            }}
          >
            {options.map((o) => (
              <option key={o.variant_id} value={o.variant_id}>
                {o.display_name} — rafta {fmtInt(o.available)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField name="batch_id" label="Parti" hint="Boş = en eski partiden başlayarak (FIFO)">
          <select className="input" name="batch_id" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">Otomatik (FIFO)</option>
            {option?.batches.map((b) => (
              <option key={b.batch_id} value={b.batch_id}>
                {b.batch_no} — {fmtInt(b.qty)} adet ({fmtDate(b.completed_on)})
              </option>
            ))}
          </select>
        </FormField>
        <FormField name="quantity" label={`Adet * (en fazla ${fmtInt(max)})`}>
          <input className="input" name="quantity" inputMode="numeric" />
        </FormField>
        <FormField name="delivered_on" label="Teslimat tarihi *">
          <input className="input" type="date" name="delivered_on" defaultValue={today} max={today} />
        </FormField>
        <FormField name="note" label="Not" className="sm:col-span-2 lg:col-span-4">
          <input className="input" name="note" maxLength={500} />
        </FormField>
      </div>
      <div className="mt-3">
        <SubmitButton disabled={!variantId}>Mekonsis&apos;e teslim et</SubmitButton>
      </div>
    </ActionForm>
  );
}
