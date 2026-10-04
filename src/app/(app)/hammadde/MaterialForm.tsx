"use client";

import { useState } from "react";
import { FormField } from "@/components/forms";
import { FormSection } from "@/components/ui";
import type { MaterialView, Unit, UnitKind } from "@/lib/types";

const KIND_LABEL: Record<UnitKind, string> = {
  count: "Adet",
  mass: "Ağırlık (temel: gram)",
  length: "Uzunluk (temel: metre)",
  area: "Alan (temel: m²)",
  volume: "Hacim (temel: ml)",
};

/** Malzeme tanım alanları (yeni malzeme ve düzenleme). */
export function MaterialFields({ units, material, vatRate }: { units: Unit[]; material?: MaterialView; vatRate?: number }) {
  const [kind, setKind] = useState<UnitKind>(material?.unit_kind ?? "count");
  const options = units.filter((u) => u.kind === kind);
  return (
    <div className="grid gap-5">
      <FormSection title="Tanım" description="Kod benzersizdir; reçetelerde ve stok girişinde malzeme bu kod ve adla seçilir.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <FormField name="code" label="Malzeme kodu" required hint="ör. HAM-TEL-018">
            <input
              className="input font-mono"
              name="code"
              defaultValue={material?.code}
              maxLength={40}
              required
              aria-required
              autoComplete="off"
            />
          </FormField>
          <FormField name="name" label="Malzeme adı" required>
            <input className="input" name="name" defaultValue={material?.name} maxLength={160} required aria-required />
          </FormField>
          <FormField
            name="kind"
            label="Tür"
            className="sm:col-span-2"
            hint="Komponent: rafta bekleyen, henüz ürüne monte edilmemiş hazır parça (ör. termostat)."
          >
            <select className="input" name="kind" defaultValue={material?.kind ?? "raw"}>
              <option value="raw">Hammadde</option>
              <option value="component">Komponent (monte edilmemiş parça)</option>
            </select>
          </FormField>
        </div>
      </FormSection>

      <FormSection
        title="Birim"
        description="Stok her zaman birim türünün temel biriminde tutulur; giriş ve gösterim seçtiğiniz birimle yapılır."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            name="unit_kind"
            label="Birim türü"
            required
            hint={
              material
                ? "Değiştirirseniz görünen miktarlar aynı kalır (ör. 30 adet → 30 kg); tutarlar korunur, birim maliyet yeni birime göre hesaplanır."
                : "Sonradan malzeme düzenleme ekranından değiştirilebilir."
            }
          >
            <select
              className="input"
              name="unit_kind"
              value={kind}
              aria-required
              onChange={(e) => setKind(e.target.value as UnitKind)}
            >
              {(Object.keys(KIND_LABEL) as UnitKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField name="display_unit" label="Gösterim / giriş birimi" required hint="Listede ve formlarda varsayılan birim">
            <select
              className="input"
              name="display_unit"
              key={kind}
              defaultValue={material?.display_unit ?? options[0]?.code}
              aria-required
            >
              {options.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Diğer">
        <div className="grid gap-3">
          <FormField name="vat_rate" label="KDV oranı" hint="Stok girişinde önerilen oran; alışta değiştirilebilir. KDV maliyete eklenmez.">
            <select className="input" name="vat_rate" defaultValue={String(vatRate ?? 20)}>
              {[...new Set([0, 1, 10, 20, vatRate ?? 20])]
                .sort((a, b) => a - b)
                .map((r) => (
                  <option key={r} value={r}>
                    %{r}
                  </option>
                ))}
            </select>
          </FormField>
          <FormField name="notes" label="Not" hint="Tedarik, özellik veya depolama bilgisi (isteğe bağlı)">
            <textarea className="input min-h-[4.5rem]" name="notes" rows={2} defaultValue={material?.notes ?? ""} maxLength={1000} />
          </FormField>
          {material ? (
            <label className="flex items-start gap-2.5 rounded-md border border-line px-3 py-2.5 text-[13px]">
              <input type="checkbox" name="is_active" defaultChecked={material.is_active} className="mt-0.5 size-4 accent-brand-600" />
              <span>
                <span className="font-medium text-ink">Aktif</span>
                <span className="block text-xs text-ink-muted">
                  Pasif malzeme listede soluk görünür ve stok girişi seçim listesinde yer almaz.
                </span>
              </span>
            </label>
          ) : null}
        </div>
      </FormSection>
    </div>
  );
}
