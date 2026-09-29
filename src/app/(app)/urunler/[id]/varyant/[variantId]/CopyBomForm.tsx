"use client";

import { useState } from "react";
import { ActionForm, FormField, SubmitButton } from "@/components/forms";
import { copyBom } from "../../../actions";

/** Kopyalanabilecek kaynak: reçetesi olan (en az 1 kalem) başka bir varyant. */
export interface CopySource {
  id: string;
  /** Onay metninde kullanılan tam ad (Ürün — Varyant) */
  displayName: string;
  /** Seçenek metni (ör. "Standart (HP-500) · 3 kalem") */
  label: string;
}

export interface CopySourceGroup {
  label: string;
  options: CopySource[];
}

/**
 * Başka varyantın reçetesini kopyalama. Yalnız reçetesi olan varyantlar listelenir (boş
 * reçete kaynağı copy_bom'da hata verir); seçenekler ürüne göre gruplanır, aynı ürünün
 * varyantları önce gelir ve her seçenekte kalem sayısı yazar.
 * Kaynak seçilmeden gönderilirse onay sorulmaz; sunucunun alan hatası seçim kutusunun
 * yanında gösterilir. Seçim yapıldığında onay metni kaynak varyantın adını içerir.
 */
export function CopyBomForm({ variantId, groups }: { variantId: string; groups: CopySourceGroup[] }) {
  const [from, setFrom] = useState("");
  const source = groups.flatMap((g) => g.options).find((s) => s.id === from);

  return (
    <ActionForm
      action={copyBom}
      resetOnSuccess
      onSuccess={() => setFrom("")}
      confirmMessage={source ? `Bu varyantın mevcut reçetesi silinip “${source.displayName}” reçetesi aynen kopyalanacak. Devam edilsin mi?` : undefined}
    >
      <input type="hidden" name="variant_id" value={variantId} />
      {/* Alan ve düğme aynı satırda; formun genel hata mesajı altta tam genişlikte kalır. */}
      <div className="flex flex-wrap items-start gap-3">
        <FormField name="from_variant_id" label="Kaynak varyant" required className="flex-1 basis-64">
          <select className="input" name="from_variant_id" required aria-required value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">Seçin…</option>
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </FormField>
        {/* Etiket yüksekliği kadar boşluk: düğme seçim kutusuyla aynı hizada kalır. */}
        <div className="sm:pt-6">
          <SubmitButton variant="secondary">Kopyala</SubmitButton>
        </div>
      </div>
    </ActionForm>
  );
}
