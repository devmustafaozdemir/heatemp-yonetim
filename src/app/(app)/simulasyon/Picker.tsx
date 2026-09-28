"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

export interface PickerVariant {
  id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  is_active: boolean;
}

/** Ürün → varyant → adet seçimi. Sonuç sunucuda hesaplanır (URL parametreleriyle). */
export function SimulationPicker({
  variants,
  initialVariant,
  initialQty,
}: {
  variants: PickerVariant[];
  initialVariant: string | null;
  initialQty: number;
}) {
  const router = useRouter();
  const initialProduct = variants.find((v) => v.id === initialVariant)?.product_id ?? "";
  const [productId, setProductId] = useState(initialProduct);
  const [variantId, setVariantId] = useState(initialVariant ?? "");
  const [qty, setQty] = useState(String(initialQty));

  const products = Array.from(new Map(variants.map((v) => [v.product_id, v.product_name])).entries());
  const productVariants = variants.filter((v) => v.product_id === productId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!variantId) return;
    const n = Number(qty.replace(",", "."));
    router.push(`/simulasyon?varyant=${variantId}&adet=${Number.isInteger(n) && n > 0 ? n : 1}`);
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_2fr_1fr_auto] sm:items-end">
      <label className="block">
        <span className="label">Ürün</span>
        <select
          className="input"
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value);
            const first = variants.find((v) => v.product_id === e.target.value);
            setVariantId(first?.id ?? "");
          }}
        >
          <option value="">Seçin…</option>
          {products.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">Varyant</span>
        <select className="input" value={variantId} onChange={(e) => setVariantId(e.target.value)} disabled={!productId}>
          {productVariants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.variant_name}
              {!v.is_active ? " (pasif)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">Adet</span>
        <input className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
      </label>
      <Button type="submit" disabled={!variantId}>
        Hesapla
      </Button>
    </form>
  );
}
