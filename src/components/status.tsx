import { ArrowDownRight, ArrowUpRight, Ban, CheckCircle2, CircleDot, FileText, Hourglass, PackageOpen, Truck } from "lucide-react";
import { Badge } from "@/components/ui";
import type { BatchStatus } from "@/lib/types";

/** Durum rozetleri: renk + ikon + metin. Tüm sayfalar bu bileşenleri kullanır. */

export function BatchStatusBadge({ status, kind }: { status: BatchStatus; kind?: "production" | "opening" }) {
  if (kind === "opening")
    return (
      <Badge tone="violet" icon={PackageOpen} title="Sistem öncesi mevcut stok; üretim sayılmaz">
        Açılış stoğu
      </Badge>
    );
  if (status === "completed")
    return (
      <Badge tone="green" icon={CheckCircle2}>
        Tamamlandı
      </Badge>
    );
  if (status === "cancelled")
    return (
      <Badge tone="gray" icon={Ban}>
        İptal
      </Badge>
    );
  return (
    <Badge tone="amber" icon={Hourglass}>
      Üretimde
    </Badge>
  );
}

export function SaleStatusBadge({ status }: { status: "completed" | "cancelled" | string }) {
  return status === "cancelled" ? (
    <Badge tone="gray" icon={Ban}>
      İptal
    </Badge>
  ) : (
    <Badge tone="green" icon={CheckCircle2}>
      Gerçekleşti
    </Badge>
  );
}

export function DeliveryStatusBadge({ status }: { status: "active" | "cancelled" | string }) {
  return status === "cancelled" ? (
    <Badge tone="gray" icon={Ban}>
      İptal
    </Badge>
  ) : (
    <Badge tone="sky" icon={Truck}>
      Teslim edildi
    </Badge>
  );
}

export function QuoteStatusBadge({ status }: { status: "open" | "converted" | "cancelled" }) {
  if (status === "converted")
    return (
      <Badge tone="green" icon={CheckCircle2}>
        Satışa dönüştü
      </Badge>
    );
  if (status === "cancelled")
    return (
      <Badge tone="gray" icon={Ban}>
        İptal
      </Badge>
    );
  return (
    <Badge tone="blue" icon={FileText}>
      Açık
    </Badge>
  );
}

/** Son iki tamamlanmış partinin birim maliyet değişimi (artış kırmızı, düşüş yeşil). */
export function CostChange({ pct, prev }: { pct: number | null; prev: string | null }) {
  if (pct === null || pct === undefined)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
        <CircleDot className="size-3" aria-hidden />
        {prev ? "—" : "ilk parti"}
      </span>
    );
  const n = Number(pct);
  const Icon = n > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = n > 0 ? "text-danger-ink" : n < 0 ? "text-success-ink" : "text-ink-muted";
  return (
    <span className={`relative inline-flex items-center gap-0.5 font-medium tabular-nums ${tone}`} title={prev ? `Önceki tamamlanan parti: ${prev}` : undefined}>
      {n !== 0 ? <Icon className="size-3.5" aria-hidden /> : null}
      {n > 0 ? "+" : n < 0 ? "−" : ""}%{Math.abs(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}
      <span className="sr-only">{n > 0 ? " artış" : n < 0 ? " düşüş" : ""}</span>
    </span>
  );
}
