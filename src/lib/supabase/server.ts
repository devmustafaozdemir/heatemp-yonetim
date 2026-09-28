import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublicKey, supabaseUrl } from "@/lib/env";

/**
 * Oturum sahibinin yetkileriyle çalışan Supabase istemcisi.
 * Tüm okuma/yazma işlemleri RLS ve veritabanı fonksiyonlarındaki yetki
 * kontrollerinden geçer.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabasePublicKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component içinden çağrıldığında çerez yazılamaz; oturum
          // yenilemesini proxy.ts üstlenir.
        }
      },
    },
  });
}
