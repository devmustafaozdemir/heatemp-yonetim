"use client";

import Link from "next/link";
import { FormField } from "@/components/forms";
import type { SupplierOption } from "@/lib/types";

/** Alış formlarında tedarikçi seçimi. Pasif tedarikçi yalnız zaten seçiliyse listede kalır. */
export function SupplierSelect({
  suppliers,
  value,
  onChange,
  defaultValue,
}: {
  suppliers: SupplierOption[];
  value?: string;
  onChange?: (id: string) => void;
  defaultValue?: string | null;
}) {
  const current = value ?? defaultValue ?? "";
  const options = suppliers.filter((s) => s.is_active || s.id === current);
  return (
    <FormField
      name="supplier_id"
      label="Tedarikçi"
      hint={
        <>
          Listede yoksa{" "}
          <Link href="/tedarikciler?islem=yeni" target="_blank" className="link">
            yeni tedarikçi ekleyin
          </Link>{" "}
          (sayfayı yenileyince listede görünür).
        </>
      }
    >
      <select
        className="input"
        name="supplier_id"
        {...(value !== undefined ? { value, onChange: (e) => onChange?.(e.target.value) } : { defaultValue: defaultValue ?? "" })}
      >
        <option value="">— Seçilmedi —</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.is_active ? "" : " (pasif)"}
          </option>
        ))}
      </select>
    </FormField>
  );
}
