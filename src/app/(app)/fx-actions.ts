"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext, requireAdminForAction } from "@/lib/auth";
import { toUserMessage } from "@/lib/errors";
import { fxForDate, type FxSuggestion } from "@/lib/fx/service";
import { isIsoDate, parseDecimal } from "@/lib/parse";

export interface FxLookupResult {
  suggestion: FxSuggestion | null;
  message: string | null;
}

/** İşlem tarihi için kullanılacak kuru bulur (gerekirse servisten alır). */
export async function lookupFx(date: string): Promise<FxLookupResult> {
  if (!isIsoDate(date)) return { suggestion: null, message: "Geçerli bir tarih seçin." };
  const ctx = await getAuthContext();
  if (!ctx?.role) return { suggestion: null, message: "Oturumunuz sona ermiş." };
  try {
    return await fxForDate(ctx, date);
  } catch (err) {
    return { suggestion: null, message: toUserMessage(err) };
  }
}

/** Yetkili manuel kur girişi. */
export async function saveManualFx(date: string, rawRate: string, note?: string): Promise<FxLookupResult> {
  try {
    const ctx = await requireAdminForAction();
    if (!isIsoDate(date)) return { suggestion: null, message: "Geçerli bir kur tarihi seçin." };
    const rate = parseDecimal(rawRate);
    if (rate === null || Number.isNaN(rate) || rate <= 0) {
      return { suggestion: null, message: "Kur sıfırdan büyük bir sayı olmalıdır (ör. 41,2345)." };
    }
    const { data: id, error } = await ctx.supabase.rpc("add_manual_fx_rate", {
      p_rate: rate,
      p_rate_date: date,
      p_note: note ?? null,
    });
    if (error) return { suggestion: null, message: toUserMessage(error) };
    revalidatePath("/", "layout");
    // Yönetici bu tarih için kuru açıkça girdi: işlemde bu kayıt kullanılır.
    const { data: row } = await ctx.supabase
      .from("fx_rates")
      .select("id, rate, rate_date, source, rate_type, fetched_at")
      .eq("id", id)
      .single();
    const { data: settings } = await ctx.supabase.from("app_settings").select("fx_max_age_days").single();
    if (!row) return { suggestion: null, message: "Kur kaydedildi ancak okunamadı; sayfayı yenileyin." };
    return {
      suggestion: {
        ...row,
        rate: Number(row.rate),
        age_days: 0,
        is_valid: true,
        max_age_days: settings?.fx_max_age_days ?? 4,
      } as FxSuggestion,
      message: null,
    };
  } catch (err) {
    return { suggestion: null, message: toUserMessage(err) };
  }
}
