"use client";

import { useEffect, useState, useTransition } from "react";
import { lookupFx, saveManualFx } from "@/app/(app)/fx-actions";
import { Button, cx } from "@/components/ui";
import { fmtDate, fmtRate } from "@/lib/format";
import type { FxSuggestion } from "@/lib/fx/service";

const SOURCE: Record<string, string> = { TCMB: "TCMB", FRANKFURTER: "ECB/Frankfurter", MANUAL: "Manuel" };

/**
 * İşlem kuru alanı. Seçilen işlem tarihine göre kuru sunucudan alır ve
 * kaynağını/tarihini gösterir. Geçerli kur yoksa işlemi kaydettirmez ve
 * yöneticiden manuel kur ister; hiçbir zaman sessizce sabit kur kullanmaz.
 */
export function FxRateField({
  date,
  canManual,
  name = "fx_rate_id",
  onChange,
}: {
  date: string;
  canManual: boolean;
  name?: string;
  onChange?: (fx: FxSuggestion | null) => void;
}) {
  const [fx, setFx] = useState<FxSuggestion | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [manualOpen, setManualOpen] = useState(false);
  const [manualRate, setManualRate] = useState("");

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    startLoading(async () => {
      const r = await lookupFx(date);
      if (cancelled) return;
      setFx(r.suggestion);
      setMessage(r.message);
      onChange?.(r.suggestion && r.suggestion.is_valid ? r.suggestion : null);
    });
    return () => {
      cancelled = true;
    };
    // onChange bilinçli olarak bağımlılık dışında: yalnızca tarih değişince sorgula.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  function saveManual() {
    startLoading(async () => {
      const r = await saveManualFx(date, manualRate);
      if (r.suggestion) {
        setFx(r.suggestion);
        setMessage(null);
        setManualOpen(false);
        setManualRate("");
        onChange?.(r.suggestion);
      } else {
        setMessage(r.message);
      }
    });
  }

  const valid = fx?.is_valid ?? false;

  return (
    <div className="block">
      <span className="label">İşlem kuru (USD/TRY)</span>
      {valid && fx ? <input type="hidden" name={name} value={fx.id} /> : null}
      <div
        className={cx(
          "rounded-md border px-3 py-2 text-sm",
          loading ? "border-slate-200 text-slate-500" : valid ? "border-slate-200 bg-slate-50" : "border-amber-300 bg-amber-50",
        )}
      >
        {loading ? (
          "Kur kontrol ediliyor…"
        ) : fx ? (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold tabular-nums">{fmtRate(fx.rate)}</span>
            <span className="text-xs text-slate-600">
              {SOURCE[fx.source] ?? fx.source}
              {fx.source === "TCMB" ? (fx.rate_type === "ForexSelling" ? " döviz satış" : " döviz alış") : ""},{" "}
              {fmtDate(fx.rate_date)} tarihli
              {fx.age_days > 0 ? ` (işlem tarihinden ${fx.age_days} gün önce)` : ""}
            </span>
            {!valid ? (
              <span className="w-full text-xs font-medium text-amber-900">
                Bu kur işlem tarihi için çok eski (en fazla {fx.max_age_days} gün). Kuru güncelleyin veya bu tarih
                için manuel kur girin.
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-xs font-medium text-amber-900">Bu tarih için kayıtlı kur yok.</span>
        )}
        {message && !loading ? <div className="mt-1 text-xs text-amber-900">{message}</div> : null}
      </div>
      {canManual ? (
        <div className="mt-1.5">
          {manualOpen ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="label">{fmtDate(date)} için manuel kur</span>
                <input
                  className="input w-36"
                  inputMode="decimal"
                  placeholder="ör. 41,2345"
                  value={manualRate}
                  onChange={(e) => setManualRate(e.target.value)}
                />
              </label>
              <Button type="button" size="sm" onClick={saveManual} disabled={loading || !manualRate}>
                Manuel kuru kaydet
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setManualOpen(false)}>
                Vazgeç
              </Button>
            </div>
          ) : (
            <button type="button" className="text-xs text-brand-700 hover:underline" onClick={() => setManualOpen(true)}>
              Manuel kur gir
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
