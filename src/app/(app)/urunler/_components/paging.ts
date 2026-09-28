import { redirect } from "next/navigation";
import { hrefWith, type ListParams } from "@/lib/list-params";

/**
 * URL'deki sayfa numarası sonuç sayısını aşarsa PostgREST "Requested range not satisfiable"
 * döndürür. Bunu hata gibi göstermek yerine aynı filtrelerle ilk sayfaya yönlendirir.
 */
export function redirectIfPageOutOfRange(error: string | null, lp: ListParams, basePath: string, keep: Record<string, string> = {}) {
  if (error && lp.page > 1 && /range not satisfiable/i.test(error)) {
    redirect(hrefWith(basePath, { ...lp.values, ...keep }, { sayfa: null }));
  }
}
