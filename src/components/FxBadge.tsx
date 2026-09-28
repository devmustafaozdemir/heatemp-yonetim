import Link from "next/link";
import { fmtDate, fmtRate } from "@/lib/format";
import type { FxSuggestion } from "@/lib/fx/service";
import { cx } from "@/components/ui";

const SOURCE_LABEL: Record<string, string> = { TCMB: "TCMB", FRANKFURTER: "ECB (Frankfurter)", MANUAL: "Manuel" };

export function fxSourceLabel(source: string, rateType?: string) {
  const base = SOURCE_LABEL[source] ?? source;
  if (source === "TCMB" && rateType) return `${base} ${rateType === "ForexSelling" ? "döviz satış" : "döviz alış"}`;
  return base;
}

/** Üst çubuktaki kur göstergesi: kaynak, tarih ve geçerlilik açıkça gösterilir. */
export function FxBadge({ suggestion, warning }: { suggestion: FxSuggestion | null; warning: string | null }) {
  const valid = suggestion?.is_valid ?? false;
  return (
    <Link
      href="/ayarlar#kur"
      title={warning ?? undefined}
      className={cx(
        "flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs",
        valid ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-amber-300 bg-amber-50 text-amber-900",
      )}
    >
      <span className="font-semibold">USD/TRY</span>
      {suggestion ? (
        <>
          <span className="tabular-nums">{fmtRate(suggestion.rate)}</span>
          <span className="text-slate-400">·</span>
          <span>
            {fxSourceLabel(suggestion.source, suggestion.rate_type)}, {fmtDate(suggestion.rate_date)}
          </span>
          {!valid ? <span className="font-semibold">— güncel değil, kuru güncelleyin</span> : null}
        </>
      ) : (
        <span className="font-semibold">Kur yok — otomatik alınamadı, manuel kur girin</span>
      )}
    </Link>
  );
}
