"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FormField } from "@/components/forms";
import type { Unit, UnitKind } from "@/lib/types";

export interface BomMaterialOption {
  id: string;
  code: string;
  name: string;
  unit_kind: UnitKind;
  display_unit: string;
}

/** Malzeme seçilince yalnızca o malzemenin birim türüne uygun birimler listelenir. */
export function BomLineFields({ materials, units }: { materials: BomMaterialOption[]; units: Unit[] }) {
  const [materialId, setMaterialId] = useState("");
  const material = materials.find((m) => m.id === materialId);
  const options = useMemo(() => units.filter((u) => u.kind === material?.unit_kind), [units, material]);
  const [unit, setUnit] = useState("");
  const selectedUnit = options.some((o) => o.code === unit) ? unit : (material?.display_unit ?? "");
  // "Reçeteye kaydet" başarılı olunca form sıfırlanır; seçili malzeme ve birim de temizlenir.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const onReset = () => {
      setMaterialId("");
      setUnit("");
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  return (
    <div ref={ref} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)]">
      <FormField name="material_id" label="Malzeme" required>
        <select
          className="input"
          name="material_id"
          required
          aria-required
          value={materialId}
          onChange={(e) => {
            setMaterialId(e.target.value);
            setUnit("");
          }}
        >
          <option value="">Seçin…</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.code})
            </option>
          ))}
        </select>
      </FormField>
      <FormField name="entry_qty" label="1 adet için miktar" required>
        <input className="input" name="entry_qty" inputMode="decimal" required aria-required />
      </FormField>
      <FormField name="entry_unit" label="Birim" required hint={material ? undefined : "Önce malzeme seçin"}>
        <select
          className="input"
          name="entry_unit"
          value={selectedUnit}
          onChange={(e) => setUnit(e.target.value)}
          disabled={!material}
        >
          {options.map((u) => (
            <option key={u.code} value={u.code}>
              {u.label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField name="note" label="Not">
        <input className="input" name="note" maxLength={500} placeholder="İsteğe bağlı" />
      </FormField>
    </div>
  );
}
