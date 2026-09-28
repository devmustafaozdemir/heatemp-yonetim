import { CalendarDays } from "lucide-react";
import { LinkSegmented } from "@/components/ui/list";
import { fmtDate, fmtInt } from "@/lib/format";
import { hrefWith } from "@/lib/list-params";
import type { Period, PeriodKey } from "@/lib/period";
import { CustomRangeForm } from "./CustomRangeForm";
import { STOCK_TABLE_KEYS } from "./data";

const PRESETS: { key: Exclude<PeriodKey, "ozel">; label: string }[] = [
  { key: "7g", label: "7 gün" },
  { key: "30g", label: "30 gün" },
  { key: "90g", label: "90 gün" },
  { key: "bu-ay", label: "Bu ay" },
  { key: "gecen-ay", label: "Geçen ay" },
  { key: "bu-yil", label: "Bu yıl" },
  { key: "12a", label: "12 ay" },
];

/**
 * Dönem seçimi (URL: ?donem=…&bas&bit). Hazır seçenekler bağlantıdır; özel aralık iki
 * tarih alanıyla uygulanır. Dönem değişince grafik kırılımı (gorunum) otomatiğe döner.
 */
export function PeriodBar({ period, today, values }: { period: Period; today: string; values: Record<string, string> }) {
  const keep: Record<string, string> = {};
  for (const k of STOCK_TABLE_KEYS) if (values[k] && k !== "sayfa") keep[k] = values[k];
  const items = PRESETS.map((p) => ({
    key: p.key,
    label: p.label,
    href: hrefWith("/", values, { donem: p.key === "30g" ? null : p.key, bas: null, bit: null, gorunum: null }),
  }));

  return (
    <section aria-label="Dönem seçimi" className="card mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-soft uppercase">
          <CalendarDays className="size-4 text-ink-muted" aria-hidden />
          Dönem
        </span>
        <LinkSegmented items={items} active={period.key} />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-xs text-ink-muted">Özel aralık</span>
        <CustomRangeForm
          key={`${period.from}-${period.to}`}
          from={period.from}
          to={period.to}
          today={today}
          active={period.key === "ozel"}
          keep={keep}
        />
      </div>
      <p className="text-xs text-ink-muted xl:ml-auto">
        <span className="font-medium text-ink-soft tabular-nums">
          {fmtDate(period.from)} – {fmtDate(period.to)}
        </span>{" "}
        · {fmtInt(period.days)} gün · karşılaştırma:{" "}
        <span className="tabular-nums">
          {fmtDate(period.prevFrom)} – {fmtDate(period.prevTo)}
        </span>
      </p>
    </section>
  );
}
