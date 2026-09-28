"use client";

import { useState } from "react";
import { FormField } from "@/components/forms";
import type { MaterialView, Unit, UnitKind } from "@/lib/types";

const KIND_LABEL: Record<UnitKind, string> = {
  count: "Adet",
  mass: "Ağırlık (temel: gram)",
  length: "Uzunluk (temel: metre)",
  area: "Alan (temel: m²)",
  volume: "Hacim (temel: ml)",
};

export function MaterialFields({ units, material }: { units: Unit[]; material?: MaterialView }) {
  const [kind, setKind] = useState<UnitKind>(material?.unit_kind ?? "count");
  const options = units.filter((u) => u.kind === kind);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <FormField name="code" label="Malzeme kodu *">
        <input className="input" name="code" defaultValue={material?.code} maxLength={40} />
      </FormField>
      <FormField name="name" label="Malzeme adı *" className="lg:col-span-3">
        <input className="input" name="name" defaultValue={material?.name} maxLength={160} />
      </FormField>
      <FormField name="kind" label="Tür">
        <select className="input" name="kind" defaultValue={material?.kind ?? "raw"}>
          <option value="raw">Hammadde</option>
          <option value="component">Komponent (monte edilmemiş parça)</option>
        </select>
      </FormField>
      <FormField
        name="unit_kind"
        label="Birim türü *"
        hint={material ? "Hareketi olan malzemede değiştirilemez" : "Stok bu türün temel biriminde tutulur"}
      >
        <select
          className="input"
          name="unit_kind"
          value={kind}
          disabled={!!material}
          onChange={(e) => setKind(e.target.value as UnitKind)}
        >
          {(Object.keys(KIND_LABEL) as UnitKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </FormField>
      <FormField name="display_unit" label="Gösterim / giriş birimi *">
        <select className="input" name="display_unit" key={kind} defaultValue={material?.display_unit ?? options[0]?.code}>
          {options.map((u) => (
            <option key={u.code} value={u.code}>
              {u.label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField name="notes" label="Not">
        <input className="input" name="notes" defaultValue={material?.notes ?? ""} maxLength={1000} />
      </FormField>
      {material ? (
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={material.is_active} /> Aktif
        </label>
      ) : null}
    </div>
  );
}
