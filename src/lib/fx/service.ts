import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import type { AuthContext } from "@/lib/auth";
import { fetchFrankfurter, fetchTcmb, type FetchedRate, type TcmbRateType } from "@/lib/fx/sources";
import { toUserMessage } from "@/lib/errors";
import { todayTr } from "@/lib/format";

export interface FxSuggestion {
  id: number;
  rate: number;
  rate_date: string;
  source: "TCMB" | "FRANKFURTER" | "MANUAL";
  rate_type: string;
  fetched_at: string;
  age_days: number;
  is_valid: boolean;
  max_age_days: number;
}

export interface FxSettings {
  fx_primary_source: "TCMB" | "FRANKFURTER";
  fx_tcmb_rate_type: TcmbRateType;
  fx_refresh_minutes: number;
  fx_max_age_days: number;
}

export async function getFxSettings(ctx: AuthContext): Promise<FxSettings> {
  const { data } = await ctx.supabase
    .from("app_settings")
    .select("fx_primary_source, fx_tcmb_rate_type, fx_refresh_minutes, fx_max_age_days")
    .single();
  return (
    (data as FxSettings | null) ?? {
      fx_primary_source: "TCMB",
      fx_tcmb_rate_type: "ForexBuying",
      fx_refresh_minutes: 60,
      fx_max_age_days: 4,
    }
  );
}

export async function suggestFx(ctx: AuthContext, date: string | null): Promise<FxSuggestion | null> {
  const { data, error } = await ctx.supabase.rpc("fx_rate_for_date", { p_date: date });
  if (error) throw new Error(toUserMessage(error));
  const row = (Array.isArray(data) ? data[0] : data) as FxSuggestion | undefined;
  return row ? { ...row, rate: Number(row.rate) } : null;
}

/** Kaynakları sırayla dener; ilk başarılı sonucu döndürür. */
async function fetchFromSources(settings: FxSettings, date: string | null): Promise<{ rate: FetchedRate | null; errors: string[] }> {
  const order = settings.fx_primary_source === "TCMB" ? ["TCMB", "FRANKFURTER"] : ["FRANKFURTER", "TCMB"];
  const errors: string[] = [];
  for (const source of order) {
    try {
      const rate =
        source === "TCMB" ? await fetchTcmb(date, settings.fx_tcmb_rate_type) : await fetchFrankfurter(date);
      return { rate, errors };
    } catch (err) {
      errors.push(`${source}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { rate: null, errors };
}

export interface RefreshResult {
  ok: boolean;
  stored?: FetchedRate;
  message: string;
}

// Aynı sunucu örneğinde başarısız denemeleri sık tekrarlamamak için.
const lastAttempt = new Map<string, number>();

/**
 * Otomatik kuru sunucu tarafında alır ve service role ile kaydeder.
 * Service role anahtarı yoksa veya servisler erişilemezse açık bir mesaj döner;
 * hiçbir durumda sabit/uydurma kur kullanılmaz.
 */
export async function refreshFx(ctx: AuthContext, date: string | null, { force = false } = {}): Promise<RefreshResult> {
  const service = createServiceClient();
  if (!service) {
    return {
      ok: false,
      message:
        "Otomatik kur kaydı için sunucuda SUPABASE_SERVICE_ROLE_KEY tanımlı değil. Yönetici manuel kur girebilir.",
    };
  }
  const key = date ?? "today";
  const settings = await getFxSettings(ctx);
  const now = Date.now();
  if (!force && now - (lastAttempt.get(key) ?? 0) < 5 * 60_000) {
    return { ok: false, message: "Kur servisi kısa süre önce denendi." };
  }
  lastAttempt.set(key, now);

  const { rate, errors } = await fetchFromSources(settings, date);
  if (!rate) {
    return { ok: false, message: `Otomatik kur alınamadı (${errors.join("; ")}).` };
  }
  const { error } = await service.rpc("record_auto_fx_rate", {
    p_source: rate.source,
    p_rate_type: rate.rateType,
    p_rate: rate.rate,
    p_rate_date: rate.rateDate,
    p_raw: rate.raw,
  });
  if (error) return { ok: false, message: `Kur kaydedilemedi: ${toUserMessage(error)}` };
  lastAttempt.delete(key);
  return { ok: true, stored: rate, message: `${rate.source} kuru alındı (${rate.rateDate}).` };
}

/**
 * Sayfa yüklenirken çağrılır: son otomatik kontrol ayarlanan süreden eskiyse
 * bugünün kurunu almayı dener. Hata sayfayı durdurmaz.
 */
export async function ensureFreshFx(ctx: AuthContext): Promise<{ suggestion: FxSuggestion | null; warning: string | null }> {
  let warning: string | null = null;
  try {
    const settings = await getFxSettings(ctx);
    const { data } = await ctx.supabase
      .from("fx_rates")
      .select("last_checked_at")
      .neq("source", "MANUAL")
      .order("last_checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const last = data?.last_checked_at ? new Date(data.last_checked_at).getTime() : 0;
    if (Date.now() - last > settings.fx_refresh_minutes * 60_000) {
      const r = await refreshFx(ctx, null);
      if (!r.ok && !r.message.includes("kısa süre önce")) warning = r.message;
    }
  } catch (err) {
    warning = err instanceof Error ? err.message : String(err);
  }
  const suggestion = await suggestFx(ctx, null).catch(() => null);
  return { suggestion, warning };
}

/** İşlem tarihi için kur: önce veritabanı, geçerli değilse o tarih için servisten dener. */
export async function fxForDate(ctx: AuthContext, date: string): Promise<{ suggestion: FxSuggestion | null; message: string | null }> {
  let suggestion = await suggestFx(ctx, date);
  let message: string | null = null;
  if (!suggestion || !suggestion.is_valid) {
    const r = await refreshFx(ctx, date === todayTr() ? null : date, { force: true });
    if (!r.ok) message = r.message;
    suggestion = await suggestFx(ctx, date);
  }
  return { suggestion, message };
}
