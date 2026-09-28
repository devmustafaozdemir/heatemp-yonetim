import { toUserMessage } from "@/lib/errors";

/**
 * Supabase sorgu sonucu: hata ile boş veri AYRI tutulur.
 * Kural: `data ?? []` ile hatayı yutmayın; `error` doluysa <ErrorState> gösterin.
 */
export interface Loaded<T> {
  data: T | null;
  error: string | null;
  count: number | null;
}

type PgResult<T> = { data: T | null; error: unknown; count?: number | null };

export async function load<T>(query: PromiseLike<PgResult<T>>): Promise<Loaded<T>> {
  try {
    const { data, error, count } = await query;
    if (error) return { data: null, error: toUserMessage(error), count: null };
    return { data: data ?? null, error: null, count: count ?? null };
  } catch (err) {
    return { data: null, error: toUserMessage(err), count: null };
  }
}

/** Sayfanın tamamı için vazgeçilmez veri: hata varsa error.tsx sınırına fırlatır. */
export async function must<T>(query: PromiseLike<PgResult<T>>, what: string): Promise<T> {
  const r = await load(query);
  if (r.error) throw new Error(`${what} yüklenemedi: ${r.error}`);
  return r.data as T;
}
