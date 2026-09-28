import { FormField } from "@/components/forms";
import type { Customer } from "@/lib/types";

export function CustomerFields({ customer }: { customer?: Customer }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <FormField name="name" label="Firma adı *" className="sm:col-span-2">
        <input className="input" name="name" defaultValue={customer?.name} maxLength={200} />
      </FormField>
      <FormField name="tax_number" label="Vergi no">
        <input className="input" name="tax_number" defaultValue={customer?.tax_number ?? ""} maxLength={40} />
      </FormField>
      <FormField name="contact_name" label="Yetkili kişi">
        <input className="input" name="contact_name" defaultValue={customer?.contact_name ?? ""} maxLength={160} />
      </FormField>
      <FormField name="phone" label="Telefon">
        <input className="input" name="phone" defaultValue={customer?.phone ?? ""} maxLength={40} />
      </FormField>
      <FormField name="email" label="E-posta">
        <input className="input" name="email" type="email" defaultValue={customer?.email ?? ""} maxLength={200} />
      </FormField>
      <FormField name="address" label="Adres" className="sm:col-span-2">
        <input className="input" name="address" defaultValue={customer?.address ?? ""} maxLength={500} />
      </FormField>
      <FormField name="note" label="Not" className="sm:col-span-2 lg:col-span-3">
        <input className="input" name="note" defaultValue={customer?.note ?? ""} maxLength={1000} />
      </FormField>
      {customer ? (
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={customer.is_active} /> Aktif
        </label>
      ) : null}
    </div>
  );
}
