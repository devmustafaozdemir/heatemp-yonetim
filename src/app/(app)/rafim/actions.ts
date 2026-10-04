"use server";

import { revalidatePath } from "next/cache";
import { adminAction, unwrap } from "@/lib/action";

/** Raf ve teslimat ekranları (adminAction ayrıca tüm düzeni yeniler). */
function revalidateShelves(deliveryId?: string | null) {
  revalidatePath("/rafim");
  revalidatePath("/mekonsis");
  revalidatePath("/teslimatlar");
  if (deliveryId) revalidatePath(`/teslimatlar/${deliveryId}`);
}

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
    const deliveryId = unwrap(await ctx.supabase.rpc("deliver_to_mekonsis", args)) as string | null;
    revalidateShelves(deliveryId);
    return {
      message: "Teslimat kaydedildi. Ürünler Mekonsis rafına aktarıldı (satış oluşmadı).",
      data: deliveryId ? { delivery_id: deliveryId } : undefined,
    };
  });
}

export async function cancelDelivery(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const id = form.id("delivery_id", "Teslimat");
    const reason = form.text("reason", "Gerekçe", { required: true, max: 500 });
    form.assertValid();
    unwrap(await ctx.supabase.rpc("cancel_delivery", { p_delivery_id: id, p_reason: reason }));
    revalidateShelves(id);
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
    revalidateShelves();
    return { message: "Açılış stoğu Heatemp rafına eklendi." };
  });
}

/** Teslimat gününü düzeltir; seçilirse teslim edilen partiler de teslimat gününe çekilir. */
export async function updateDeliveryDate(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const args = {
      p_delivery_id: form.id("delivery_id", "Teslimat"),
      p_date: form.date("delivered_on", "Teslimat tarihi", { required: true }),
      p_move_batches: form.bool("move_batches"),
    };
    form.assertValid();
    unwrap(await ctx.supabase.rpc("update_delivery_date", args));
    revalidateShelves(args.p_delivery_id);
    return { message: "Teslimat tarihi güncellendi; raf katmanları ve hareketler de düzeltildi." };
  });
}
