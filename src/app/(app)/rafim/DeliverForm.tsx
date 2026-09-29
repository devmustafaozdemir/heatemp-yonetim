"use client";

import { ArrowRight, Info, Store, Warehouse } from "lucide-react";
import { useState } from "react";
import { ActionForm, FormField, SubmitButton } from "@/components/forms";
import { BatchStatusBadge } from "@/components/status";
import { Alert, Button, cx, FormSection, RequiredMark, TableWrap } from "@/components/ui";
import { useDialog } from "@/components/ui/dialog";
import { fmtDate, fmtInt, fmtMoney, fmtUnitMoney } from "@/lib/format";
import { parseInteger } from "@/lib/parse";
import type { DeliverOption } from "./_components/types";
import { deliverToMekonsis } from "./actions";

export type { DeliverOption } from "./_components/types";

/** Pozitif tam sayı değilse null (sunucuyla aynı ayrıştırma). */
function parseQty(text: string): number | null {
  const n = parseInteger(text);
  return n !== null && Number.isFinite(n) && n > 0 ? n : null;
}

/** En eski partiden başlayarak adedi partilere dağıtır (önizleme). */
function fifoPlan<T extends { qty: number }>(batches: T[], qty: number): (T & { take: number })[] {
  const out: (T & { take: number })[] = [];
  let left = qty;
  for (const b of batches) {
    const take = Math.min(b.qty, left);
    left -= take;
    out.push({ ...b, take });
  }
  return out;
}

/**
 * Heatemp → Mekonsis teslimat formu. Kaynak stok, gönderilecek adet ve işlem sonrası
 * raf miktarları canlı gösterilir; FIFO ile hangi partilerden düşüleceği önizlenir.
 * Kesin dağılımı kayıt anında veritabanı yapar (deliver_to_mekonsis).
 */
export function DeliverForm({ options, today, initialVariant }: { options: DeliverOption[]; today: string; initialVariant?: string }) {
  const dialog = useDialog();
  const [variantId, setVariantId] = useState(
    initialVariant && options.some((o) => o.variant_id === initialVariant) ? initialVariant : (options[0]?.variant_id ?? ""),
  );
  const [batchId, setBatchId] = useState("");
  const [qtyText, setQtyText] = useState("");
  const [date, setDate] = useState(today);

  const option = options.find((o) => o.variant_id === variantId);
  const scoped = (option?.batches ?? []).filter((b) => !batchId || b.batch_id === batchId);
  const asOfDate = scoped.filter((b) => !date || b.received_on <= date);
  const maxAll = scoped.reduce((s, b) => s + b.qty, 0);
  const max = asOfDate.reduce((s, b) => s + b.qty, 0);
  const qty = parseQty(qtyText);
  const over = qty !== null && qty > max;

  // FIFO önizlemesi: en eski partiden başlayarak (tarih sırası)
  const plan = fifoPlan(asOfDate, qty !== null && !over ? qty : 0);
  const planCost = plan.reduce((s, p) => s + p.take * p.unit_cost_try, 0);
  const sending = qty !== null && !over ? qty : 0;
  const heatempAfter = (option?.available ?? 0) - sending;
  const mekonsisNow = option?.mekonsis_qty ?? null;
  const mekonsisAfter = mekonsisNow === null ? null : mekonsisNow + sending;
  const laterBatches = maxAll - max;

  return (
    <ActionForm action={deliverToMekonsis}>
      <div className="space-y-5">
        <FormSection
          title="Kaynak stok — Heatemp rafı"
          description="Yalnız Heatemp rafında duran tamamlanmış partilerden teslim edilebilir."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField name="variant_id" label="Ürün / varyant" required className="sm:col-span-2">
              <select
                className="input"
                name="variant_id"
                value={variantId}
                required
                onChange={(e) => {
                  setVariantId(e.target.value);
                  setBatchId("");
                }}
              >
                {options.map((o) => (
                  <option key={o.variant_id} value={o.variant_id}>
                    {o.display_name} — rafta {fmtInt(o.available)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField name="batch_id" label="Parti" hint="Boş bırakılırsa en eski partiden başlanır.">
              <select className="input" name="batch_id" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                <option value="">Otomatik (en eski önce)</option>
                {option?.batches.map((b) => (
                  <option key={b.batch_id} value={b.batch_id}>
                    {b.batch_no} — {fmtInt(b.qty)} adet ({fmtDate(b.received_on)}){b.opening ? " · açılış stoğu" : ""}
                  </option>
                ))}
              </select>
            </FormField>
            <div className="min-w-0">
              <span className="label">Heatemp&apos;te mevcut</span>
              <div className="flex h-[38px] items-center gap-2 rounded-md border border-line bg-canvas px-3 text-sm">
                <Warehouse className="size-4 shrink-0 text-brand-600" aria-hidden />
                <span className="font-semibold text-ink tabular-nums">{fmtInt(option?.available ?? 0)} adet</span>
                <span className="truncate text-xs text-ink-muted" title={`${fmtInt(option?.batches.length ?? 0)} parti`}>
                  · {fmtInt(option?.batches.length ?? 0)} parti
                </span>
              </div>
            </div>
          </div>
        </FormSection>

        <FormSection title="Teslimat">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              name="quantity"
              label={
                <>
                  Adet
                  <RequiredMark /> <span className="font-normal text-ink-muted">(en fazla {fmtInt(max)})</span>
                </>
              }
              hint={
                laterBatches > 0
                  ? `${fmtInt(laterBatches)} adet, seçilen tarihten sonra rafa girdiği için bu tarihte teslim edilemez.`
                  : "Gönderilecek adet (tam sayı)."
              }
            >
              <input
                className="input"
                name="quantity"
                inputMode="numeric"
                autoComplete="off"
                required
                aria-required
                aria-invalid={over || undefined}
                value={qtyText}
                onChange={(e) => setQtyText(e.target.value)}
              />
            </FormField>
            <FormField name="delivered_on" label="Teslimat tarihi" required hint="Gelecek tarih girilemez.">
              <input
                className="input"
                type="date"
                name="delivered_on"
                value={date}
                max={today}
                required
                aria-required
                onChange={(e) => setDate(e.target.value)}
              />
            </FormField>
            <FormField name="note" label="Not" className="sm:col-span-2" hint="İsteğe bağlı (ör. irsaliye no).">
              <input className="input" name="note" maxLength={500} />
            </FormField>
          </div>
          {over ? (
            <Alert tone="warning" className="mt-3">
              Heatemp rafında {date ? `${fmtDate(date)} itibarıyla ` : ""}
              {batchId ? "seçilen partide " : ""}en fazla {fmtInt(max)} adet var; {fmtInt(qty)} adet teslim edilemez.
            </Alert>
          ) : null}
        </FormSection>

        <section aria-labelledby="teslimat-sonrasi" className="rounded-md border border-line">
          <h3 id="teslimat-sonrasi" className="border-b border-line bg-canvas/60 px-3 py-2 text-[13px] font-semibold text-ink">
            İşlem sonrası raflar
          </h3>
          <dl className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="min-w-0 px-3 py-2.5">
              <dt className="flex items-center gap-1.5 text-xs text-ink-muted">
                <Warehouse className="size-3.5 text-brand-600" aria-hidden />
                Heatemp&apos;te kalan
              </dt>
              <dd className="mt-1 flex flex-wrap items-baseline gap-1.5 tabular-nums">
                <span className="text-xs text-ink-muted">{fmtInt(option?.available ?? 0)}</span>
                <ArrowRight className="size-3.5 self-center text-ink-muted" aria-label="sonra" />
                <span className="text-[15px] font-semibold text-ink">{fmtInt(heatempAfter)}</span>
                <span className="text-xs text-ink-muted">adet</span>
              </dd>
            </div>
            <div className="min-w-0 px-3 py-2.5">
              <dt className="flex items-center gap-1.5 text-xs text-ink-muted">
                <Store className="size-3.5 text-chart-teal" aria-hidden />
                Mekonsis yeni toplam
              </dt>
              <dd className="mt-1 flex flex-wrap items-baseline gap-1.5 tabular-nums">
                {mekonsisNow === null ? (
                  <span className="text-xs text-ink-muted">Mekonsis rafı yüklenemedi</span>
                ) : (
                  <>
                    <span className="text-xs text-ink-muted">{fmtInt(mekonsisNow)}</span>
                    <ArrowRight className="size-3.5 self-center text-ink-muted" aria-label="sonra" />
                    <span className="text-[15px] font-semibold text-ink">{fmtInt(mekonsisAfter)}</span>
                    <span className="text-xs text-ink-muted">adet</span>
                  </>
                )}
              </dd>
            </div>
            <div className="min-w-0 px-3 py-2.5">
              <dt className="text-xs text-ink-muted">Taşınan maliyet (tahmini, TL)</dt>
              <dd className="mt-1 text-[15px] font-semibold text-ink tabular-nums">{sending ? fmtMoney(planCost, "TRY") : "—"}</dd>
            </div>
          </dl>
          <div className="border-t border-line">
            <p className="px-3 pt-2.5 text-xs font-medium text-ink-soft">
              {batchId ? "Seçilen partiden düşülecek" : "Düşülecek partiler (en eski önce)"}
            </p>
            {plan.length === 0 ? (
              <p className="px-3 pt-1 pb-3 text-xs text-ink-muted">Seçilen tarihte bu varyant için Heatemp rafında parti yok.</p>
            ) : (
              <TableWrap className="mt-1.5">
                <table className="table-base table-compact">
                  <thead>
                    <tr>
                      <th>Parti</th>
                      <th className="hidden sm:table-cell">Rafa giriş</th>
                      <th className="num hidden sm:table-cell">Mevcut</th>
                      <th className="num">Düşülecek</th>
                      <th className="num">Kalacak</th>
                      <th className="num hidden sm:table-cell">Birim maliyet (TL)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.map((p) => (
                      <tr key={p.batch_id} className={cx(p.take === 0 && sending > 0 && "text-ink-muted")}>
                        <td>
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                            <span className="code">{p.batch_no}</span>
                            {p.opening ? <BatchStatusBadge status="completed" kind="opening" /> : null}
                          </div>
                          <span className="block text-[11px] text-ink-muted sm:hidden">
                            {fmtInt(p.qty)} mevcut · giriş {fmtDate(p.received_on)}
                          </span>
                          <span className="block text-[11px] text-ink-muted sm:hidden">{fmtUnitMoney(p.unit_cost_try, "TRY")}/adet</span>
                        </td>
                        <td className="hidden whitespace-nowrap sm:table-cell">{fmtDate(p.received_on)}</td>
                        <td className="num hidden sm:table-cell">{fmtInt(p.qty)}</td>
                        <td className={cx("num", p.take > 0 && "font-semibold text-ink")}>{p.take > 0 ? fmtInt(p.take) : "—"}</td>
                        <td className="num">{fmtInt(p.qty - p.take)}</td>
                        <td className="num hidden sm:table-cell">{fmtUnitMoney(p.unit_cost_try, "TRY")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
            <p className="flex items-start gap-1.5 border-t border-line px-3 py-2 text-xs text-ink-muted">
              <Info className="mt-px size-3.5 shrink-0" aria-hidden />
              Önizlemedir; kesin dağılım kayıt anında aynı kuralla (rafa giriş tarihi, sonra kayıt sırası) yapılır.
            </p>
          </div>
        </section>

        <Alert tone="info" title="Teslimat satış değildir">
          Ciro, tahsilat veya kâr oluşmaz. Ürünler Mekonsis rafında satılana kadar Heatemp&apos;in varlığıdır; parti kimliği ve birim
          maliyeti korunur.
        </Alert>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        {dialog ? (
          <Button type="button" variant="secondary" onClick={dialog.close}>
            Vazgeç
          </Button>
        ) : null}
        <SubmitButton disabled={!variantId || over}>Mekonsis&apos;e teslim et</SubmitButton>
      </div>
    </ActionForm>
  );
}
