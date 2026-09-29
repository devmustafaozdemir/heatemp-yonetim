import { redirect } from "next/navigation";
import { toUserMessage } from "@/lib/errors";
import { hrefWith, type ListParams } from "@/lib/list-params";

/**
 * Supabase sorgu sonucu: hata ile boş veri AYRI tutulur.
 * Kural: `data ?? []` ile hatayı yutmayın; `error` doluysa <ErrorState> gösterin.
 */
export interface Loaded<T> {
  data: T | null;
  error: string | null;
  count: number | null;
  /** PostgREST/Postgres hata kodu (ör. PGRST103: sayfa aralık dışında) */
  code?: string | null;
}

type PgResult<T> = { data: T | null; error: unknown; count?: number | null };

export async function load<T>(query: PromiseLike<PgResult<T>>): Promise<Loaded<T>> {
  try {
    const { data, error, count } = await query;
    if (error) return { data: null, error: toUserMessage(error), count: null, code: (error as { code?: string }).code ?? null };
    return { data: data ?? null, error: null, count: count ?? null, code: null };
  } catch (err) {
    return { data: null, error: toUserMessage(err), count: null, code: null };
  }
}

/** Sayfanın tamamı için vazgeçilmez veri: hata varsa error.tsx sınırına fırlatır. */
export async function must<T>(query: PromiseLike<PgResult<T>>, what: string): Promise<T> {
  const r = await load(query);
  if (r.error) throw new Error(`${what} yüklenemedi: ${r.error}`);
  return r.data as T;
}

/** Sayfa numarası sonuç sayısını aştı mı (PostgREST 416 / PGRST103)? */
export function isOutOfRange(r: Loaded<unknown>): boolean {
  return r.code === "PGRST103";
}

/**
 * Sayfalı liste sorgusu aralık dışına düştüyse (eski yer imi, filtre sonrası azalan sonuç)
 * aynı filtrelerle ilk sayfaya yönlendirir; hata olarak gösterilmez.
 */
export function redirectIfOutOfRange(r: Loaded<unknown>, lp: ListParams, basePath: string, hash?: string) {
  if (isOutOfRange(r) && lp.page > 1) {
    redirect(hrefWith(basePath, lp.values, { sayfa: null }) + (hash ? `#${hash}` : ""));
  }
}
