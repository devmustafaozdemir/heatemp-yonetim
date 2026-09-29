import { AlertCircle, CheckCircle2, CircleSlash, Mail, Phone } from "lucide-react";
import { Badge, cx } from "@/components/ui";
import { fmtMoney } from "@/lib/format";

/**
 * İkincil bir sorgu hata verdiğinde değerin yerinde gösterilir ("—" veya boş hücre
 * yerine): hata ≠ boş. Ayrıntılı hata metni title ile okunur.
 */
export function LoadFailed({ message, label = "yüklenemedi", className }: { message: string; label?: string; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 text-xs font-normal text-ink-muted", className)} title={message}>
      <AlertCircle className="size-3.5 shrink-0 text-chart-red" aria-hidden />
      {label}
    </span>
  );
}

export function CustomerActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge tone="green" icon={CheckCircle2}>
      Aktif
    </Badge>
  ) : (
    <Badge tone="gray" icon={CircleSlash}>
      Pasif
    </Badge>
  );
}

/** Telefon ve e-posta (tıklanabilir). Hiçbiri yoksa "—". */
export function ContactLinks({ phone, email, className }: { phone: string | null; email: string | null; className?: string }) {
  if (!phone && !email) return <span className="text-xs text-ink-muted">—</span>;
  return (
    <div className={className}>
      {phone ? (
        <a href={`tel:${phone.replace(/\s+/g, "")}`} className="flex items-center gap-1.5 whitespace-nowrap text-ink-soft hover:text-brand-600">
          <Phone className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
          <span className="tabular-nums">{phone}</span>
        </a>
      ) : null}
      {email ? (
        <a href={`mailto:${email}`} className="flex min-w-0 items-center gap-1.5 text-ink-soft hover:text-brand-600" title={email}>
          <Mail className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
          <span className="min-w-0 [overflow-wrap:anywhere]">{email}</span>
        </a>
      ) : null}
    </div>
  );
}

/** Açık teklif tutarları para birimine göre ayrı: "$1.200,00 + ₺5.000,00". */
export function openAmountText(usd: number | null, tl: number | null): string | null {
  const parts = [usd ? fmtMoney(usd, "USD") : null, tl ? fmtMoney(tl, "TRY") : null].filter(Boolean);
  return parts.length ? parts.join(" + ") : null;
}
