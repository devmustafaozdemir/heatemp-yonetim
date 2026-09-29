import { AlertCircle, AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Info, Inbox, Minus, RefreshCw, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "@/components/shell/Breadcrumbs";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Sayfa başlığı: breadcrumb + başlık + kısa açıklama + ana işlemler
// ---------------------------------------------------------------------------
export function PageHeader({
  title,
  description,
  actions,
  back,
  crumbs,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Eski kullanım: üst sayfaya dönüş bağlantısı. Breadcrumb'a eklenir. */
  back?: { href: string; label: string };
  /** Menüden türetilen yolun sonuna eklenecek ek adımlar (ör. kayıt numarası). */
  crumbs?: Crumb[];
  /** Başlığın yanında gösterilecek rozetler vb. */
  meta?: ReactNode;
}) {
  const extra: Crumb[] = [...(back ? [{ href: back.href, label: back.label }] : []), ...(crumbs ?? [])];
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <Breadcrumbs extra={extra} current={typeof title === "string" && !crumbs?.length ? title : undefined} />
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg leading-tight font-semibold text-ink sm:text-xl">{title}</h1>
          {meta}
        </div>
        {description ? <p className="mt-1 max-w-3xl text-[13px] text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kartlar
// ---------------------------------------------------------------------------
export function Card({
  title,
  description,
  actions,
  children,
  className,
  padded = true,
  footer,
  icon: Icon,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
  footer?: ReactNode;
  icon?: LucideIcon;
  id?: string;
}) {
  return (
    <section id={id} className={cx("card flex min-w-0 flex-col", className)}>
      {title || actions ? (
        <header className="card-header">
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon ? <Icon className="mt-0.5 size-[18px] shrink-0 text-ink-muted" aria-hidden /> : null}
            <div className="min-w-0">
              {title ? <h2 className="card-title">{title}</h2> : null}
              {description ? <p className="mt-0.5 text-xs text-ink-muted">{description}</p> : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cx("min-w-0 flex-1", padded && "p-4")}>{children}</div>
      {footer ? <footer className="border-t border-line px-4 py-2.5 text-xs text-ink-muted">{footer}</footer> : null}
    </section>
  );
}

export type Tone = "blue" | "teal" | "sky" | "amber" | "orange" | "red" | "violet" | "slate" | "brand";

const SOFT: Record<Tone, string> = {
  blue: "bg-chart-blue/10 text-chart-blue",
  teal: "bg-chart-teal/10 text-chart-teal",
  sky: "bg-chart-sky/10 text-chart-sky",
  amber: "bg-chart-amber/15 text-warning-ink",
  orange: "bg-chart-orange/12 text-chart-orange",
  red: "bg-chart-red/10 text-chart-red",
  violet: "bg-chart-violet/10 text-chart-violet",
  slate: "bg-slate-100 text-slate-600",
  brand: "bg-brand-50 text-brand-600",
};

export function IconBox({ icon: Icon, tone = "brand", size = "md" }: { icon: LucideIcon; tone?: Tone; size?: "sm" | "md" | "lg" }) {
  const s = { sm: "size-8 [&>svg]:size-4", md: "size-10 [&>svg]:size-5", lg: "size-12 [&>svg]:size-6" }[size];
  return (
    <span className={cx("flex shrink-0 items-center justify-center rounded-md", s, SOFT[tone])} aria-hidden>
      <Icon />
    </span>
  );
}

/**
 * Özet kartı. `delta` yalnızca gerçekten hesaplanabiliyorsa verilir; önceki dönem
 * değeri 0 veya bilinmiyorsa `delta.pct = null` ile "karşılaştırma yok" yazılır.
 * Yerleşim: etiket + kapsam rozeti (her zaman ayrı satır, kartlar hizalı) solda, ikon sağda;
 * değer kartın tüm genişliğini kullanır (dar kartta ikona değmez). Mobilde iki sütuna sığar.
 * Sorgu hatasında `error` verilir: değer yerine hata yazılır ("0" gösterilmez).
 */
export function StatCard({
  label,
  value,
  unit,
  icon,
  tone = "brand",
  description,
  delta,
  scope,
  href,
  error,
}: {
  label: ReactNode;
  value?: ReactNode;
  unit?: ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  description?: ReactNode;
  /** pct: yüzde değişim (null → hesaplanamadı); label: "önceki 30 güne göre" gibi */
  delta?: { pct: number | null; label: string; invert?: boolean };
  /** "Seçilen dönem", "Güncel stok" gibi kapsam etiketi */
  scope?: ReactNode;
  href?: string;
  /** Sorgu hatası mesajı */
  error?: string | null;
}) {
  const body = (
    <div className="flex h-full flex-col p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] leading-4 font-medium tracking-wide text-ink-muted uppercase sm:text-xs">{label}</p>
          {scope ? <span className="mt-1 inline-block rounded bg-canvas px-1.5 py-px text-[10.5px] font-medium text-ink-muted">{scope}</span> : null}
        </div>
        <IconBox icon={icon} tone={error ? "red" : tone} size="sm" />
      </div>
      {error ? (
        <div role="alert">
          <p className="mt-2.5 text-sm font-semibold text-danger-ink">Veri yüklenemedi</p>
          <p className="mt-1 text-xs break-words text-ink-muted">{error}</p>
        </div>
      ) : (
        <>
          <p className="mt-2.5 flex flex-wrap items-baseline gap-x-1.5 text-lg leading-tight font-semibold break-words text-ink tabular-nums sm:text-[22px]">
            {value}
            {unit ? <span className="text-xs font-medium text-ink-muted sm:text-[13px]">{unit}</span> : null}
          </p>
          {delta ? <DeltaText {...delta} /> : null}
          {description ? <p className="mt-1.5 text-xs text-ink-muted">{description}</p> : null}
        </>
      )}
    </div>
  );
  return href && !error ? (
    <Link href={href} className="card block min-w-0 transition-shadow hover:shadow-(--shadow-pop)">
      {body}
    </Link>
  ) : (
    <div className="card min-w-0">{body}</div>
  );
}

/** Özet kartı ızgarası: mobilde 2, geniş ekranda 4 sütun (kartlar eşit yükseklikte). */
export const STAT_GRID = "grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4";

export function DeltaText({ pct, label, invert = false }: { pct: number | null; label: string; invert?: boolean }) {
  if (pct === null || !Number.isFinite(pct)) {
    return <p className="mt-2 text-xs text-ink-muted">{label}: karşılaştırma yok</p>;
  }
  const up = pct > 0;
  const flat = Math.abs(pct) < 0.005;
  const good = flat ? null : invert ? !up : up;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const text = `${up ? "+" : pct < 0 ? "−" : ""}%${Math.abs(pct).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-1 text-xs">
      <span
        className={cx(
          "inline-flex items-center gap-0.5 rounded px-1 py-px font-semibold",
          good === null ? "bg-slate-100 text-slate-600" : good ? "bg-chart-teal/10 text-success-ink" : "bg-chart-red/10 text-danger-ink",
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        {text}
      </span>
      <span className="text-ink-muted">{label}</span>
    </p>
  );
}

/** Eski küçük özet kutusu (yardımcı sayılar için). */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "positive" | "negative" | "muted";
}) {
  const toneClass = {
    default: "text-ink",
    positive: "text-success-ink",
    negative: "text-danger-ink",
    muted: "text-ink-muted",
  }[tone];
  return (
    <div className="card px-4 py-3">
      <div className="text-xs font-medium text-ink-muted">{label}</div>
      <div className={cx("mt-1 text-lg font-semibold tabular-nums", toneClass)}>{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-ink-muted">{hint}</div> : null}
    </div>
  );
}

/** Kart içinde yan yana küçük metrikler (ör. grafik altı özet). */
export function MetricRow({ items }: { items: { label: ReactNode; value: ReactNode; hint?: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 divide-line border-line sm:flex sm:divide-x">
      {items.map((it, i) => (
        <div key={i} className="min-w-0 flex-1 px-4 py-3">
          <dt className="text-xs text-ink-muted">{it.label}</dt>
          <dd className="mt-1 text-[15px] font-semibold text-ink tabular-nums">{it.value}</dd>
          {it.hint ? <dd className="mt-0.5 text-xs text-ink-muted">{it.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Rozetler
// ---------------------------------------------------------------------------
export type BadgeTone = "gray" | "green" | "red" | "amber" | "blue" | "orange" | "violet" | "sky";
const BADGE: Record<BadgeTone, string> = {
  gray: "bg-slate-100 text-slate-700",
  green: "bg-chart-teal/12 text-success-ink",
  red: "bg-chart-red/12 text-danger-ink",
  amber: "bg-chart-amber/20 text-warning-ink",
  blue: "bg-chart-blue/12 text-accent-ink",
  orange: "bg-orange-100 text-orange-800",
  violet: "bg-chart-violet/12 text-chart-violet",
  sky: "bg-chart-sky/12 text-info-ink",
};

export function Badge({
  tone = "gray",
  children,
  title,
  icon: Icon,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  title?: string;
  icon?: LucideIcon;
}) {
  return (
    <span
      title={title}
      className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap", BADGE[tone])}
    >
      {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Boş / hata / uyarı durumları
// ---------------------------------------------------------------------------
export function EmptyState({
  title,
  children,
  icon: Icon = Inbox,
  action,
  compact = false,
}: {
  title: string;
  children?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cx("flex flex-col items-center justify-center text-center", compact ? "px-4 py-6" : "px-6 py-10")}>
      <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-canvas text-ink-muted" aria-hidden>
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {children ? <div className="mt-1 max-w-md text-[13px] text-ink-muted">{children}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/**
 * Sorgu hatası: boş veriden AYRI gösterilir ("0" veya "kayıt yok" yazılmaz).
 */
export function ErrorState({ title = "Veri yüklenemedi", message, compact = false }: { title?: string; message: string; compact?: boolean }) {
  return (
    <div role="alert" className={cx("flex flex-col items-center justify-center text-center", compact ? "px-4 py-6" : "px-6 py-10")}>
      <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-chart-red/10 text-chart-red" aria-hidden>
        <AlertCircle className="size-5" />
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-md text-[13px] text-ink-muted">{message}</p>
      <a href="" className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">
        <RefreshCw className="size-3.5" aria-hidden />
        Sayfayı yenile
      </a>
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warning" | "error" | "success";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-chart-sky/30 bg-chart-sky/8 text-info-ink",
    warning: "border-chart-amber/40 bg-chart-amber/10 text-warning-ink",
    error: "border-chart-red/30 bg-chart-red/8 text-danger-ink",
    success: "border-chart-teal/30 bg-chart-teal/8 text-success-ink",
  };
  const Icon = { info: Info, warning: AlertTriangle, error: AlertCircle, success: CheckCircle2 }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("flex gap-2.5 rounded-md border px-3 py-2.5 text-[13px]", tones[tone], className)}>
      <Icon className="mt-px size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title ? <div className="font-semibold">{title}</div> : null}
        {children ? <div className={title ? "mt-0.5" : undefined}>{children}</div> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Butonlar
// ---------------------------------------------------------------------------
export type ButtonVariant = "primary" | "secondary" | "soft" | "success" | "danger" | "ghost" | "outline";

export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" = "md") {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-55 whitespace-nowrap [&>svg]:shrink-0";
  const sizes = { sm: "h-8 px-2.5 text-xs [&>svg]:size-3.5", md: "h-9 px-3.5 text-[13px] [&>svg]:size-4" };
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700",
    secondary: "border border-line-strong bg-white text-ink-soft shadow-sm hover:bg-canvas",
    soft: "bg-brand-50 text-brand-700 hover:bg-brand-100",
    success: "bg-success-ink text-white shadow-sm hover:bg-success-ink/90",
    danger: "bg-danger-ink text-white shadow-sm hover:bg-danger-ink/90",
    ghost: "text-ink-soft hover:bg-canvas",
    outline: "border border-brand-300 bg-white text-brand-700 hover:bg-brand-50",
  };
  return cx(base, sizes[size], variants[variant]);
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "md",
  className,
  ...rest
}: Omit<ComponentProps<typeof Link>, "className"> & {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <Link href={href} className={cx(buttonClass(variant, size), className)} {...rest}>
      {children}
    </Link>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button {...props} className={cx(buttonClass(variant, size), className)} />;
}

// ---------------------------------------------------------------------------
// Form alanı (sunucu bileşenlerinde; istemci formlarında FormField kullanın)
// ---------------------------------------------------------------------------
export function Field({
  label,
  hint,
  error,
  children,
  className,
  required,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={cx("block min-w-0", className)} data-invalid={error ? "" : undefined}>
      <label className="block">
        <span className="label">
          {label}
          {required ? <RequiredMark /> : null}
        </span>
        {children}
      </label>
      {error ? (
        <span className="field-error" role="alert">
          <AlertCircle className="size-3.5" aria-hidden />
          {error}
        </span>
      ) : null}
      {!error && hint ? <span className="help">{hint}</span> : null}
    </div>
  );
}

/** Zorunlu alan işareti: erişilebilir adın parçasıdır ("Ürün kodu *"). */
export function RequiredMark() {
  return <span className="text-red-500">{" *"}</span>;
}

/** Form bölümü başlığı (alan grupları için). */
export function FormSection({ title, description, children, className }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cx("min-w-0", className)}>
      <legend className="mb-0.5 text-[13px] font-semibold text-ink">{title}</legend>
      {description ? <p className="mb-3 text-xs text-ink-muted">{description}</p> : <div className="mb-2" />}
      {children}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Tablo ve yardımcılar
// ---------------------------------------------------------------------------
/** Dar ekranlarda kontrollü yatay kaydırma. */
export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  // relative: tablo içindeki mutlak konumlu öğeler (sr-only) kaydırma kabından taşıp sayfayı kaydırmasın.
  return <div className={cx("relative overflow-x-auto overscroll-x-contain [scrollbar-width:thin]", className)}>{children}</div>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <span className="text-xs text-ink-muted">{children}</span>;
}

export function DefinitionList({ items, columns = 2 }: { items: [ReactNode, ReactNode][]; columns?: 1 | 2 | 3 }) {
  const cols = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 2xl:grid-cols-3" }[columns];
  return (
    <dl className={cx("grid grid-cols-1 gap-x-8 text-[13px]", cols)}>
      {items.map(([k, v], i) => (
        <div key={i} className="flex items-baseline justify-between gap-3 border-b border-dashed border-line py-2">
          <dt className="shrink-0 text-ink-muted">{k}</dt>
          <dd className="min-w-0 text-right font-medium text-ink tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Gerçek bir orana dayalı ilerleme çubuğu (ör. stok / hedef). Uydurma yüzde için kullanmayın. */
export function ProgressBar({ value, max, tone = "blue", label }: { value: number; max: number; tone?: Tone; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const bar = {
    blue: "bg-chart-blue",
    teal: "bg-chart-teal",
    sky: "bg-chart-sky",
    amber: "bg-chart-amber",
    orange: "bg-chart-orange",
    red: "bg-chart-red",
    violet: "bg-chart-violet",
    slate: "bg-slate-400",
    brand: "bg-brand-600",
  }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas" role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx("h-full rounded-full", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}
