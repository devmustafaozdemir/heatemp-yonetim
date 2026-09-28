"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { str } from "@/lib/parse";
import type { ActionState } from "@/lib/form";

export async function signIn(formData: FormData): Promise<ActionState> {
  const email = str(formData.get("email"));
  const password = str(formData.get("password"));
  if (!email || !password) {
    return { ok: false, message: "E-posta ve şifre girilmelidir." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const message = /invalid login credentials/i.test(error.message)
      ? "E-posta veya şifre hatalı."
      : /email not confirmed/i.test(error.message)
        ? "E-posta adresi henüz doğrulanmamış."
        : /fetch failed|network/i.test(error.message)
          ? "Kimlik doğrulama sunucusuna ulaşılamadı."
          : `Giriş yapılamadı: ${error.message}`;
    return { ok: false, message };
  }
  return { ok: true, message: null, redirectTo: "/" };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/giris");
}
