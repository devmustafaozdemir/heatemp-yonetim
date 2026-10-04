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

/** "YYYY-AA-GGTSS:DD" (Türkiye saati, datetime-local) → ISO zaman (+03:00); geçersizse null. */
function trLocalToIso(v: string | null): string | null {
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? `${v}:00+03:00` : null;
}

export async function updateBatchDates(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const id = form.id("batch_id", "Parti");
    const startRaw = form.text("started_at", "Başlama zamanı", { required: true });
    const doneRaw = form.text("completed_at", "Tamamlanma zamanı");
    const started = trLocalToIso(startRaw);
    const completed = trLocalToIso(doneRaw);
    if (startRaw && !started) form.errors.started_at = "Geçerli bir tarih ve saat girin.";
    if (doneRaw && !completed) form.errors.completed_at = "Geçerli bir tarih ve saat girin.";
    form.assertValid();
    unwrap(await ctx.supabase.rpc("update_batch_dates", { p_batch_id: id, p_started_at: started, p_completed_at: completed }));
    return { message: "Parti tarihleri güncellendi; raf ve hammadde hareket tarihleri de düzeltildi." };
  });
}
