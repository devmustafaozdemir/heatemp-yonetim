import { FormField } from "@/components/forms";
import { FormSection } from "@/components/ui";
import type { Customer } from "@/lib/types";

/** Müşteri formu alanları (ekleme ve düzenleme yan panellerinde). */
export function CustomerFields({ customer }: { customer?: Customer }) {
  return (
    <div className="space-y-5">
      <FormSection title="Firma" description="Firma adı benzersizdir; aynı adla ikinci müşteri açılamaz.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField name="name" label="Firma adı" required className="sm:col-span-2">
            <input className="input" name="name" defaultValue={customer?.name} maxLength={200} required aria-required autoComplete="organization" />
          </FormField>
          <FormField name="tax_number" label="Vergi no" hint="Vergi kimlik numarası (isteğe bağlı)">
            <input className="input" name="tax_number" defaultValue={customer?.tax_number ?? ""} maxLength={40} inputMode="numeric" />
          </FormField>
          {customer ? (
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-[13px] text-ink-soft">
                <input type="checkbox" name="is_active" defaultChecked={customer.is_active} className="size-4 accent-brand-600" />
                Aktif müşteri
              </label>
            </div>
          ) : null}
        </div>
      </FormSection>

      <div className="border-t border-line pt-4">
        <FormSection title="İletişim">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField name="contact_name" label="Yetkili kişi" className="sm:col-span-2">
              <input className="input" name="contact_name" defaultValue={customer?.contact_name ?? ""} maxLength={160} autoComplete="name" />
            </FormField>
            <FormField name="phone" label="Telefon">
              <input className="input" name="phone" type="tel" defaultValue={customer?.phone ?? ""} maxLength={40} autoComplete="tel" />
            </FormField>
            <FormField name="email" label="E-posta">
              <input className="input" name="email" type="email" defaultValue={customer?.email ?? ""} maxLength={200} autoComplete="email" />
            </FormField>
          </div>
        </FormSection>
      </div>

      <div className="border-t border-line pt-4">
        <FormSection title="Adres ve not">
          <div className="grid grid-cols-1 gap-3">
            <FormField name="address" label="Adres">
              <textarea className="input" name="address" rows={2} defaultValue={customer?.address ?? ""} maxLength={500} autoComplete="street-address" />
            </FormField>
            <FormField name="note" label="Not" hint="Yalnız iç kullanım; teklif ve satışlarda görünmez.">
              <textarea className="input" name="note" rows={3} defaultValue={customer?.note ?? ""} maxLength={1000} />
            </FormField>
          </div>
        </FormSection>
      </div>
    </div>
  );
}
