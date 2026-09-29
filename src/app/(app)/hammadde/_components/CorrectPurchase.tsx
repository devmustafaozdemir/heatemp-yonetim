"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { FxRateField } from "@/components/FxRateField";
import { ActionForm, FormActions, FormField, SubmitButton } from "@/components/forms";
import { Alert, FormSection } from "@/components/ui";
import { Drawer, Modal } from "@/components/ui/dialog";
import { fmtMoney, fmtNum } from "@/lib/format";
import type { Unit } from "@/lib/types";
import { correctPurchase, deleteMovement } from "../actions";

export interface CorrectablePurchase {
  id: number;
  movement_date: string;
  entry_qty: number | null;
  entry_unit: string | null;
  unit_price: number | null;
  currency: "USD" | "TRY" | null;
  total_amount: number | null;
  supplier: string | null;
  note: string | null;
}

const trDate = (iso: string) => iso.split("-").reverse().join(".");

/** Alış kaydını yerinde düzenleme paneli; stok ve ortalama maliyet yeniden hesaplanır. */
export function CorrectPurchase({
  movement,
  units,
  today,
  compact = false,
}: {
  movement: CorrectablePurchase;
  units: Unit[];
  today: string;
  /** Tabloda yalnız ikonlu düğme */
  compact?: boolean;
}) {
  const [date, setDate] = useState(movement.movement_date);
  const [qty, setQty] = useState(String(movement.entry_qty ?? ""));
  const [price, setPrice] = useState(String(movement.unit_price ?? ""));
  const [currency, setCurrency] = useState<string>(movement.currency ?? "USD");
  const total = Number(qty.replace(",", ".")) * Number(price.replace(",", "."));

  return (
    <Drawer
      trigger={
        <>
          <Pencil aria-hidden />
          {compact ? null : "Düzenle"}
        </>
      }
      triggerVariant={compact ? "ghost" : "secondary"}
      triggerSize="sm"
      triggerLabel={compact ? "Alışı düzenle" : undefined}
      title="Alışı düzenle"
      description={`${trDate(movement.movement_date)} tarihli alış · ${fmtNum(movement.entry_qty, 4)} ${movement.entry_unit ?? ""} × ${movement.unit_price ?? ""} ${movement.currency ?? ""}`}
      size="md"
    >
      <ActionForm action={correctPurchase} className="space-y-4">
        <input type="hidden" name="movement_id" value={movement.id} />
        <Alert tone="info">Alış kaydı yerinde güncellenir; stok ve ağırlıklı ortalama maliyet yeniden hesaplanır.</Alert>

        <FormSection title="Miktar ve fiyat">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField name="qty" label="Miktar" required>
              <input name="qty" inputMode="decimal" className="input" value={qty} onChange={(e) => setQty(e.target.value)} />
            </FormField>
            <FormField name="unit" label="Birim" required>
              <select name="unit" className="input" defaultValue={movement.entry_unit ?? undefined}>
                {units.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField name="unit_price" label="Birim fiyat (seçilen birim başına)" required>
              <input name="unit_price" inputMode="decimal" className="input" value={price} onChange={(e) => setPrice(e.target.value)} />
            </FormField>
            <FormField name="currency" label="Para birimi" required>
              <select name="currency" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="USD">USD</option>
                <option value="TRY">TRY</option>
              </select>
            </FormField>
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            Toplam tutar:{" "}
            <span className="font-semibold text-ink tabular-nums">
              {Number.isFinite(total) && total > 0 ? fmtMoney(total, currency) : "—"}
            </span>
            {movement.total_amount ? <> (önceki: {fmtMoney(movement.total_amount, movement.currency ?? "USD")})</> : null}
          </p>
        </FormSection>

        <FormSection title="Tarih ve kur">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField name="received_on" label="Alış tarihi" required>
              <input type="date" name="received_on" className="input" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </FormField>
            <FxRateField date={date} canManual />
          </div>
        </FormSection>

        <FormSection title="Tedarikçi ve not">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField name="supplier" label="Tedarikçi">
              <input name="supplier" className="input" defaultValue={movement.supplier ?? ""} />
            </FormField>
            <FormField name="note" label="Not">
              <input name="note" className="input" defaultValue={movement.note ?? ""} />
            </FormField>
          </div>
        </FormSection>

        <FormActions>
          <SubmitButton>Kaydet</SubmitButton>
        </FormActions>
      </ActionForm>
    </Drawer>
  );
}

/** Alış veya fire hareketini silme onayı. */
export function DeleteMovement({ id, summary, compact = false }: { id: number; summary: string; compact?: boolean }) {
  return (
    <Modal
      trigger={
        <>
          <Trash2 aria-hidden />
          {compact ? null : "Sil"}
        </>
      }
      triggerVariant="ghost"
      triggerSize="sm"
      triggerClassName="text-chart-red"
      triggerLabel={compact ? "Hareketi sil" : undefined}
      title="Hareketi sil"
      description={summary}
      size="sm"
    >
      <ActionForm action={deleteMovement} className="space-y-4">
        <input type="hidden" name="movement_id" value={id} />
        <p className="text-[13px] text-ink-soft">
          Kayıt hareket geçmişinden kaldırılır; stok ve ağırlıklı ortalama maliyet bu hareket hiç yapılmamış gibi yeniden hesaplanır. Bu
          işlem geri alınamaz.
        </p>
        <FormActions>
          <SubmitButton variant="danger">Sil</SubmitButton>
        </FormActions>
      </ActionForm>
    </Modal>
  );
}
