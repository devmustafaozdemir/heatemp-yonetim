"use client";

import { useState } from "react";
import { FormField } from "@/components/forms";
import { fmtMoney } from "@/lib/format";
import { parseDecimal } from "@/lib/parse";

const RATES = [0, 1, 10, 20];

/**
 * Alış KDV'si: oran (malzemeden önerilir) ve KDV tutarı. Tutar oran × toplamdan hesaplanır;
 * faturadaki tutar farklıysa elle yazılabilir. KDV maliyete girmez.
 */
export function VatFields({
  total,
  currency,
  defaultRate,
  initialAmount = null,
}: {
  /** KDV hariç toplam (alış para biriminde) */
  total: number | null;
  currency: string;
  defaultRate: number;
  /** Düzenlemede kayıtlı KDV tutarı */
  initialAmount?: number | null;
}) {
  const [rate, setRate] = useState(String(defaultRate));
  const r = Number(rate);
  const auto = (t: number | null, rr: number) => (t !== null && Number.isFinite(rr) ? Math.round(t * rr) / 100 : null);
  const initialAuto = auto(total, defaultRate);
  const [touched, setTouched] = useState(initialAmount !== null && (initialAuto === null || Math.abs(initialAmount - initialAuto) > 0.005));
  const [amount, setAmount] = useState(initialAmount !== null ? String(initialAmount).replace(".", ",") : "");
  const computed = auto(total, r);
  const shown = touched ? amount : computed !== null ? computed.toFixed(2).replace(".", ",") : "";
  const parsed = parseDecimal(shown);
  const vat = parsed !== null && !Number.isNaN(parsed) ? parsed : null;
  const rates = RATES.includes(defaultRate) ? RATES : [...RATES, defaultRate].sort((a, b) => a - b);

  return (
    <div className="grid grid-cols-1 gap-3 @md:grid-cols-[8rem_minmax(0,1fr)] sm:grid-cols-[8rem_minmax(0,1fr)]">
      <FormField name="vat_rate" label="KDV oranı">
        <select className="input" name="vat_rate" value={rate} onChange={(e) => setRate(e.target.value)}>
          {rates.map((x) => (
            <option key={x} value={x}>
              %{x}
            </option>
          ))}
        </select>
      </FormField>
      <FormField
        name="vat_amount"
        label="KDV tutarı"
        hint={
          <>
            KDV dahil toplam: <span className="font-medium text-ink-soft tabular-nums">{total !== null ? fmtMoney(total + (vat ?? 0), currency) : "—"}</span>
            {touched ? (
              <>
                {" · "}
                <button type="button" className="link" onClick={() => setTouched(false)}>
                  orandan hesapla
                </button>
              </>
            ) : null}
          </>
        }
      >
        <input
          className="input tabular-nums"
          name="vat_amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          value={shown}
          onChange={(e) => {
            setTouched(true);
            setAmount(e.target.value);
          }}
        />
      </FormField>
    </div>
  );
}
