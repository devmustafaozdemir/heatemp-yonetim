"use client";

import { AlertTriangle, CheckCircle2, Info, Tag } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { ActionForm, FormField, SubmitButton } from "@/components/forms";
import { Badge, cx } from "@/components/ui";
import { fmtInt, fmtMoney, fmtPct, fmtRate, fmtUnitMoney } from "@/lib/format";
import { parseDecimal, parseInteger } from "@/lib/parse";
import type { Currency } from "@/lib/types";
import { saveQuoteItem } from "../actions";

export interface QuoteVariantOption {
  id: string;
  display_name: string;
  sale_price: number | null;
  currency: Currency;
  mekonsis_qty: number;
  /** Mekonsis rafındaki açık parti katmanları, FIFO sırasıyla: [kalan adet, birim maliyet TL] */
  layers: [number, number][];
  /** Stok yetmeyen kısım için son tamamlanan üretim partisinin birim maliyeti (TL) */
  fallback_cost_try: number | null;
}

export interface ExistingLine {
  quantity: number;
  unit_price: number;
}

interface Preview {
  listPrice: number | null;
  listCurrency: Currency;
  comparable: boolean;
  lineTotal: number | null;
  discountUnit: number | null;
  discountPct: number | null;
  available: number;
  shortage: number;
  revenueTry: number | null;
  costTry: number | null;
  costUnknown: boolean;
  profitTry: number | null;
  marginPct: number | null;
}

/**
 * quote_estimate ile aynı kural: Mekonsis rafındaki katmanlardan FIFO sırasıyla maliyet;
 * stok yetmeyen kısım son tamamlanan partinin birim maliyetiyle tahmin edilir.
 * Yalnız önizlemedir; kaydedilen kalemin değerleri sunucuda hesaplanır.
 */
function preview(v: QuoteVariantOption | undefined, qty: number | null, price: number | null, currency: Currency, fxRate: number | null): Preview | null {
  if (!v) return null;
  const q = qty !== null && Number.isFinite(qty) && qty > 0 ? qty : null;
  const p = price !== null && Number.isFinite(price) && price > 0 ? price : null;
  const comparable = v.sale_price !== null && v.sale_price > 0 && v.currency === currency;
  const discountUnit = comparable && p !== null ? v.sale_price! - p : null;
  const discountPct = comparable && p !== null ? ((v.sale_price! - p) / v.sale_price!) * 100 : null;
  const lineTotal = q !== null && p !== null ? q * p : null;
  let costTry: number | null = null;
  let shortage = 0;
  let costUnknown = false;
  if (q !== null) {
    let left = q;
    let cost = 0;
    for (const [layerQty, unitCost] of v.layers) {
      if (left <= 0) break;
      const take = Math.min(layerQty, left);
      cost += take * unitCost;
      left -= take;
    }
    shortage = left;
    if (left > 0) {
      if (v.fallback_cost_try === null) costUnknown = true;
      else cost += left * v.fallback_cost_try;
    }
    costTry = cost;
  }
  const revenueTry = lineTotal === null ? null : currency === "TRY" ? lineTotal : fxRate ? lineTotal * fxRate : null;
  const profitTry = revenueTry !== null && costTry !== null ? revenueTry - costTry : null;
  return {
    listPrice: v.sale_price,
    listCurrency: v.currency,
    comparable,
    lineTotal,
    discountUnit,
    discountPct,
    available: v.mekonsis_qty,
    shortage,
    revenueTry,
    costTry,
    costUnknown,
    profitTry,
    marginPct: profitTry !== null && revenueTry ? (profitTry / revenueTry) * 100 : null,
  };
}

function toInput(n: number) {
  return n.toLocaleString("tr-TR", { useGrouping: false, maximumFractionDigits: 4 });
}

export function QuoteItemForm({
  quoteId,
  currency,
  variants,
  fxRate,
  existing,
  fixedVariantId,
}: {
  quoteId: string;
  currency: Currency;
  variants: QuoteVariantOption[];
  /** Güncel USD/TRY kuru (tahmini TL ciro için); yoksa null */
  fxRate: number | null;
  /** Teklifte zaten bulunan kalemler (varyant → adet, fiyat) */
  existing: Record<string, ExistingLine>;
  /** Düzenleme penceresinde varyant sabittir */
  fixedVariantId?: string;
}) {
  const hintId = useId();
  const initial = fixedVariantId ? existing[fixedVariantId] : undefined;
  const [variantId, setVariantId] = useState(fixedVariantId ?? "");
  const [qty, setQty] = useState(initial ? String(initial.quantity) : "");
  const [price, setPrice] = useState(initial ? toInput(initial.unit_price) : "");
  const v = variants.find((x) => x.id === variantId);
  const isUpdate = !!variantId && !!existing[variantId];
  const pv = preview(v, parseInteger(qty), parseDecimal(price), currency, fxRate);

  function selectVariant(id: string) {
    setVariantId(id);
    const ex = existing[id];
    if (ex) {
      setQty(String(ex.quantity));
      setPrice(toInput(ex.unit_price));
    }
  }

  return (
    <ActionForm
      action={saveQuoteItem}
      onSuccess={() => {
        if (!fixedVariantId) {
          setVariantId("");
          setQty("");
          setPrice("");
        }
      }}
    >
      <input type="hidden" name="quote_id" value={quoteId} />
      <div className={cx("grid gap-4", fixedVariantId ? "grid-cols-1" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]")}>
        <div className="min-w-0">
          <div className={cx("grid grid-cols-1 gap-3", fixedVariantId ? "sm:grid-cols-2" : "sm:grid-cols-[minmax(0,1fr)_7rem_11rem]")}>
            {fixedVariantId ? (
              <div className="sm:col-span-2">
                <input type="hidden" name="variant_id" value={fixedVariantId} />
                <span className="label">Varyant</span>
                <p className="rounded-md border border-line bg-canvas px-3 py-2 text-sm font-medium text-ink">{v?.display_name ?? "—"}</p>
              </div>
            ) : (
              <FormField
                name="variant_id"
                label="Varyant"
                required
                hint={isUpdate ? "Bu varyant teklifte var; kaydedince mevcut satır güncellenir." : "Aynı varyant tekrar eklenirse satır güncellenir."}
              >
                <select className="input" name="variant_id" value={variantId} onChange={(e) => selectVariant(e.target.value)} required aria-required>
                  <option value="">Seçin…</option>
                  {variants.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.display_name}
                      {existing[x.id] ? " (teklifte)" : ""}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
            <FormField name="quantity" label="Adet" required>
              <input className="input text-right tabular-nums" name="quantity" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} required aria-required autoComplete="off" />
            </FormField>
            <FormField name="unit_price" label={`Özel birim fiyat (${currency})`} required>
              <input
                className="input text-right tabular-nums"
                name="unit_price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                aria-required
                aria-describedby={hintId}
                autoComplete="off"
              />
            </FormField>
          </div>
          <div id={hintId} className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            {v && pv?.comparable ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline"
                onClick={() => setPrice(toInput(v.sale_price!))}
              >
                <Tag className="size-3.5" aria-hidden />
                Liste fiyatını kullan ({fmtUnitMoney(v.sale_price, v.currency)})
              </button>
            ) : v && v.sale_price !== null ? (
              <span>
                Liste fiyatı {fmtUnitMoney(v.sale_price, v.currency)}; teklif {currency} olduğundan indirim hesaplanmaz.
              </span>
            ) : v ? (
              <span>Bu varyantın tanımlı liste fiyatı yok.</span>
            ) : (
              <span>Varyant seçince liste fiyatı, Mekonsis stoğu ve maliyet önizlemesi görünür.</span>
            )}
          </div>
          <div className="mt-4">
            <SubmitButton>Kalemi kaydet</SubmitButton>
          </div>
        </div>

        <PreviewPanel pv={pv} currency={currency} fxRate={fxRate} />
      </div>
    </ActionForm>
  );
}

function PreviewPanel({ pv, currency, fxRate }: { pv: Preview | null; currency: Currency; fxRate: number | null }) {
  const row = "flex items-baseline justify-between gap-3 py-1.5";
  return (
    <div className="min-w-0 rounded-md border border-line bg-canvas px-3.5 py-3" aria-live="polite">
      <p className="mb-1 text-xs font-semibold tracking-wide text-ink-soft uppercase">Kalem önizlemesi</p>
      {!pv ? (
        <p className="py-2 text-[13px] text-ink-muted">Varyant, adet ve özel fiyat girildikçe indirim, tutar ve tahmini kâr burada hesaplanır.</p>
      ) : (
        <dl className="divide-y divide-dashed divide-line text-[13px]">
          <div className={row}>
            <dt className="text-ink-muted">Liste fiyatı (birim)</dt>
            <dd className="font-medium text-ink tabular-nums">{pv.listPrice !== null ? fmtUnitMoney(pv.listPrice, pv.listCurrency) : "—"}</dd>
          </div>
          <div className={row}>
            <dt className="text-ink-muted">İndirim</dt>
            <dd className="text-right tabular-nums">
              {pv.discountUnit === null ? (
                <span className="text-ink-muted">—</span>
              ) : (
                <span className={cx("font-medium", pv.discountUnit < 0 ? "text-chart-sky" : "text-ink")}>
                  {pv.discountUnit < 0 ? "Listenin " : ""}
                  {fmtUnitMoney(Math.abs(pv.discountUnit), currency)}/adet · {fmtPct(Math.abs(pv.discountPct ?? 0))}
                  {pv.discountUnit < 0 ? " üstünde" : ""}
                </span>
              )}
            </dd>
          </div>
          <div className={row}>
            <dt className="text-ink-muted">Satır tutarı</dt>
            <dd className="font-semibold text-ink tabular-nums">{pv.lineTotal !== null ? fmtMoney(pv.lineTotal, currency) : "—"}</dd>
          </div>
          <div className={row}>
            <dt className="text-ink-muted">Mekonsis stoğu</dt>
            <dd className="text-right tabular-nums">
              {fmtInt(pv.available)} adet
              {pv.shortage > 0 ? (
                <span className="mt-1 flex justify-end">
                  <Badge tone="red" icon={AlertTriangle}>
                    {fmtInt(pv.shortage)} adet eksik
                  </Badge>
                </span>
              ) : pv.lineTotal !== null ? (
                <span className="mt-1 flex justify-end">
                  <Badge tone="green" icon={CheckCircle2}>
                    Yeterli
                  </Badge>
                </span>
              ) : null}
            </dd>
          </div>
          <div className={row}>
            <dt className="text-ink-muted">Tahmini ciro (₺)</dt>
            <dd className="tabular-nums">
              {pv.revenueTry !== null ? fmtMoney(pv.revenueTry, "TRY") : "—"}
              {currency === "USD" ? <span className="block text-right text-[11px] text-ink-muted">{fxRate ? `güncel kur ${fmtRate(fxRate)}` : "kur yok"}</span> : null}
            </dd>
          </div>
          <div className={row}>
            <dt className="text-ink-muted">Tahmini maliyet</dt>
            <dd className="text-right tabular-nums">
              {pv.costTry === null ? "—" : pv.costUnknown && pv.costTry === 0 ? "Bilinmiyor" : fmtMoney(pv.costTry, "TRY")}
              {pv.costUnknown ? <Warn>stokta olmayan {fmtInt(pv.shortage)} adedin maliyeti bilinmiyor</Warn> : null}
            </dd>
          </div>
          <div className={row}>
            <dt className="font-medium text-ink-soft">Tahmini brüt kâr</dt>
            <dd className="text-right tabular-nums">
              <span className={cx("font-semibold", pv.profitTry !== null && pv.profitTry < 0 ? "text-chart-red" : "text-ink")}>
                {pv.profitTry !== null ? fmtMoney(pv.profitTry, "TRY") : "—"}
              </span>
              {pv.marginPct !== null ? <span className="block text-[11px] text-ink-muted">marj {fmtPct(pv.marginPct)}</span> : null}
              {pv.costUnknown && pv.profitTry !== null ? <Warn>maliyet eksik; kâr fazla görünebilir</Warn> : null}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

/** Önizlemede küçük uyarı notu: amber ikon + metin (renk tek başına anlam taşımaz). */
function Warn({ children }: { children: ReactNode }) {
  return (
    <span className="mt-0.5 flex items-start justify-end gap-1 text-[11px] text-ink-soft">
      <Info className="mt-px size-3 shrink-0 text-chart-amber" aria-hidden />
      <span>{children}</span>
    </span>
  );
}
