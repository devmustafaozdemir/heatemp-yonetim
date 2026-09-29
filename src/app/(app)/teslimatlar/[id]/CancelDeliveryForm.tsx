"use client";

import { ActionForm, FormField, SubmitButton } from "@/components/forms";
import { Button, DefinitionList } from "@/components/ui";
import { useDialog } from "@/components/ui/dialog";
import { fmtInt, fmtMoney } from "@/lib/format";
import { cancelDelivery } from "../../rafim/actions";

/**
 * Teslimatı geri alma formu (Modal içinde). Gerekçe zorunludur; başarıda pencere kapanır.
 * Maliyet değeri yüklenemediyse null gelir ve "—" gösterilir.
 */
export function CancelDeliveryForm({
  deliveryId,
  displayName,
  remainingQty,
  remainingValue,
}: {
  deliveryId: string;
  displayName: string;
  remainingQty: number;
  remainingValue: number | null;
}) {
  const dialog = useDialog();
  return (
    <ActionForm action={cancelDelivery}>
      <input type="hidden" name="delivery_id" value={deliveryId} />
      <DefinitionList
        columns={1}
        items={[
          ["Ürün / varyant", displayName],
          ["Heatemp rafına dönecek", `${fmtInt(remainingQty)} adet`],
          ["Maliyet değeri", remainingValue === null ? "— (yüklenemedi)" : fmtMoney(remainingValue, "TRY")],
        ]}
      />
      <FormField name="reason" label="Geri alma gerekçesi" required className="mt-4" hint="Kayıtta saklanır (en fazla 500 karakter).">
        <textarea className="input min-h-20" name="reason" maxLength={500} required aria-required />
      </FormField>
      <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        {dialog ? (
          <Button type="button" variant="secondary" onClick={dialog.close}>
            Vazgeç
          </Button>
        ) : null}
        <SubmitButton variant="danger">Teslimatı geri al</SubmitButton>
      </div>
    </ActionForm>
  );
}
