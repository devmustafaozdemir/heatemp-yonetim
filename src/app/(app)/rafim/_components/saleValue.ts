import "server-only";
import type { AuthContext } from "@/lib/auth";
import { suggestFx } from "@/lib/fx/service";
import { load } from "@/lib/query";
import type { ShelfGroup } from "./types";

export interface ShelfSaleSummary {
  /** USD fiyatlı ürünlerin satış değeri (USD) */
  usd: number;
  /** TL fiyatlı ürünlerin satış değeri (TL) */
  try: number;
  /** Tümünün TL karşılığı (güncel otomatik kurla); kur yoksa null */
  totalTry: number | null;
  rate: number | null;
  rateDate: string | null;
  /** Satış fiyatı tanımsız varyant ve adet */
  unpricedVariants: number;
  unpricedQty: number;
}

/**
 * Raftaki stoğun satış değeri: kalan adet × varyantın satış fiyatı (liste fiyatı, KDV hariç).
 * USD fiyatlar güncel otomatik kurla TL'ye çevrilir; maliyet değerinden bağımsız, bilgi amaçlıdır.
 */
export async function withSaleValues(
  ctx: AuthContext,
  groups: ShelfGroup[],
): Promise<{ groups: ShelfGroup[]; summary: ShelfSaleSummary | null; error: string | null }> {
  const ids = [...new Set(groups.filter((g) => g.remaining > 0).map((g) => g.variant_id))];
  if (ids.length === 0) {
    return { groups, summary: { usd: 0, try: 0, totalTry: 0, rate: null, rateDate: null, unpricedVariants: 0, unpricedQty: 0 }, error: null };
  }
  const [prices, fx] = await Promise.all([
    load(
      ctx.supabase
        .from("v_variants")
        .select("id, sale_price, currency")
        .in("id", ids)
        .returns<{ id: string; sale_price: number | null; currency: "USD" | "TRY" | null }[]>(),
    ),
    suggestFx(ctx, null).catch(() => null),
  ]);
  if (prices.error) return { groups, summary: null, error: prices.error };
  const priceBy = new Map((prices.data ?? []).map((p) => [p.id, p]));
  const rate = fx ? Number(fx.rate) : null;
  const summary: ShelfSaleSummary = {
    usd: 0,
    try: 0,
    totalTry: 0,
    rate,
    rateDate: fx?.rate_date ?? null,
    unpricedVariants: 0,
    unpricedQty: 0,
  };
  const out = groups.map((g) => {
    const p = priceBy.get(g.variant_id);
    if (!p || p.sale_price === null || !p.currency) {
      if (g.remaining > 0) {
        summary.unpricedVariants += 1;
        summary.unpricedQty += g.remaining;
      }
      return { ...g, sale: null };
    }
    const amount = Math.round(g.remaining * Number(p.sale_price) * 100) / 100;
    if (p.currency === "USD") summary.usd += amount;
    else summary.try += amount;
    const tl = p.currency === "TRY" ? amount : rate ? Math.round(amount * rate * 100) / 100 : null;
    return { ...g, sale: { amount, currency: p.currency, try: tl } };
  });
  summary.totalTry = rate !== null || summary.usd === 0 ? summary.try + summary.usd * (rate ?? 0) : null;
  return { groups: out, summary, error: null };
}
