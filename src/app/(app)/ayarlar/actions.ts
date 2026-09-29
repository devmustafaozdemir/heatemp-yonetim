"use server";

import { adminAction, unwrap } from "@/lib/action";
import { refreshFx } from "@/lib/fx/service";

/** Genel ayarlar: firma adı ve Kasa ekranındaki bilgi amaçlı USD gösterimi. */
export async function saveGeneralSettings(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const values = {
      company_name: form.text("company_name", "Firma adı", { required: true, max: 120 }),
      show_usd_info: form.bool("show_usd_info"),
    };
    form.assertValid();
    unwrap(await ctx.supabase.from("app_settings").update(values).eq("id", true).select("company_name").single());
    return { message: "Genel ayarlar kaydedildi." };
  });
}

/** Kur ayarları: birincil kaynak, TCMB kur türü, otomatik kontrol aralığı ve kurun en fazla yaşı. */
export async function saveFxSettings(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const values = {
      fx_primary_source: form.oneOf("fx_primary_source", "Kur kaynağı", ["TCMB", "FRANKFURTER"] as const),
      fx_tcmb_rate_type: form.oneOf("fx_tcmb_rate_type", "TCMB kur türü", ["ForexBuying", "ForexSelling"] as const),
      fx_refresh_minutes: form.int("fx_refresh_minutes", "Yenileme aralığı", { required: true, min: 5 }),
      fx_max_age_days: form.int("fx_max_age_days", "Kur geçerlilik süresi", { required: true, min: 0 }),
    };
    if (values.fx_refresh_minutes !== null && values.fx_refresh_minutes > 1440) form.errors.fx_refresh_minutes = "En fazla 1440 dakika.";
    if (values.fx_max_age_days !== null && values.fx_max_age_days > 30) form.errors.fx_max_age_days = "En fazla 30 gün.";
    form.assertValid();
    unwrap(await ctx.supabase.from("app_settings").update(values).eq("id", true).select("company_name").single());
    return { message: "Kur ayarları kaydedildi." };
  });
}

export async function refreshFxNow(formData: FormData) {
  return adminAction(formData, async (ctx) => {
    const result = await refreshFx(ctx, null, { force: true });
    if (!result.ok) throw new Error(result.message);
    return { message: result.message };
  });
}

export async function addManualRate(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const rate = form.decimal("rate", "Kur", { required: true, positive: true });
    const date = form.date("rate_date", "Kur tarihi", { required: true });
    const note = form.text("note", "Not", { max: 300 });
    form.assertValid();
    unwrap(await ctx.supabase.rpc("add_manual_fx_rate", { p_rate: rate, p_rate_date: date, p_note: note }));
    return { message: "Manuel kur kaydedildi." };
  });
}
