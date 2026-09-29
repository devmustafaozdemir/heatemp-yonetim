"use client";

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
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
  initialSuggestion,
}: {
  date: string;
  canManual: boolean;
  name?: string;
  onChange?: (fx: FxSuggestion | null) => void;
  /** Sunucuda bu tarih için zaten alınmış kur: ilk sorgu atlanır (ilk açılışta tarih değişmediyse). */
  initialSuggestion?: FxSuggestion | null;
}) {
  const [fx, setFx] = useState<FxSuggestion | null>(initialSuggestion ?? null);
  const firstDate = useRef<string | null>(initialSuggestion !== undefined ? date : null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [manualOpen, setManualOpen] = useState(false);
  const [manualRate, setManualRate] = useState("");

  useEffect(() => {
    if (!date) {
      onChange?.(null);
      return;
    }
    if (firstDate.current !== null && firstDate.current === date) {
      // Sunucudan gelen kur kullanılır; yalnız ilk açılışta.
      firstDate.current = null;
      onChange?.(initialSuggestion && initialSuggestion.is_valid ? initialSuggestion : null);
      return;
    }
    firstDate.current = null;
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

  // Tarih boşken önceki kur gösterilmez ve gönderilmez.
  const shownFx = date ? fx : null;
  const valid = shownFx?.is_valid ?? false;

  return (
    <div className="block">
      <span className="label">İşlem kuru (USD/TRY)</span>
      {valid && shownFx ? <input type="hidden" name={name} value={shownFx.id} /> : null}
      <div
        className={cx(
          "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
          loading
            ? "border-line text-ink-muted"
            : valid
              ? "border-chart-teal/30 bg-chart-teal/5"
              : "border-chart-amber/50 bg-chart-amber/10",
        )}
        aria-live="polite"
      >
        {loading ? (
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
        ) : valid ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-chart-teal" aria-hidden />
        ) : (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          {!date ? (
            <span className="text-xs font-medium text-warning-ink">Önce işlem tarihini seçin.</span>
          ) : loading ? (
            "Kur kontrol ediliyor…"
          ) : fx ? (
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold text-ink tabular-nums">{fmtRate(fx.rate)}</span>
              <span className="text-xs text-ink-muted">
                {SOURCE[fx.source] ?? fx.source}
                {fx.source === "TCMB" ? (fx.rate_type === "ForexSelling" ? " döviz satış" : " döviz alış") : ""}, {fmtDate(fx.rate_date)}{" "}
                tarihli
                {fx.age_days > 0 ? ` (işlem tarihinden ${fx.age_days} gün önce)` : ""}
              </span>
              {!valid ? (
                <span className="w-full text-xs font-medium text-warning-ink">
                  Bu kur işlem tarihi için çok eski (en fazla {fx.max_age_days} gün). Kuru güncelleyin veya bu tarih için manuel kur girin.
                </span>
              ) : null}
            </div>
          ) : (
            <span className="text-xs font-medium text-warning-ink">Bu tarih için kayıtlı kur yok.</span>
          )}
          {message && !loading && date ? <div className="mt-1 text-xs text-warning-ink">{message}</div> : null}
        </div>
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
            <button type="button" className="text-xs font-medium text-brand-600 hover:underline" onClick={() => setManualOpen(true)}>
              Manuel kur gir
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
