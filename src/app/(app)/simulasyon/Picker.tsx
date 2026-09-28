"use client";

import { Calculator, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";

export interface PickerVariant {
  id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  is_active: boolean;
  /** Reçete kalemi sayısı; bilinmiyorsa null (etiket eklenmez). */
  bom_lines?: number | null;
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
  const [pending, startTransition] = useTransition();
  const initialProduct = variants.find((v) => v.id === initialVariant)?.product_id ?? "";
  const [productId, setProductId] = useState(initialProduct);
  const [variantId, setVariantId] = useState(initialVariant ?? "");
  const [qty, setQty] = useState(String(initialQty));
  const [error, setError] = useState<string | null>(null);

  const products = Array.from(new Map(variants.map((v) => [v.product_id, v.product_name])).entries());
  const productVariants = variants.filter((v) => v.product_id === productId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!variantId) {
      setError("Önce ürün ve varyant seçin.");
      return;
    }
    const n = Number(qty.replace(",", "."));
    if (!Number.isInteger(n) || n <= 0) {
      setError("Adet sıfırdan büyük bir tam sayı olmalıdır.");
      return;
    }
    setError(null);
    startTransition(() => router.push(`/simulasyon?varyant=${variantId}&adet=${n}`));
  }

  return (
    <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_7.5rem_auto]">
      <label className="block min-w-0">
        <span className="label">Ürün</span>
        <select
          className="input"
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value);
            const first = variants.find((v) => v.product_id === e.target.value);
            setVariantId(first?.id ?? "");
            setError(null);
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
      <label className="block min-w-0">
        <span className="label">Varyant</span>
        <select className="input" value={variantId} onChange={(e) => setVariantId(e.target.value)} disabled={!productId}>
          {!productId ? <option value="">Önce ürün seçin</option> : null}
          {productVariants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.variant_name}
              {!v.is_active ? " (pasif)" : ""}
              {v.bom_lines === 0 ? " (reçete yok)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="block min-w-0">
        <span className="label">Adet</span>
        <input
          className="input tabular-nums"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          aria-invalid={error?.startsWith("Adet") ? true : undefined}
        />
      </label>
      <div>
        <Button type="submit" disabled={pending} className="w-full lg:w-auto" aria-busy={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Calculator aria-hidden />}
          Hesapla
        </Button>
      </div>
      {error ? (
        <p role="alert" className="field-error sm:col-span-2 lg:col-span-4">
          {error}
        </p>
      ) : null}
    </form>
  );
}
