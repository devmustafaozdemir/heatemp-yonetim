import { FormField } from "@/components/forms";
import { FormSection } from "@/components/ui";
import type { Mold } from "@/lib/types";

/** Kalıp formu alanları (ekleme ve düzenleme yan panellerinde). */
export function MoldFields({
  mold,
  suppliers,
  products,
}: {
  mold?: Mold;
  suppliers: { id: string; name: string }[];
  products: { id: string; code: string; name: string }[];
}) {
  return (
    <div className="space-y-5">
      <FormSection title="Kalıp">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField name="name" label="Kalıp adı" required className="sm:col-span-2">
            <input className="input" name="name" defaultValue={mold?.name} maxLength={200} required aria-required />
          </FormField>
          <FormField name="code" label="Kalıp kodu" hint="İsteğe bağlı; benzersiz olmalı">
            <input className="input" name="code" defaultValue={mold?.code ?? ""} maxLength={60} />
          </FormField>
          <FormField name="product_id" label="İlgili ürün" hint="İsteğe bağlı">
            <select className="input" name="product_id" defaultValue={mold?.product_id ?? ""}>
              <option value="">— Seçilmedi —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </FormSection>

      <div className="border-t border-line pt-4">
        <FormSection title="Ücret">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)]">
            <FormField name="price" label="Kalıp ücreti" required>
              <input
                className="input tabular-nums"
                name="price"
                inputMode="decimal"
                defaultValue={mold?.price ?? ""}
                required
                aria-required
              />
            </FormField>
            <FormField name="currency" label="Para birimi" required>
              <select className="input" name="currency" defaultValue={mold?.currency ?? "USD"}>
                <option value="USD">USD</option>
                <option value="TRY">TRY</option>
              </select>
            </FormField>
            <FormField name="purchased_on" label="Alış tarihi">
              <input className="input" type="date" name="purchased_on" defaultValue={mold?.purchased_on ?? ""} />
            </FormField>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField name="supplier_id" label="Tedarikçi" hint="İsteğe bağlı">
              <select className="input" name="supplier_id" defaultValue={mold?.supplier_id ?? ""}>
                <option value="">— Seçilmedi —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </FormField>
            {mold ? (
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-[13px] text-ink-soft">
                  <input type="checkbox" name="is_active" defaultChecked={mold.is_active} className="size-4 accent-brand-600" />
                  Kullanımda
                </label>
              </div>
            ) : null}
          </div>
        </FormSection>
      </div>

      <div className="border-t border-line pt-4">
        <FormField name="note" label="Not">
          <textarea className="input" name="note" rows={3} defaultValue={mold?.note ?? ""} maxLength={1000} />
        </FormField>
      </div>
    </div>
  );
}
