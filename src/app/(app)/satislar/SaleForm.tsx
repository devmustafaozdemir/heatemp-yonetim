"use client";

import { AlertCircle, AlertTriangle, Calculator, Plus, Split, Store, Tag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ActionForm, FormField, SubmitButton } from "@/components/forms";
import { FxRateField } from "@/components/FxRateField";
import { Alert, Badge, Button, buttonClass, Card, cx, FormSection, RequiredMark } from "@/components/ui";
import { fmtDate, fmtInt, fmtMoney, fmtRate, fmtUnitMoney } from "@/lib/format";
import type { ActionState } from "@/lib/form";
import type { FxSuggestion } from "@/lib/fx/service";
import { parseDecimal, parseInteger } from "@/lib/parse";
import type { Currency } from "@/lib/types";
import { fmtRatio, fmtRatioSigned } from "./_components/fmt";
import { recordSale } from "./actions";
import { SHARE_LABEL, splitShares } from "@/lib/shares";

export interface SaleVariantOption {
  variant_id: string;
  display_name: string;
  variant_code: string;
  /** Mekonsis rafındaki güncel adet */
  available: number;
  sale_price: number | null;
  currency: Currency;
}

/** Mekonsis rafındaki açık parti katmanı (FIFO sırasıyla: received_on, fifo_seq). */
export interface FifoLayer {
  variant_id: string;
  batch_no: string;
  batch_kind: "production" | "opening";
  received_on: string;
  fifo_seq: number;
  qty_remaining: number;
  unit_cost_try: number;
}

interface Row {
  key: number;
  variant_id: string;
  quantity: string;
  unit_price: string;
  /** Fiyat liste fiyatından otomatik dolduruldu (kullanıcı yazmadı) */
  auto: boolean;
  /** Para birimi fiyat girildikten sonra değişti; fiyat kontrol edilmeli */
  check: boolean;
}

/** Başarısız son gönderim: hata metinleri ve o anki kalemler (hangi satırın düzeltildiğini anlamak için). */
interface Attempt {
  message: string | null;
  fieldErrors: Record<string, string>;
  rows: { key: number; sig: string }[];
  /** Gönderimden sonra formda değişiklik yapıldı mı */
  edited: boolean;
}

const rowSig = (r: Row) => `${r.variant_id}|${r.quantity}|${r.unit_price}`;

type RowField = "variant" | "quantity" | "price";

/** Sunucudaki recordSale kalem kurallarının aynısı (aynı sıra ve metin); hatalı alanı da döndürür. */
function rowProblem(r: Row, index: number, known: boolean): { field: RowField; message: string } | null {
  const n = index + 1;
  if (!r.variant_id || !known) return { field: "variant", message: `${n}. kalem: varyant seçin.` };
  const q = parseInteger(r.quantity);
  if (q === null || Number.isNaN(q) || q <= 0) return { field: "quantity", message: `${n}. kalem: adet sıfırdan büyük tam sayı olmalıdır.` };
  const p = parseDecimal(r.unit_price);
  if (p === null || Number.isNaN(p) || p <= 0) return { field: "price", message: `${n}. kalem: birim satış fiyatı sıfırdan büyük olmalıdır.` };
  return null;
}

/**
 * record_sale ile aynı sıra: satış tarihine kadar rafa girmiş katmanlar, en eskiden başlayarak.
 * Aynı partinin birden çok katmanı (farklı teslimatlar) tek satırda toplanır.
 */
function fifoPreview(layers: FifoLayer[], qty: number) {
  let left = qty;
  let cost = 0;
  const taken: { batch_no: string; kind: FifoLayer["batch_kind"]; qty: number }[] = [];
  for (const l of layers) {
    if (left <= 0) break;
    const take = Math.min(l.qty_remaining, left);
    if (take <= 0) continue;
    const same = taken.find((t) => t.batch_no === l.batch_no);
    if (same) same.qty += take;
    else taken.push({ batch_no: l.batch_no, kind: l.batch_kind, qty: take });
    cost += take * l.unit_cost_try;
    left -= take;
  }
  return { taken, cost, allocated: qty - left };
}

const nf = (n: number) => String(n).replace(".", ",");

export function SaleForm({
  variants,
  layers,
  layersError,
  customers,
  today,
  defaultCustomerId = "",
  defaultVariantId = "",
}: {
  variants: SaleVariantOption[];
  layers: FifoLayer[];
  /** Katmanlar yüklenemediyse tahmini maliyet önizlemesi gösterilmez */
  layersError: string | null;
  customers: { id: string; name: string }[];
  today: string;
  defaultCustomerId?: string;
  defaultVariantId?: string;
}) {
  const byId = new Map(variants.map((v) => [v.variant_id, v]));
  const initialVariant = byId.get(defaultVariantId);
  const [date, setDate] = useState(today);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [fx, setFx] = useState<FxSuggestion | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [rows, setRows] = useState<Row[]>([
    {
      key: 1,
      variant_id: initialVariant?.variant_id ?? "",
      quantity: "",
      unit_price: initialVariant?.sale_price && initialVariant.currency === "USD" ? nf(initialVariant.sale_price) : "",
      auto: !!(initialVariant?.sale_price && initialVariant.currency === "USD"),
      check: false,
    },
  ]);

  // Satış tarihine kadar rafa girmiş katmanlar. Tarih boşsa tarih kısıtı uygulanmaz (güncel raf).
  const layersByVariant = new Map<string, FifoLayer[]>();
  for (const l of layers) {
    if (date && l.received_on > date) continue;
    layersByVariant.set(l.variant_id, [...(layersByVariant.get(l.variant_id) ?? []), l]);
  }

  /** Başarısız gönderimden sonra yapılan ilk değişiklik: genel hata metni artık formu yansıtmayabilir. */
  function touch() {
    setAttempt((a) => (a && !a.edited ? { ...a, edited: true } : a));
  }

  /**
   * ActionForm'a verilen işlem: sunucu hatası formun en altında değil, "Satış özeti" kartında kaydet
   * düğmesinin üstünde gösterilir; kalem hataları kalem düzeltilince kalkar.
   */
  async function submit(formData: FormData): Promise<ActionState> {
    const snapshot = rows.map((r) => ({ key: r.key, sig: rowSig(r) }));
    let result: ActionState;
    try {
      result = await recordSale(formData);
    } catch {
      result = { ok: false, message: "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin." };
    }
    if (result.ok) {
      setAttempt(null);
      return result;
    }
    setAttempt({ message: result.message, fieldErrors: result.fieldErrors ?? {}, rows: snapshot, edited: false });
    // Alan hataları (satış tarihi vb.) ActionForm üzerinden alanların yanında kalır; genel metni burada gösteririz.
    return { ...result, message: null };
  }

  function update(key: number, patch: Partial<Row>) {
    touch();
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        // Elle yazılan fiyat artık otomatik değildir ve kontrol edilmiş sayılır.
        if (patch.unit_price !== undefined) {
          next.auto = false;
          next.check = false;
        }
        // Varyant değişince boş veya otomatik doldurulmuş fiyat yeni varyantın liste fiyatıyla güncellenir;
        // para birimi uyarısı eski varyantın fiyatına aitti, kalkar.
        if (patch.variant_id !== undefined && (!r.unit_price || r.auto)) {
          next.check = false;
          const v = byId.get(patch.variant_id);
          if (v?.sale_price && v.currency === currency) {
            next.unit_price = nf(v.sale_price);
            next.auto = true;
          } else if (r.auto) {
            next.unit_price = "";
            next.auto = false;
          }
        }
        return next;
      }),
    );
  }

  /**
   * Para birimi değişince: liste fiyatından gelen fiyatlar yeni para birimindeki liste fiyatıyla
   * yenilenir, karşılığı yoksa silinir; elle yazılan fiyatlar korunur ama kontrol için işaretlenir
   * (ör. 50 USD'nin sessizce ₺50 olarak kaydedilmesini önler).
   */
  function changeCurrency(next: Currency) {
    if (next === currency) return;
    touch();
    setCurrency(next);
    setRows((rs) =>
      rs.map((r) => {
        if (r.unit_price && !r.auto) return { ...r, check: true };
        const v = byId.get(r.variant_id);
        if (v?.sale_price && v.currency === next) return { ...r, unit_price: nf(v.sale_price), auto: true, check: false };
        // Liste fiyatı yeni para biriminde değilse otomatik fiyat silinir (kurla sessizce çevrilmez).
        return { ...r, unit_price: "", auto: false, check: r.auto };
      }),
    );
  }

  // Tarih silinirse FxRateField yeni kur aramaz; eski tarihin kuru kullanılmaz.
  const activeFx = date ? fx : null;
  const rate = activeFx?.rate ?? null;
  const toTry = (amount: number) => (currency === "TRY" ? amount : rate ? amount * rate : null);

  const lines = rows.map((r, index) => {
    const v = byId.get(r.variant_id);
    const q = parseDecimal(r.quantity);
    const p = parseDecimal(r.unit_price);
    const qty = q !== null && !Number.isNaN(q) && q > 0 ? q : null;
    const price = p !== null && !Number.isNaN(p) && p > 0 ? p : null;
    const total = qty !== null && price !== null ? qty * price : null;
    const dated = v ? (layersByVariant.get(v.variant_id) ?? []) : [];
    const atDate = dated.reduce((s, l) => s + l.qty_remaining, 0);
    // Katmanlar yüklenemediyse veya satış tarihi seçilmediyse güncel raf adediyle kontrol et
    const available = layersError || !date ? (v?.available ?? 0) : atDate;
    const dateLimited = !!v && !!date && !layersError && atDate < v.available;
    const over = !!v && qty !== null && qty > available;
    const preview = v && qty !== null && !layersError ? fifoPreview(dated, Math.floor(qty)) : null;
    const revenueTry = total !== null ? toTry(total) : null;
    // Liste fiyatı karşılaştırması (aynı para birimi; değilse işlem kuruyla çevrilir)
    let list: number | null = null;
    let listConverted = false;
    if (v?.sale_price) {
      if (v.currency === currency) list = v.sale_price;
      else if (rate) {
        list = currency === "TRY" ? v.sale_price * rate : v.sale_price / rate;
        listConverted = true;
      }
    }
    const listDiff = list && price !== null ? ((price - list) / list) * 100 : null;
    // Kalem hatası: yalnız başarısız gönderimde yer alan kalemler için. Kurallar canlı denetlenir
    // (düzeltilen kalemin hatası kalkar); sunucunun başka bir hatası yalnız kalem değişmediyse kalır.
    let error: { field: RowField | null; message: string } | null = null;
    const sent = attempt ? attempt.rows.findIndex((s) => s.key === r.key) : -1;
    if (attempt && sent >= 0) {
      error = rowProblem(r, index, !!v);
      const server = attempt.fieldErrors[`items.${sent}`];
      if (!error && server && sent === index && attempt.rows[sent].sig === rowSig(r)) error = { field: null, message: server };
    }
    return { ...r, v, qty, price, total, available, atDate, dateLimited, over, preview, revenueTry, list, listConverted, listDiff, error };
  });

  const filled = lines.filter((l) => l.v && l.total !== null);
  const total = lines.reduce((s, l) => s + (l.total ?? 0), 0);
  const totalQty = lines.reduce((s, l) => s + (l.v && l.qty ? l.qty : 0), 0);
  const totalTry = toTry(total);
  const anyOver = lines.some((l) => l.over);
  const listLines = filled.filter((l) => l.list !== null);
  const listTotal = listLines.reduce((s, l) => s + (l.list ?? 0) * (l.qty ?? 0), 0);
  const listActual = listLines.reduce((s, l) => s + (l.total ?? 0), 0);
  const chosen = new Set(rows.map((r) => r.variant_id).filter(Boolean));
  const anyCheck = rows.some((r) => r.check);
  // Onay penceresi yalnız form eksiksizken açılır; eksik alanlarda önce sunucu doğrulaması alan hatalarını gösterir.
  const complete =
    !!activeFx &&
    !anyOver &&
    chosen.size === rows.length &&
    lines.every((l) => l.v && l.qty !== null && Number.isInteger(l.qty) && l.price !== null);

  // Son başarısız gönderimin hataları: yalnız hâlâ geçerli olanlar gösterilir.
  const fe = attempt?.fieldErrors ?? {};
  const itemsError = fe.items && !attempt?.edited ? fe.items : null;
  const fxError = fe.fx_rate_id && !activeFx ? fe.fx_rate_id : null;
  // Tarih, para birimi, müşteri, açıklama hataları alan yanında bir sonraki gönderime kadar görünür.
  const otherErrors = Object.keys(fe).some((k) => k !== "items" && k !== "fx_rate_id" && !k.startsWith("items."));
  const anyVisibleError = lines.some((l) => l.error) || !!itemsError || !!fxError || otherErrors;
  const serverMessage =
    attempt?.message && (Object.keys(fe).length > 0 ? anyVisibleError : !attempt.edited) ? attempt.message : null;

  return (
    <ActionForm action={submit} confirmMessage={complete ? "Satış kaydedilsin mi? Ürünler Mekonsis rafından düşülecek." : undefined}>
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(rows.map((r) => ({ variant_id: r.variant_id, quantity: r.quantity, unit_price: r.unit_price })))}
      />
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-4">
          <Card title="Satış bilgileri" description="Satış tarihi işlem kurunu belirler; kur satışta sabitlenir.">
            <div className="grid gap-5">
              <FormSection title="Tarih ve kur">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <FormField
                    name="sold_on"
                    label="Satış tarihi"
                    required
                    hint={date ? undefined : "Satış tarihi seçin."}
                  >
                    <input
                      className="input"
                      type="date"
                      name="sold_on"
                      value={date}
                      max={today}
                      onChange={(e) => {
                        touch();
                        setDate(e.target.value);
                      }}
                      required
                      aria-required="true"
                    />
                  </FormField>
                  <FormField name="currency" label="Para birimi" required hint="Satış fiyatlarının para birimi">
                    <select
                      className="input"
                      name="currency"
                      value={currency}
                      onChange={(e) => changeCurrency(e.target.value as Currency)}
                      required
                      aria-required="true"
                    >
                      <option value="USD">USD</option>
                      <option value="TRY">TRY</option>
                    </select>
                  </FormField>
                  <div className="min-w-0 sm:col-span-2">
                    <FxRateField date={date} canManual onChange={setFx} />
                    {fxError ? (
                      <span className="field-error" role="alert">
                        <AlertCircle className="size-3.5" aria-hidden />
                        {fxError}
                      </span>
                    ) : null}
                  </div>
                </div>
              </FormSection>
              <div className="border-t border-line pt-4">
                <FormSection title="Müşteri">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                    <FormField name="customer_id" label="Kurumsal müşteri" hint="Boş bırakılırsa perakende / belirtilmemiş satış olarak kaydedilir.">
                      <select className="input" name="customer_id" defaultValue={defaultCustomerId} onChange={touch}>
                        <option value="">Perakende / belirtilmemiş</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField name="note" label="Açıklama" hint="İsteğe bağlı; fatura no, kanal vb.">
                      <input className="input" name="note" maxLength={1000} onChange={touch} />
                    </FormField>
                  </div>
                </FormSection>
              </div>
            </div>
          </Card>

          <Card
            title="Kalemler"
            description="Satış yalnız Mekonsis rafındaki stoktan yapılır. Her kalemde gerçek adet ve gerçek birim fiyatı girin."
            actions={
              <Button
                type="button"
                size="sm"
                variant="soft"
                disabled={rows.length >= variants.length}
                onClick={() => {
                  touch();
                  setRows((rs) => [
                    ...rs,
                    { key: Math.max(...rs.map((r) => r.key)) + 1, variant_id: "", quantity: "", unit_price: "", auto: false, check: false },
                  ]);
                }}
              >
                <Plus aria-hidden />
                Kalem ekle
              </Button>
            }
          >
            {itemsError ? (
              <p className="field-error mb-3" role="alert">
                <AlertCircle className="size-3.5" aria-hidden />
                {itemsError}
              </p>
            ) : null}
            <div className="space-y-3">
              {lines.map((l, i) => (
                <div key={l.key} className={cx("rounded-md border", l.over ? "border-chart-red/40" : "border-line")}>
                  <div className="flex items-center justify-between gap-2 border-b border-line bg-canvas/60 px-3 py-1.5">
                    <span className="flex min-w-0 items-baseline gap-2 text-xs">
                      <span className="shrink-0 font-semibold text-ink-soft">Kalem {i + 1}</span>
                      {l.v ? (
                        <span className="min-w-0 truncate text-ink-soft" title={`${l.v.display_name} (${l.v.variant_code})`}>
                          {l.v.display_name} <span className="font-mono text-ink-muted">{l.v.variant_code}</span>
                        </span>
                      ) : null}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-ink-muted hover:text-chart-red"
                      aria-label={`${i + 1}. kalemi sil`}
                      disabled={rows.length === 1}
                      onClick={() => {
                        touch();
                        setRows((rs) => rs.filter((r) => r.key !== l.key));
                      }}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 p-3 lg:grid-cols-12">
                    <label className="col-span-2 block min-w-0 lg:col-span-5">
                      <span className="label">
                        Varyant
                        <RequiredMark />
                      </span>
                      <select
                        className="input"
                        value={l.variant_id}
                        onChange={(e) => update(l.key, { variant_id: e.target.value })}
                        required
                        aria-required="true"
                        aria-invalid={l.error?.field === "variant" || undefined}
                        aria-describedby={l.error?.field === "variant" ? `kalem-${l.key}-hata` : undefined}
                      >
                        <option value="">Seçin…</option>
                        {variants.map((v) => (
                          <option key={v.variant_id} value={v.variant_id} disabled={v.variant_id !== l.variant_id && chosen.has(v.variant_id)}>
                            {v.display_name} — Mekonsis&apos;te {fmtInt(v.available)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block min-w-0 lg:col-span-2">
                      <span className="label">
                        Adet
                        <RequiredMark />
                      </span>
                      <input
                        className="input text-right tabular-nums"
                        inputMode="numeric"
                        value={l.quantity}
                        onChange={(e) => update(l.key, { quantity: e.target.value })}
                        aria-invalid={l.over || l.error?.field === "quantity" || undefined}
                        aria-describedby={l.error?.field === "quantity" ? `kalem-${l.key}-hata` : undefined}
                        required
                        aria-required="true"
                      />
                    </label>
                    <label className="block min-w-0 lg:col-span-3">
                      <span className="label">
                        Gerçek birim fiyat<span className="sr-only"> ({currency})</span>
                        <RequiredMark />
                      </span>
                      <span className="relative block">
                        <input
                          className="input pr-12 text-right tabular-nums"
                          inputMode="decimal"
                          value={l.unit_price}
                          onChange={(e) => update(l.key, { unit_price: e.target.value })}
                          aria-invalid={l.error?.field === "price" || undefined}
                          aria-describedby={l.error?.field === "price" ? `kalem-${l.key}-hata` : undefined}
                          required
                          aria-required="true"
                        />
                        <span
                          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-ink-muted"
                          aria-hidden
                        >
                          {currency}
                        </span>
                      </span>
                    </label>
                    <div className="col-span-2 min-w-0 lg:col-span-2">
                      <span className="label">Satır tutarı</span>
                      <output
                        className="flex h-[38px] items-center justify-end rounded-md bg-canvas px-3 text-sm font-semibold text-ink tabular-nums"
                        aria-live="polite"
                      >
                        {l.total !== null ? fmtMoney(l.total, currency) : "—"}
                      </output>
                    </div>
                  </div>
                  {l.v ? (
                    <div className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-dashed border-line px-3 py-2 text-xs text-ink-soft">
                      <span className="inline-flex items-center gap-1.5">
                        <Store className="size-3.5 text-ink-muted" aria-hidden />
                        Mekonsis rafı: <strong className="font-semibold text-ink tabular-nums">{fmtInt(l.v.available)} adet</strong>
                        {!date ? (
                          <span className="text-ink-muted">(güncel; satış tarihi seçin)</span>
                        ) : !layersError && l.atDate !== l.v.available ? (
                          <span className="text-ink-muted">
                            ({fmtDate(date)} itibarıyla {fmtInt(l.atDate)})
                          </span>
                        ) : null}
                      </span>
                      {l.v.sale_price ? (
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          <Tag className="size-3.5 text-ink-muted" aria-hidden />
                          Liste fiyatı: <strong className="font-semibold text-ink tabular-nums">{fmtUnitMoney(l.v.sale_price, l.v.currency)}</strong>
                          {l.listConverted && l.list ? (
                            <span className="text-ink-muted tabular-nums">(≈ {fmtUnitMoney(l.list, currency)} işlem kuruyla)</span>
                          ) : null}
                          {l.listDiff !== null ? (
                            Math.abs(l.listDiff) < 0.005 ? (
                              <Badge tone="gray">liste fiyatında</Badge>
                            ) : l.listDiff < 0 ? (
                              <Badge tone="amber">{fmtRatio(Math.abs(l.listDiff))} indirimli</Badge>
                            ) : (
                              <Badge tone="green">{fmtRatio(l.listDiff)} üstünde</Badge>
                            )
                          ) : null}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-ink-muted">
                          <Tag className="size-3.5" aria-hidden />
                          Tanımlı liste fiyatı yok
                        </span>
                      )}
                      {l.total !== null && l.total > 0 ? (
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          <Split className="size-3.5 text-ink-muted" aria-hidden />
                          Heatemp {SHARE_LABEL.heatemp}:{" "}
                          <strong className="font-semibold text-ink tabular-nums">{fmtMoney(splitShares(l.total).heatemp, currency)}</strong>
                          <span className="text-ink-muted">·</span>
                          Mekonsis {SHARE_LABEL.mekonsis}:{" "}
                          <strong className="font-semibold text-ink tabular-nums">{fmtMoney(splitShares(l.total).mekonsis, currency)}</strong>
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {l.over ? (
                    <p className="field-error px-3 pb-2.5" role="alert">
                      <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                      {l.dateLimited
                        ? `Satış tarihi (${fmtDate(date)}) itibarıyla Mekonsis rafında yalnızca ${fmtInt(l.available)} adet var; sonraki teslimatlar bu satışta kullanılamaz.`
                        : `Mekonsis rafında yalnızca ${fmtInt(l.available)} adet var.`}
                    </p>
                  ) : null}
                  {l.check ? (
                    <p className="flex items-start gap-1.5 px-3 pb-2.5 text-xs font-medium text-ink-soft" role="status">
                      <AlertTriangle className="mt-px size-3.5 shrink-0 text-chart-amber" aria-hidden />
                      <span className="min-w-0">
                        {l.unit_price
                          ? `Para birimi ${currency} olarak değişti; birim fiyatın ${currency} cinsinden doğru olduğunu kontrol edin.`
                          : `Para birimi ${currency} olarak değişti; liste fiyatından gelen fiyat silindi. Birim fiyatı ${currency} olarak girin.`}
                        {l.unit_price ? (
                          <button
                            type="button"
                            className="link ml-2"
                            onClick={() => {
                              touch();
                              setRows((rs) => rs.map((r) => (r.key === l.key ? { ...r, check: false } : r)));
                            }}
                          >
                            Fiyat doğru
                          </button>
                        ) : null}
                      </span>
                    </p>
                  ) : null}
                  {l.error ? (
                    <p id={`kalem-${l.key}-hata`} className="field-error px-3 pb-2.5" role="alert">
                      <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                      {l.error.message}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-18">
          <Card title="Satış özeti" icon={Calculator}>
            <dl className="grid grid-cols-2 gap-3 border-b border-line pb-3 text-[13px]">
              <div>
                <dt className="text-xs text-ink-muted">Kalem</dt>
                <dd className="mt-0.5 text-[15px] font-semibold text-ink tabular-nums">{fmtInt(filled.length)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Toplam miktar</dt>
                <dd className="mt-0.5 text-[15px] font-semibold text-ink tabular-nums">{fmtInt(totalQty)} adet</dd>
              </div>
            </dl>
            <div className="border-b border-line py-3">
              <p className="text-xs text-ink-muted">Toplam satış tutarı</p>
              <p className="mt-1 text-[22px] leading-none font-semibold text-ink tabular-nums">{fmtMoney(total, currency)}</p>
              {currency === "USD" ? (
                <p className="mt-1.5 text-xs text-ink-muted">
                  TL karşılığı (ciro önizlemesi):{" "}
                  <span className="font-medium text-ink-soft tabular-nums">{rate ? fmtMoney(totalTry, "TRY") : "kur bekleniyor"}</span>
                  {rate ? <span className="tabular-nums"> · kur {fmtRate(rate)}</span> : null}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-ink-muted">
                  USD karşılığı:{" "}
                  <span className="font-medium text-ink-soft tabular-nums">{rate ? fmtMoney(total / rate, "USD") : "kur bekleniyor"}</span>
                </p>
              )}
              {listLines.length > 0 && listTotal > 0 ? (
                <p className="mt-1 text-xs text-ink-muted">
                  Liste fiyatıyla: <span className="tabular-nums">{fmtMoney(listTotal, currency)}</span> · fark{" "}
                  <span className="font-medium text-ink-soft tabular-nums">
                    {fmtMoney(listActual - listTotal, currency)} ({fmtRatioSigned(((listActual - listTotal) / listTotal) * 100)})
                  </span>
                </p>
              ) : null}
            </div>
            <dl className="space-y-1.5 py-3 text-[13px]">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">Ciro (TL, önizleme)</dt>
                <dd className="font-medium text-ink tabular-nums">{totalTry !== null ? fmtMoney(totalTry, "TRY") : "—"}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2">
                <dt className="font-semibold text-ink">Heatemp payı ({SHARE_LABEL.heatemp})</dt>
                <dd className="text-[15px] font-semibold text-ink tabular-nums">{fmtMoney(splitShares(total).heatemp, currency)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="font-semibold text-ink">Mekonsis payı ({SHARE_LABEL.mekonsis})</dt>
                <dd className="text-[15px] font-semibold text-ink tabular-nums">{fmtMoney(splitShares(total).mekonsis, currency)}</dd>
              </div>
            </dl>
            <p className="mb-3 text-xs text-ink-muted">
              Satış tutarı Heatemp {SHARE_LABEL.heatemp} · Mekonsis {SHARE_LABEL.mekonsis} olarak paylaşılır (%66 + %33, kalan %1 eşit
              dağıtılır). Kesin ciro kayıt sırasında satış günü kuruyla hesaplanır.
            </p>
            {anyOver ? (
              <Alert tone="error" className="mb-3">
                Bazı kalemlerde Mekonsis stoğu yetersiz. Adetleri düzeltmeden satış kaydedilemez.
              </Alert>
            ) : null}
            {anyCheck ? (
              <Alert tone="warning" className="mb-3">
                Para birimi değişti; işaretli kalemlerin birim fiyatlarını {currency} olarak kontrol edin.
              </Alert>
            ) : null}
            {!date ? (
              <Alert tone="warning" className="mb-3">
                Satış tarihi seçin. Raf adedi, işlem kuru ve tahmini maliyet satış tarihine göre hesaplanır.
              </Alert>
            ) : !activeFx ? (
              <Alert tone="warning" className="mb-3">
                Geçerli bir işlem kuru olmadan satış kaydedilemez.
              </Alert>
            ) : null}
            {serverMessage ? (
              <Alert tone="error" title="Satış kaydedilemedi" className="mb-3">
                {serverMessage}
              </Alert>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <SubmitButton disabled={!activeFx || anyOver}>Satışı kaydet</SubmitButton>
              <Link href="/satislar" className={buttonClass("ghost")}>
                Vazgeç
              </Link>
            </div>
          </Card>
        </aside>
      </div>
    </ActionForm>
  );
}
