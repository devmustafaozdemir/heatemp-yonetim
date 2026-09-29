import { cx } from "@/components/ui";

/**
 * LinkTabs için duyarlı sekme adı: 640 px altında kısa ad gösterilir, böylece tüm sekmeler
 * dar ekranda görünür kalır (gizli yatay kaydırma gerekmez). Sayı rozeti LinkTabs'teki ile aynıdır
 * ve yer kazanmak için yalnız 640 px ve üstünde gösterilir.
 */
export function TabLabel({ label, short, count, active }: { label: string; short: string; count?: number | null; active: boolean }) {
  return (
    <>
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{label}</span>
      {count !== undefined && count !== null ? (
        <span className={cx("hidden rounded-full px-1.5 py-px text-[11px] tabular-nums sm:inline", active ? "bg-brand-50 text-brand-700" : "bg-canvas text-ink-muted")}>
          {count.toLocaleString("tr-TR")}
        </span>
      ) : null}
    </>
  );
}
