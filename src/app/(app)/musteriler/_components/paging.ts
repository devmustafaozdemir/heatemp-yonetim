import { redirect } from "next/navigation";
import { hrefWith, type ListParams } from "@/lib/list-params";

/**
 * URL'deki sayfa numarası sonuç sayısını aşarsa PostgREST "Requested range not satisfiable"
 * döndürür. Bunu hata gibi göstermek yerine aynı filtrelerle ilk sayfaya yönlendirir.
 */
export function redirectIfPageOutOfRange(error: string | null, lp: ListParams, basePath: string, values: Record<string, string>) {
  if (error && lp.page > 1 && /range not satisfiable/i.test(error)) {
    redirect(hrefWith(basePath, values, { sayfa: null }));
  }
}

/** İki YYYY-AA-GG tarihi arasındaki gün farkı (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
