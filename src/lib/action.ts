import "server-only";
import { revalidatePath } from "next/cache";
import { requireAdminForAction, type AuthContext } from "@/lib/auth";
import { toUserMessage } from "@/lib/errors";
import { FormReader, ValidationError, type ActionState } from "@/lib/form";

/**
 * Yönetici işlemlerini tek kalıpta çalıştırır: yetki kontrolü, doğrulama,
 * Türkçe hata mesajı ve ekranların yenilenmesi.
 */
export async function adminAction(
  formData: FormData,
  run: (ctx: AuthContext, form: FormReader) => Promise<Partial<ActionState> | void>,
): Promise<ActionState> {
  try {
    const ctx = await requireAdminForAction();
    const form = new FormReader(formData);
    const result = await run(ctx, form);
    revalidatePath("/", "layout");
    return { ok: true, message: "Kaydedildi.", ...result };
  } catch (err) {
    if (err instanceof ValidationError) {
      return { ok: false, message: err.message, fieldErrors: err.fieldErrors };
    }
    return { ok: false, message: toUserMessage(err) };
  }
}

/**
 * Supabase yanıtındaki hatayı fırlatır (adminAction yakalayıp Türkçeleştirir).
 * .single() gibi hata yoksa veri döndüren çağrılarda sonucu non-null kabul eder.
 */
export function unwrap<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw result.error;
  return result.data as NonNullable<T>;
}
