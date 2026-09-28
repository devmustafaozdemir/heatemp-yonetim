"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ActionForm, FieldError, FormField, SubmitButton, useFieldError } from "@/components/forms";
import { FxRateField } from "@/components/FxRateField";
import { Alert, Button } from "@/components/ui";
import { fmtInt, fmtMoney } from "@/lib/format";
import type { FxSuggestion } from "@/lib/fx/service";
import { parseDecimal } from "@/lib/parse";
import type { Currency } from "@/lib/types";
import { recordSale } from "./actions";

export interface SaleVariantOption {
  variant_id: string;
  display_name: string;
  available: number;
  sale_price: number | null;
  currency: Currency;
}

interface Row {
  key: number;
  variant_id: string;
  quantity: string;
  unit_price: string;
}

function RowError({ index }: { index: number }) {
  const e = useFieldError(`items.${index}`);
  return e ? <div className="text-xs text-red-600">{e}</div> : null;
}

export function SaleForm({
  variants,
  customers,
  today,
}: {
  variants: SaleVariantOption[];
  customers: { id: string; name: string }[];
  today: string;
}) {
  const [date, setDate] = useState(today);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [fx, setFx] = useState<FxSuggestion | null>(null);
  const [rows, setRows] = useState<Row[]>([{ key: 1, variant_id: "", quantity: "", unit_price: "" }]);
  const byId = new Map(variants.map((v) => [v.variant_id, v]));

  function update(key: number, patch: Partial<Row>) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if (patch.variant_id !== undefined && !r.unit_price) {
          const v = byId.get(patch.variant_id);
          if (v?.sale_price && v.currency === currency) next.unit_price = String(v.sale_price).replace(".", ",");
        }
        return next;
      }),
    );
  }

  const lines = rows.map((r) => {
    const q = parseDecimal(r.quantity);
    const p = parseDecimal(r.unit_price);
    const total = q && p && !Number.isNaN(q) && !Number.isNaN(p) ? q * p : null;
    const v = byId.get(r.variant_id);
    return { ...r, total, over: v && q ? q > v.available : false, v };
  });
  const total = lines.reduce((s, l) => s + (l.total ?? 0), 0);
  const totalTry = fx ? (currency === "TRY" ? total : total * fx.rate) : null;
  const anyOver = lines.some((l) => l.over);

  return (
    <ActionForm action={recordSale} confirmMessage="Satış kaydedilsin mi? Ürünler Mekonsis rafından FIFO ile düşülecek.">
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(rows.map((r) => ({ variant_id: r.variant_id, quantity: r.quantity, unit_price: r.unit_price })))}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FormField name="sold_on" label="Satış tarihi *">
          <input className="input" type="date" name="sold_on" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        <FormField name="currency" label="Para birimi *">
          <select className="input" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            <option value="USD">USD</option>
            <option value="TRY">TRY</option>
          </select>
        </FormField>
        <div className="sm:col-span-2">
          <FxRateField date={date} canManual onChange={setFx} />
          <FieldError name="fx_rate_id" />
        </div>
        <FormField name="customer_id" label="Kurumsal müşteri (opsiyonel)">
          <select className="input" name="customer_id" defaultValue="">
            <option value="">— Perakende / belirtilmedi —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField name="note" label="Açıklama" className="sm:col-span-1 lg:col-span-3">
          <input className="input" name="note" maxLength={1000} />
        </FormField>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Kalemler</h3>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setRows((rs) => [...rs, { key: Math.max(...rs.map((r) => r.key)) + 1, variant_id: "", quantity: "", unit_price: "" }])}
          >
            <Plus className="size-3.5" /> Satır ekle
          </Button>
        </div>
        <FieldError name="items" />
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={l.key} className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 p-2 sm:grid-cols-[3fr_1fr_1fr_1fr_auto] sm:items-end">
              <label className="block">
                <span className="label">Varyant</span>
                <select className="input" value={l.variant_id} onChange={(e) => update(l.key, { variant_id: e.target.value })}>
                  <option value="">Seçin…</option>
                  {variants.map((v) => (
                    <option key={v.variant_id} value={v.variant_id}>
                      {v.display_name} — Mekonsis&apos;te {fmtInt(v.available)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">Adet</span>
                <input className="input" inputMode="numeric" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
              </label>
              <label className="block">
                <span className="label">Gerçek birim fiyat ({currency})</span>
                <input className="input" inputMode="decimal" value={l.unit_price} onChange={(e) => update(l.key, { unit_price: e.target.value })} />
              </label>
              <div className="pb-2 text-right text-sm tabular-nums">
                {l.total !== null ? fmtMoney(l.total, currency) : "—"}
                {l.v?.sale_price ? (
                  <div className="text-xs text-slate-500">liste: {fmtMoney(l.v.sale_price, l.v.currency)}</div>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Satırı sil"
                disabled={rows.length === 1}
                onClick={() => setRows((rs) => rs.filter((r) => r.key !== l.key))}
              >
                <Trash2 className="size-4" />
              </Button>
              {l.over ? (
                <div className="text-xs font-medium text-red-700 sm:col-span-5">
                  Mekonsis rafında yalnızca {fmtInt(l.v?.available)} adet var.
                </div>
              ) : null}
              <div className="sm:col-span-5">
                <RowError index={i} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
        <div>
          Toplam satış tutarı: <strong>{fmtMoney(total, currency)}</strong>
          {fx && currency === "USD" ? <span className="text-slate-500"> · TL karşılığı (önizleme) {fmtMoney(totalTry, "TRY")}</span> : null}
        </div>
        <div className="text-xs text-slate-500">
          Kesin ciro, FIFO maliyeti ve brüt kâr kayıt sırasında veritabanında hesaplanır.
        </div>
      </div>
      {anyOver ? (
        <div className="mt-3">
          <Alert tone="error">Bazı satırlarda Mekonsis stoğu yetersiz. Kayıt reddedilecektir.</Alert>
        </div>
      ) : null}
      <div className="mt-4">
        <SubmitButton disabled={!fx || anyOver}>Satışı kaydet</SubmitButton>
      </div>
    </ActionForm>
  );
}
