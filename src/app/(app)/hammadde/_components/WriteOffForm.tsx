"use client";

import { useState } from "react";
import { ActionForm, FormField, SubmitButton } from "@/components/forms";
import { Alert, FormSection } from "@/components/ui";
import { fmtMoney, fmtNum } from "@/lib/format";
import { parseDecimal } from "@/lib/parse";
import type { Unit } from "@/lib/types";
import { writeOffMaterial } from "../actions";
import type { MaterialOption } from "./types";

/** Fire / sayım düşümü: ortalama maliyetle stoktan düşer, gerekçe zorunludur. */
export function WriteOffForm({ material, units }: { material: MaterialOption; units: Unit[] }) {
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState(material.display_unit);
  const unitInfo = units.find((u) => u.code === unit) ?? null;
  const q = parseDecimal(qty);
  const qOk = q !== null && !Number.isNaN(q) && q > 0;
  const base = qOk && unitInfo ? q * Number(unitInfo.factor_to_base) : null;
  const tooMuch = base !== null && base > material.qty + 1e-9;
  const avgTryPerBase = material.qty > 0 ? material.value_try / material.qty : null;
  const value = base !== null && avgTryPerBase !== null && !tooMuch ? base * avgTryPerBase : null;
  const after = base !== null && !tooMuch ? (material.qty - base) / material.display_factor : null;
  const empty = material.qty <= 0;

  return (
    <ActionForm
      action={writeOffMaterial}
      confirmMessage={`${material.name} stoğundan ${qty || "?"} ${unit} düşülsün mü? Bu işlem ortalama maliyetle kaydedilir ve geri alınamaz.`}
    >
      <input type="hidden" name="material_id" value={material.id} />
      <div className="grid gap-5">
        {empty ? <Alert tone="warning">Bu malzemenin stoğu yok; düşüm yapılamaz.</Alert> : null}
        <FormSection title="Düşülecek miktar" description={`Mevcut stok: ${fmtNum(material.qty_display, 3)} ${material.display_unit}`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField name="qty" label="Miktar" required>
              <input
                className="input tabular-nums"
                name="qty"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                aria-required
                aria-invalid={tooMuch || undefined}
              />
            </FormField>
            <FormField name="unit" label="Birim" required>
              <select className="input" name="unit" value={unit} onChange={(e) => setUnit(e.target.value)} aria-required>
                {units.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          {tooMuch ? (
            <p className="field-error" role="alert">
              Mevcut stoktan fazla ({fmtNum(material.qty_display, 3)} {material.display_unit}).
            </p>
          ) : null}
        </FormSection>
        <FormSection title="Gerekçe" description="Sayım farkı, hasar, kalite reddi gibi nedeni yazın; hareket geçmişinde görünür.">
          <FormField name="reason" label="Gerekçe" required>
            <textarea
              className="input min-h-[4.5rem]"
              name="reason"
              rows={2}
              maxLength={500}
              placeholder="ör. sayım farkı, hasarlı parça"
              aria-required
            />
          </FormField>
        </FormSection>
        <dl className="grid grid-cols-2 divide-x divide-line rounded-md border border-line bg-canvas/60">
          <div className="min-w-0 px-3 py-2.5">
            <dt className="text-xs text-ink-muted">Düşülecek değer (ort. maliyetle)</dt>
            <dd className="mt-0.5 text-[15px] font-semibold text-ink tabular-nums">{value !== null ? fmtMoney(value, "TRY") : "—"}</dd>
          </div>
          <div className="min-w-0 px-3 py-2.5">
            <dt className="text-xs text-ink-muted">Düşüm sonrası stok</dt>
            <dd className="mt-0.5 text-[15px] font-semibold text-ink tabular-nums">
              {after !== null ? `${fmtNum(after, 3)} ${material.display_unit}` : "—"}
            </dd>
          </div>
        </dl>
        <div className="flex justify-end border-t border-line pt-4">
          <SubmitButton variant="danger" disabled={empty || tooMuch}>
            Stoktan düş
          </SubmitButton>
        </div>
      </div>
    </ActionForm>
  );
}
