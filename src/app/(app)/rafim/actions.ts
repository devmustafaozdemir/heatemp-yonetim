"use server";

import { adminAction, unwrap } from "@/lib/action";

export async function deliverToMekonsis(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const args = {
      p_variant_id: form.id("variant_id", "Varyant"),
      p_quantity: form.int("quantity", "Teslim adedi", { required: true, positive: true }),
      p_batch_id: form.id("batch_id", "Parti", { required: false }),
      p_delivered_on: form.date("delivered_on", "Teslimat tarihi", { required: true }),
      p_note: form.text("note", "Not", { max: 500 }),
      p_request_id: form.requestId(),
    };
    form.assertValid();
    unwrap(await ctx.supabase.rpc("deliver_to_mekonsis", args));
    return { message: "Teslimat kaydedildi. Ürünler Mekonsis rafına aktarıldı (satış oluşmadı)." };
  });
}

export async function cancelDelivery(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const id = form.id("delivery_id", "Teslimat");
    const reason = form.text("reason", "Gerekçe", { required: true, max: 500 });
    form.assertValid();
    unwrap(await ctx.supabase.rpc("cancel_delivery", { p_delivery_id: id, p_reason: reason }));
    return { message: "Teslimat geri alındı; ürünler Heatemp rafına döndü." };
  });
}

export async function recordOpeningStock(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const args = {
      p_variant_id: form.id("variant_id", "Varyant"),
      p_quantity: form.int("quantity", "Adet", { required: true, positive: true }),
      p_unit_cost: form.decimal("unit_cost", "Birim maliyet", { required: true, positive: true }),
      p_currency: form.oneOf("currency", "Para birimi", ["USD", "TRY"] as const),
      p_fx_rate_id: form.bigintId("fx_rate_id", "Kur"),
      p_stock_date: form.date("stock_date", "Açılış tarihi", { required: true }),
      p_note: form.text("note", "Kaynak / açıklama", { required: true, max: 500 }),
      p_request_id: form.requestId(),
    };
    if (!args.p_fx_rate_id) form.errors.fx_rate_id = "Geçerli bir kur yok. Kuru güncelleyin veya manuel kur girin.";
    form.assertValid();
    unwrap(await ctx.supabase.rpc("record_opening_stock", args));
    return { message: "Açılış stoğu Heatemp rafına eklendi." };
  });
}
