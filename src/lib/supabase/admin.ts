import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/env";

/**
 * Service role istemcisi — YALNIZCA sunucuda ve yalnızca otomatik kur kaydı
 * için kullanılır (public.record_auto_fx_rate). Bu anahtar tarayıcıya asla
 * gönderilmez; NEXT_PUBLIC_ öneki yoktur.
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!key) return null;
  return createClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
