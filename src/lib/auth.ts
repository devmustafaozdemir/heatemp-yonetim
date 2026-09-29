import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type AppRole = "admin" | "viewer";

export interface AuthContext {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  email: string | null;
  role: AppRole | null;
}

/** İstek başına bir kez: oturum sahibi ve uygulama rolü. */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) return null;
  const { data: appUser, error: roleError } = await supabase.from("app_users").select("role").eq("user_id", sub).maybeSingle();
  // Rol okunamadıysa "yetkisiz" sayfasına göndermek yanıltıcı olur: hata olarak yükselt.
  if (roleError) throw new Error(`Kullanıcı yetkisi okunamadı: ${roleError.message}`);
  return {
    supabase,
    userId: sub,
    email: (data.claims.email as string | undefined) ?? null,
    role: (appUser?.role as AppRole | undefined) ?? null,
  };
});

/** Sayfalar için: giriş ve uygulama üyeliği zorunlu. */
export async function requireMember(): Promise<AuthContext & { role: AppRole }> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/giris");
  if (!ctx.role) redirect("/giris/yetkisiz");
  return ctx as AuthContext & { role: AppRole };
}

export class NotAuthorizedError extends Error {}

/**
 * Server Action'lar için: yönetici değilse hata. (Veritabanı da ayrıca
 * kontrol eder; bu kontrol kullanıcıya erken ve anlaşılır mesaj içindir.)
 */
export async function requireAdminForAction(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new NotAuthorizedError("Oturumunuz sona ermiş. Lütfen yeniden giriş yapın.");
  if (ctx.role !== "admin") throw new NotAuthorizedError("Bu işlem için yönetici yetkisi gerekir.");
  return ctx;
}
