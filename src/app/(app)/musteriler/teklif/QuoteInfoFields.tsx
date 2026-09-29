import { FormField } from "@/components/forms";
import { FormSection } from "@/components/ui";
import type { QuoteView } from "@/lib/types";

/** Teklif bilgileri (tarih, geçerlilik, para birimi, not) — düzenleme yan panelinde. */
export function QuoteInfoFields({ quote }: { quote: QuoteView }) {
  return (
    <div className="space-y-5">
      <FormSection title="Tarihler">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField name="quote_date" label="Teklif tarihi" required>
            <input className="input" type="date" name="quote_date" defaultValue={quote.quote_date} required aria-required />
          </FormField>
          <FormField name="valid_until" label="Geçerlilik" hint="Boş bırakılırsa süre sınırı yoktur.">
            <input className="input" type="date" name="valid_until" defaultValue={quote.valid_until ?? ""} min={quote.quote_date} />
          </FormField>
        </div>
      </FormSection>
      <div className="border-t border-line pt-4">
        <FormSection title="Para birimi ve not" description="Para birimini değiştirmek kalem fiyatlarını çevirmez; özel fiyatlar yeni para biriminde okunur.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField name="currency" label="Para birimi">
              <select className="input" name="currency" defaultValue={quote.currency}>
                <option value="USD">USD</option>
                <option value="TRY">TRY</option>
              </select>
            </FormField>
            <FormField name="note" label="Not" className="sm:col-span-2" hint="Satışa dönüştürmede satış notuna eklenir.">
              <textarea className="input" name="note" rows={3} defaultValue={quote.note ?? ""} maxLength={1000} />
            </FormField>
          </div>
        </FormSection>
      </div>
    </div>
  );
}
