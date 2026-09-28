import { AlertTriangle, DollarSign } from "lucide-react";
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

/** Üst bardaki kur göstergesi: kur, kaynak, kurun tarihi ve geçerlilik açıkça gösterilir. */
export function FxBadge({ suggestion, warning }: { suggestion: FxSuggestion | null; warning: string | null }) {
  const valid = suggestion?.is_valid ?? false;
  const title = suggestion
    ? `USD/TRY ${fmtRate(suggestion.rate)} — ${fxSourceLabel(suggestion.source, suggestion.rate_type)}, kur tarihi ${fmtDate(suggestion.rate_date)}${warning ? ` · ${warning}` : ""}`
    : (warning ?? "Kur yok");
  return (
    <Link
      href="/ayarlar#kur"
      title={title}
      className={cx(
        "flex max-w-[60vw] items-center gap-2 rounded-md border px-2 py-1.5 text-xs leading-tight transition-colors sm:px-2.5",
        valid ? "border-line bg-white text-ink-soft hover:bg-canvas" : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100",
      )}
    >
      <span
        className={cx(
          "flex size-6 shrink-0 items-center justify-center rounded",
          valid ? "bg-chart-teal/10 text-chart-teal" : "bg-amber-200/60 text-amber-800",
        )}
        aria-hidden
      >
        {valid ? <DollarSign className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
      </span>
      {suggestion ? (
        <span className="min-w-0">
          <span className="block font-semibold whitespace-nowrap text-ink">
            USD/TRY <span className="tabular-nums">{fmtRate(suggestion.rate)}</span>
          </span>
          <span className="hidden truncate text-[11px] text-ink-muted md:block">
            {fxSourceLabel(suggestion.source, suggestion.rate_type)} · {fmtDate(suggestion.rate_date)}
            {!valid ? " · güncel değil" : ""}
          </span>
        </span>
      ) : (
        <span className="font-semibold whitespace-nowrap">Kur yok — manuel kur girin</span>
      )}
    </Link>
  );
}
