"use client";

import { useState } from "react";
import { ActionForm, FieldError, FormField, SubmitButton } from "@/components/forms";
import { FxRateField } from "@/components/FxRateField";
import { fmtMoney } from "@/lib/format";
import type { FxSuggestion } from "@/lib/fx/service";
import { parseDecimal } from "@/lib/parse";
import type { Unit } from "@/lib/types";
import { receiveMaterial } from "./actions";

/** Hammadde alışı: miktar + birim + birim fiyat (USD/TRY) + işlem günü kuru. */
export function ReceiveForm({
  materialId,
  units,
  defaultUnit,
  today,
}: {
  materialId: string;
  units: Unit[];
  defaultUnit: string;
  today: string;
}) {
  const [date, setDate] = useState(today);
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<"USD" | "TRY">("USD");
  const [fx, setFx] = useState<FxSuggestion | null>(null);

  const q = parseDecimal(qty);
  const p = parseDecimal(price);
  const total = q && p && !Number.isNaN(q) && !Number.isNaN(p) ? q * p : null;
  const totalTry = total !== null && fx ? (currency === "TRY" ? total : total * fx.rate) : null;
  const totalUsd = total !== null && fx ? (currency === "USD" ? total : total / fx.rate) : null;

  return (
    <ActionForm action={receiveMaterial} resetOnSuccess onSuccess={() => { setQty(""); setPrice(""); }}>
      <input type="hidden" name="material_id" value={materialId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FormField name="qty" label="Miktar *">
          <input className="input" name="qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </FormField>
        <FormField name="unit" label="Birim *">
          <select className="input" name="unit" defaultValue={defaultUnit}>
            {units.map((u) => (
              <option key={u.code} value={u.code}>
                {u.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField name="unit_price" label="Birim fiyat (seçilen birim başına) *">
          <input className="input" name="unit_price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </FormField>
        <FormField name="currency" label="Para birimi *">
          <select className="input" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value as "USD" | "TRY")}>
            <option value="USD">USD</option>
            <option value="TRY">TRY</option>
          </select>
        </FormField>
        <FormField name="received_on" label="Alış tarihi *">
          <input className="input" type="date" name="received_on" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        <div className="sm:col-span-1 lg:col-span-2">
          <FxRateField date={date} canManual onChange={setFx} />
          <FieldError name="fx_rate_id" />
        </div>
        <FormField name="supplier" label="Tedarikçi">
          <input className="input" name="supplier" maxLength={160} />
        </FormField>
        <FormField name="note" label="Not" className="sm:col-span-2 lg:col-span-4">
          <input className="input" name="note" maxLength={500} />
        </FormField>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <SubmitButton disabled={!fx}>Alışı kaydet</SubmitButton>
        {total !== null ? (
          <span className="text-sm text-slate-600">
            Toplam: <strong>{fmtMoney(total, currency)}</strong>
            {fx ? (
              <>
                {" "}· TL karşılığı {fmtMoney(totalTry, "TRY")} · USD {fmtMoney(totalUsd, "USD")}
              </>
            ) : null}
          </span>
        ) : null}
      </div>
    </ActionForm>
  );
}
