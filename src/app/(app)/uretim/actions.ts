"use server";

import { adminAction, unwrap } from "@/lib/action";

export async function startProduction(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const args = {
      p_variant_id: form.id("variant_id", "Varyant"),
      p_quantity: form.int("quantity", "Adet", { required: true, positive: true }),
      p_fx_rate_id: form.bigintId("fx_rate_id", "İşlem kuru"),
      p_note: form.text("note", "Not", { max: 500 }),
      p_request_id: form.requestId(),
    };
    if (!args.p_fx_rate_id) {
      form.errors.fx_rate_id = "Geçerli bir işlem kuru yok. Kuru güncelleyin veya manuel kur girin.";
    }
    form.assertValid();
    const batchId = unwrap(await ctx.supabase.rpc("start_production", args)) as string;
    return { message: "Üretim başlatıldı; hammadde stoktan düşüldü.", redirectTo: `/uretim/${batchId}` };
  });
}

export async function completeProduction(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const id = form.id("batch_id", "Parti");
    form.assertValid();
    unwrap(await ctx.supabase.rpc("complete_production", { p_batch_id: id }));
    return { message: "Parti tamamlandı ve Heatemp rafına eklendi." };
  });
}

export async function cancelProduction(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const id = form.id("batch_id", "Parti");
    const reason = form.text("reason", "İptal gerekçesi", { max: 500 });
    form.assertValid();
    unwrap(await ctx.supabase.rpc("cancel_production", { p_batch_id: id, p_reason: reason }));
    return { message: "Parti iptal edildi; tüketilen malzeme stoğa iade edildi." };
  });
}
