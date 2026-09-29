import { load, type Loaded } from "@/lib/query";

type PgResult<T> = { data: T | null; error: unknown; count?: number | null };

/**
 * Sayfalanmış sorgu: sayfa numarası sonuç sayısını aşınca PostgREST 416 (PGRST103,
 * "Requested range not satisfiable") döner. Bu durum hata olarak gösterilmez;
 * `outOfRange` ile ayrılır ve sayfa son geçerli sayfaya yönlendirilir.
 * Diğer tüm hatalar load() ile olduğu gibi Türkçe mesaja çevrilir.
 */
export async function loadPage<T>(query: PromiseLike<PgResult<T>>): Promise<Loaded<T> & { outOfRange: boolean }> {
  let raw: PgResult<T>;
  try {
    raw = await query;
  } catch (err) {
    raw = { data: null, error: err, count: null };
  }
  if ((raw.error as { code?: string } | null)?.code === "PGRST103") {
    return { data: null, error: null, count: null, outOfRange: true };
  }
  return { ...(await load(Promise.resolve(raw))), outOfRange: false };
}

/** Toplam kayıt sayısına göre son geçerli sayfa (en az 1). */
export function lastPageOf(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}
