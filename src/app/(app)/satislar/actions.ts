"use server";

import { adminAction, unwrap } from "@/lib/action";
import { isUuid, parseDecimal, parseInteger } from "@/lib/parse";

interface RawItem {
  variant_id?: unknown;
  quantity?: unknown;
  unit_price?: unknown;
}

export async function recordSale(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const soldOn = form.date("sold_on", "Satış tarihi", { required: true });
    const currency = form.oneOf("currency", "Para birimi", ["USD", "TRY"] as const);
    const fxRateId = form.bigintId("fx_rate_id", "İşlem kuru");
    const customerId = form.id("customer_id", "Müşteri", { required: false });
    const note = form.text("note", "Açıklama", { max: 1000 });
    if (!fxRateId) form.errors.fx_rate_id = "Geçerli bir işlem kuru yok. Kuru güncelleyin veya manuel kur girin.";

    let raw: RawItem[] = [];
    try {
      raw = JSON.parse(String(formData.get("items") ?? "[]"));
    } catch {
      raw = [];
    }
    const items: { variant_id: string; quantity: number; unit_price: number }[] = [];
    raw.forEach((r, i) => {
      const quantity = parseInteger(String(r.quantity ?? ""));
      const unitPrice = parseDecimal(String(r.unit_price ?? ""));
      if (!isUuid(String(r.variant_id ?? ""))) form.errors[`items.${i}`] = `${i + 1}. satır: varyant seçin.`;
      else if (quantity === null || Number.isNaN(quantity) || quantity <= 0)
        form.errors[`items.${i}`] = `${i + 1}. satır: adet sıfırdan büyük tam sayı olmalıdır.`;
      else if (unitPrice === null || Number.isNaN(unitPrice) || unitPrice <= 0)
        form.errors[`items.${i}`] = `${i + 1}. satır: birim satış fiyatı sıfırdan büyük olmalıdır.`;
      else items.push({ variant_id: String(r.variant_id), quantity, unit_price: unitPrice });
    });
    if (raw.length === 0) form.errors.items = "En az bir satış kalemi ekleyin.";
    if (new Set(items.map((i) => i.variant_id)).size !== items.length) {
      form.errors.items = "Aynı varyant birden fazla satırda olamaz; adetleri birleştirin.";
    }
    form.assertValid();

    const saleId = unwrap(
      await ctx.supabase.rpc("record_sale", {
        p_sold_on: soldOn,
        p_currency: currency,
        p_fx_rate_id: fxRateId,
        p_items: items,
        p_customer_id: customerId,
        p_note: note,
        p_request_id: form.requestId(),
      }),
    ) as string;
    return { message: "Satış kaydedildi.", redirectTo: `/satislar/${saleId}` };
  });
}

export async function cancelSale(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const id = form.id("sale_id", "Satış");
    const reason = form.text("reason", "İptal gerekçesi", { required: true, max: 500 });
    form.assertValid();
    unwrap(await ctx.supabase.rpc("cancel_sale", { p_sale_id: id, p_reason: reason }));
    return { message: "Satış iptal edildi; ürünler Mekonsis rafına geri döndü." };
  });
}
