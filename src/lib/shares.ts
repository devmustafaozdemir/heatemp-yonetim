/**
 * Satış tutarının ortaklar arasındaki payı: Heatemp %66, Mekonsis %33; kalan %1 eşit
 * dağıtılır → Heatemp %66,5 · Mekonsis %33,5. Kuruş yuvarlaması Mekonsis payında kapanır
 * (iki pay her zaman toplamı verir).
 */
export const HEATEMP_SHARE = 0.665;
export const MEKONSIS_SHARE = 0.335;
export const SHARE_LABEL = { heatemp: "%66,5", mekonsis: "%33,5" } as const;

export function splitShares(total: number): { heatemp: number; mekonsis: number } {
  const heatemp = Math.round(total * HEATEMP_SHARE * 100) / 100;
  return { heatemp, mekonsis: Math.round((total - heatemp) * 100) / 100 };
}

export type KasaOwner = "genel" | "heatemp" | "mekonsis";

/** Kasa görünümleri: genel kasa ve ortakların payına düşen kasalar (tüm tutarlar payla çarpılır). */
export const KASA: Record<KasaOwner, { title: string; share: number; basePath: string; shareLabel: string | null }> = {
  genel: { title: "Kasa", share: 1, basePath: "/kasa", shareLabel: null },
  heatemp: { title: "Heatemp kasası", share: HEATEMP_SHARE, basePath: "/kasa/heatemp", shareLabel: SHARE_LABEL.heatemp },
  mekonsis: { title: "Mekonsis kasası", share: MEKONSIS_SHARE, basePath: "/kasa/mekonsis", shareLabel: SHARE_LABEL.mekonsis },
};

/** Satırdaki para alanlarını (…_try, …_usd) payla çarpar; adet ve oranlara dokunmaz. */
export function scaleMoney<T>(row: T, k: number): T {
  if (k === 1 || !row || typeof row !== "object") return row;
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const [key, v] of Object.entries(out)) {
    if (/_(try|usd)$/.test(key) && v !== null && v !== "" && typeof v !== "boolean" && !Number.isNaN(Number(v))) {
      out[key] = Number(v) * k;
    }
  }
  return out as T;
}
