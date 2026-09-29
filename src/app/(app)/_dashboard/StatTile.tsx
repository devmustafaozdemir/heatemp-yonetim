import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cx, DeltaText, IconBox, type Tone } from "@/components/ui";

// Dashboard'a özel, kompakt özet kartı. Paylaşılan StatCard'dan farkı: ikon etiketin yanında durur,
// değer kartın tüm genişliğini kullanır. Böylece dar kartta (mobilde 2 sütun, 1280'de 4 sütun)
// değer ikona değmez. Kartlar üst ızgaranın satırlarını paylaşır (subgrid): etiket bir kartta
// iki satıra kaysa da aynı sıradaki tüm kartlarda değerler aynı hizada başlar.

/** Özet kartı ızgarası: kapsayıcı genişliğine göre 1 → 2 → 4 sütun. Satır aralığını kartların alt boşluğu verir. */
export const STAT_GRID = "grid grid-cols-1 gap-x-3 @min-[300px]:grid-cols-2 @min-[880px]:grid-cols-4 @min-[880px]:gap-x-4";

const TILE = "card row-span-3 grid grid-rows-subgrid gap-y-0 mb-3 p-3 @min-[880px]:mb-4 @min-[880px]:p-4";

const SCOPE_CHIP = "mt-1 block w-fit rounded bg-canvas px-1.5 py-px text-[10.5px] font-medium tracking-normal normal-case text-ink-muted";

function Header({ label, scope, icon, tone }: { label: string; scope: string; icon: LucideIcon; tone: Tone }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[11px] leading-4 font-medium tracking-wide text-ink-muted uppercase @min-[880px]:text-xs">{label}</p>
        <span className={SCOPE_CHIP}>{scope}</span>
      </div>
      <IconBox icon={icon} tone={tone} size="sm" />
    </div>
  );
}

export function StatTile({
  label,
  scope,
  value,
  unit,
  icon,
  tone,
  delta,
  description,
  href,
}: {
  label: string;
  /** "Seçilen dönem" / "Güncel stok" */
  scope: string;
  value: ReactNode;
  unit?: string;
  icon: LucideIcon;
  tone: Tone;
  /** Yalnız dönem kartlarında: önceki eşit döneme göre değişim (pct null → "karşılaştırma yok") */
  delta?: { pct: number | null; label: string };
  description?: ReactNode;
  href: string;
}) {
  return (
    <Link href={href} className={cx(TILE, "transition-shadow hover:shadow-(--shadow-pop)")}>
      <Header label={label} scope={scope} icon={icon} tone={tone} />
      <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 self-start text-lg leading-tight font-semibold text-ink tabular-nums @min-[880px]:mt-2.5 @min-[880px]:text-[22px]">
        {value}
        {unit ? <span className="text-xs font-medium text-ink-muted @min-[880px]:text-[13px]">{unit}</span> : null}
      </p>
      <div className="min-w-0 self-start">
        {delta ? <DeltaText pct={delta.pct} label={delta.label} /> : null}
        {description ? <p className="mt-1.5 text-xs text-ink-muted">{description}</p> : null}
      </div>
    </Link>
  );
}

/** Sorgu hatasında özet kartı: değer "0" gösterilmez, hata açıkça yazılır. */
export function StatTileError({ label, scope, icon, message }: { label: string; scope: string; icon: LucideIcon; message: string }) {
  return (
    <div className={TILE} role="alert">
      <Header label={label} scope={scope} icon={icon} tone="red" />
      <p className="mt-2 self-start text-sm font-medium text-chart-red">Veri yüklenemedi</p>
      <p className="mt-1 self-start text-xs break-words text-ink-muted">{message}</p>
    </div>
  );
}
