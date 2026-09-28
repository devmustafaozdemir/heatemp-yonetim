"use client";

import { useMemo, useState } from "react";
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

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr_2fr]">
      <FormField name="material_id" label="Malzeme *">
        <select
          className="input"
          name="material_id"
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
      <FormField name="entry_qty" label="1 adet için miktar *">
        <input className="input" name="entry_qty" inputMode="decimal" />
      </FormField>
      <FormField name="entry_unit" label="Birim *">
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
        <input className="input" name="note" maxLength={500} />
      </FormField>
    </div>
  );
}
