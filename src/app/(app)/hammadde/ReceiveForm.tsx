"use client";

import { Info } from "lucide-react";
import { useState } from "react";
import { ActionForm, FieldError, FormField, SubmitButton } from "@/components/forms";
import { FxRateField } from "@/components/FxRateField";
import { Alert, FormSection, cx } from "@/components/ui";
import { fmtMoney, fmtNum, fmtRate, fmtUnitMoney } from "@/lib/format";
import type { FxSuggestion } from "@/lib/fx/service";
import { parseDecimal } from "@/lib/parse";
import type { SupplierOption, Unit } from "@/lib/types";
import { SupplierSelect } from "./_components/SupplierSelect";
import { VatFields } from "./_components/VatFields";
import type { MaterialOption } from "./_components/types";
import { receiveMaterial } from "./actions";

type Cur = "USD" | "TRY";

/**
 * Hammadde alışı (stok girişi): miktar + birim + birim fiyat (USD/TRY) + işlem günü kuru.
 * `material` verilirse malzeme sabittir (detay sayfası, satır işlemi); `materials`
 * verilirse formun başında malzeme seçilir (liste sayfası, ?islem=giris).
 * Toplam tutar ve TL karşılığı seçilen kurla canlı hesaplanır; kayıt receive_material ile yapılır.
 */
export function ReceiveForm({
  material,
  materials,
  initialMaterialId,
  units,
  suppliers,
  today,
}: {
  material?: MaterialOption;
  materials?: MaterialOption[];
  initialMaterialId?: string;
  /** Tüm birimler; seçilen malzemenin birim türüne göre süzülür. */
  units: Unit[];
  /** Tedarikçi seçimi (aktif olanlar listelenir) */
  suppliers: SupplierOption[];
  today: string;
}) {
  const initial = material ?? materials?.find((m) => m.id === initialMaterialId) ?? null;
  const [materialId, setMaterialId] = useState(initial?.id ?? "");
  const selected = material ?? materials?.find((m) => m.id === materialId) ?? null;
  const [unit, setUnit] = useState(initial?.display_unit ?? "");
  const [date, setDate] = useState(today);
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<Cur>("USD");
  const [fx, setFx] = useState<FxSuggestion | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [note, setNote] = useState("");
  const [vatKey, setVatKey] = useState(0);

  const unitOptions = selected ? units.filter((u) => u.kind === selected.unit_kind) : [];
  const unitInfo = unitOptions.find((u) => u.code === unit) ?? null;

  const q = parseDecimal(qty);
  const p = parseDecimal(price);
  const qOk = q !== null && !Number.isNaN(q) && q > 0;
  const pOk = p !== null && !Number.isNaN(p) && p > 0;
  const total = qOk && pOk ? q * p : null;
  const rate = fx ? Number(fx.rate) : null;
  const totalTry = total !== null && rate ? (currency === "TRY" ? total : total * rate) : null;
  const totalUsd = total !== null && rate ? (currency === "USD" ? total : total / rate) : null;

  // Alış sonrası stok ve yeni ağırlıklı ortalama (önizleme; kesin değer veritabanında hesaplanır).
  const addBase = qOk && unitInfo ? q * Number(unitInfo.factor_to_base) : null;
  const afterQtyDisplay = selected && addBase !== null ? (selected.qty + addBase) / selected.display_factor : null;
  const newAvgTry =
    selected && addBase !== null && totalTry !== null && selected.qty + addBase > 0
      ? ((selected.value_try + totalTry) / (selected.qty + addBase)) * selected.display_factor
      : null;

  function pickMaterial(id: string) {
    setMaterialId(id);
    const m = materials?.find((x) => x.id === id);
    setUnit(m?.display_unit ?? "");
  }

  return (
    <ActionForm
      action={receiveMaterial}
      onSuccess={() => {
        // Seçimler (malzeme, birim, para birimi, tarih) korunur; tutar alanları temizlenir.
        setQty("");
        setPrice("");
        setSupplierId("");
        setNote("");
        setVatKey((k) => k + 1);
      }}
      className="@container"
    >
      {material ? <input type="hidden" name="material_id" value={material.id} /> : null}
      <div className="grid gap-5">
        {materials ? (
          <FormSection title="Malzeme">
            <FormField name="material_id" label="Malzeme" required>
              <select className="input" name="material_id" value={materialId} onChange={(e) => pickMaterial(e.target.value)} aria-required>
                <option value="">Malzeme seçin…</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.code})
                  </option>
                ))}
              </select>
            </FormField>
            {selected ? <StockLine m={selected} /> : null}
          </FormSection>
        ) : null}

        <FormSection
          title="Miktar ve fiyat"
          description="Birim fiyat, seçtiğiniz birimin bir birimi içindir; toplam tutar miktar × birim fiyattır."
        >
          <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
            <div className="grid grid-cols-2 gap-3">
              <FormField name="qty" label="Miktar" required>
                <input
                  className="input tabular-nums"
                  name="qty"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  aria-required
                />
              </FormField>
              <FormField name="unit" label="Birim" required>
                <select
                  className="input"
                  name="unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  disabled={!selected}
                  aria-required
                >
                  {!selected ? <option value="">—</option> : null}
                  {unitOptions.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-3 @sm:grid-cols-[minmax(0,1fr)_6.5rem]">
              <FormField name="unit_price" label="Birim fiyat (seçilen birim başına)" required>
                <input
                  className="input tabular-nums"
                  name="unit_price"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0,00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  aria-required
                />
              </FormField>
              <FormField name="currency" label="Para birimi" required>
                <select
                  className="input"
                  name="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as Cur)}
                  aria-required
                >
                  <option value="USD">USD</option>
                  <option value="TRY">TRY</option>
                </select>
              </FormField>
            </div>
          </div>
        </FormSection>

        <FormSection
          title="Tarih ve işlem kuru"
          description="Alış, seçilen günün kuruyla TL ve USD olarak sabitlenir; sonradan gelen kur bu kaydı değiştirmez."
        >
          <div className="grid grid-cols-1 gap-3 @md:grid-cols-[11rem_minmax(0,1fr)]">
            <FormField name="received_on" label="Alış tarihi" required>
              <input
                className="input"
                type="date"
                name="received_on"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
                aria-required
              />
            </FormField>
            <div className="min-w-0">
              <FxRateField date={date} canManual onChange={setFx} />
              <FieldError name="fx_rate_id" />
            </div>
          </div>
        </FormSection>

        <FormSection title="KDV" description="KDV maliyete eklenmez; tedarikçiye ödenen tutarda gösterilir.">
          <VatFields key={`${selected?.id ?? ""}-${vatKey}`} total={total} currency={currency} defaultRate={selected?.vat_rate ?? 20} />
        </FormSection>

        <FormSection title="Tedarikçi ve not">
          <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
            <SupplierSelect suppliers={suppliers} value={supplierId} onChange={setSupplierId} />
            <FormField name="note" label="Not">
              <input
                className="input"
                name="note"
                maxLength={500}
                placeholder="ör. fatura no, parti bilgisi"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </FormField>
          </div>
        </FormSection>

        <div className="overflow-hidden rounded-md border border-line bg-line">
          <dl className="grid grid-cols-2 gap-px @3xl:grid-cols-4">
            <SummaryItem
              label="Toplam tutar"
              value={total !== null ? fmtMoney(total, currency) : "—"}
              hint={
                total !== null ? `${fmtNum(q, 4)} ${unitInfo?.code ?? ""} × ${fmtUnitMoney(p, currency)}` : "Miktar ve birim fiyat girin"
              }
              strong
            />
            <SummaryItem
              label={currency === "USD" ? "TL karşılığı" : "USD karşılığı"}
              value={
                currency === "USD"
                  ? totalTry !== null
                    ? fmtMoney(totalTry, "TRY")
                    : "—"
                  : totalUsd !== null
                    ? fmtMoney(totalUsd, "USD")
                    : "—"
              }
              hint={rate ? `1 USD = ${fmtRate(rate)} TL (işlem kuru)` : "Geçerli işlem kuru gerekli"}
            />
            <SummaryItem
              label="Alış sonrası stok"
              value={afterQtyDisplay !== null && selected ? `${fmtNum(afterQtyDisplay, 3)} ${selected.display_unit}` : "—"}
              hint={selected ? `Şu an ${fmtNum(selected.qty_display, 3)} ${selected.display_unit}` : "Malzeme seçin"}
            />
            <SummaryItem
              label="Yeni ort. maliyet (tahmini)"
              value={newAvgTry !== null && selected ? `${fmtUnitMoney(newAvgTry, "TRY")} / ${selected.display_unit}` : "—"}
              hint={
                selected?.avg_cost_try_display != null
                  ? `Şu an ${fmtUnitMoney(selected.avg_cost_try_display, "TRY")} / ${selected.display_unit}`
                  : "Henüz ortalama maliyet yok"
              }
            />
          </dl>
        </div>

        {!fx ? (
          <Alert tone="warning">
            Kaydetmek için alış tarihine ait geçerli bir işlem kuru gerekir. Kur yoksa “Manuel kur gir” ile ekleyin.
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Info className="size-3.5 shrink-0" aria-hidden />
            Stok ve ağırlıklı ortalama maliyet kayıtla birlikte güncellenir.
          </p>
          <SubmitButton disabled={!fx || !selected}>Alışı kaydet</SubmitButton>
        </div>
      </div>
    </ActionForm>
  );
}

function StockLine({ m }: { m: MaterialOption }) {
  return (
    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-muted">
      <span>
        Mevcut:{" "}
        <strong className="font-semibold text-ink-soft tabular-nums">
          {fmtNum(m.qty_display, 3)} {m.display_unit}
        </strong>
      </span>
      <span>
        Ort. maliyet:{" "}
        <strong className="font-semibold text-ink-soft tabular-nums">
          {m.avg_cost_try_display !== null ? `${fmtUnitMoney(m.avg_cost_try_display, "TRY")} / ${m.display_unit}` : "—"}
        </strong>
      </span>
    </p>
  );
}

function SummaryItem({ label, value, hint, strong = false }: { label: string; value: string; hint: string; strong?: boolean }) {
  return (
    <div className={cx("min-w-0 px-3 py-2.5", strong ? "bg-brand-50" : "bg-white")}>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd
        className={cx("mt-0.5 font-semibold break-words tabular-nums", strong ? "text-lg text-brand-700" : "text-[15px] text-ink")}
        aria-live={strong ? "polite" : undefined}
      >
        {value}
      </dd>
      <dd className="mt-0.5 text-xs text-ink-muted">
        {hint}
      </dd>
    </div>
  );
}
