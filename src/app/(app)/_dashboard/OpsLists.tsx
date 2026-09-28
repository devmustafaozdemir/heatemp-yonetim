import { AlertTriangle, ArrowRight, Factory, Plus, Receipt, Truck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { StockStatusBadge } from "@/components/StockStatus";
import { BatchStatusBadge, DeliveryStatusBadge, SaleStatusBadge } from "@/components/status";
import { ButtonLink, Card, EmptyState, ErrorState } from "@/components/ui";
import { fmtDate, fmtInt, fmtMinutes, fmtMoney } from "@/lib/format";
import type { Loaded } from "@/lib/query";
import type { VariantOverview } from "@/lib/types";
import { hasHistory } from "./data";

export interface WipBatch {
  id: string;
  batch_no: string;
  display_name: string;
  quantity: number;
  started_at: string;
  elapsed_minutes: number;
  estimated_minutes: number;
}

export interface RecentDelivery {
  id: string;
  delivery_no: string;
  delivered_on: string;
  display_name: string;
  quantity: number;
  status: "active" | "cancelled";
  sold_qty: number;
  remaining_qty: number;
}

export interface RecentSale {
  id: string;
  sale_no: string;
  sold_on: string;
  customer_name: string | null;
  total_quantity: number;
  revenue_try: number;
  status: "completed" | "cancelled";
  items_summary: string | null;
}

const LIMIT = 6;

function ListCard({
  title,
  icon,
  description,
  allHref,
  allLabel = "Tümünü gör",
  children,
}: {
  title: string;
  icon: LucideIcon;
  description?: ReactNode;
  allHref: string;
  allLabel?: string;
  children: ReactNode;
}) {
  return (
    <Card
      title={title}
      icon={icon}
      description={description}
      padded={false}
      className="h-full"
      actions={
        <Link
          href={allHref}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-800 hover:underline"
        >
          {allLabel}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      }
    >
      {children}
    </Card>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <li className="flex items-start justify-between gap-3 px-4 py-2.5 hover:bg-canvas/50">{children}</li>;
}

export function RiskList({ rows, allHref }: { rows: Loaded<VariantOverview[]>; allHref: string }) {
  const list = rows.data ?? [];
  const critical = list.filter((r) => r.stock_status === "critical").length;
  const low = list.length - critical;
  return (
    <ListCard
      title="Kritik stoklar"
      icon={AlertTriangle}
      allHref={allHref}
      description={rows.error ? undefined : `${fmtInt(critical)} kritik · ${fmtInt(low)} minimum altı (aktif varyantlar)`}
    >
      {rows.error ? (
        <ErrorState compact message={rows.error} />
      ) : list.length === 0 ? (
        <EmptyState compact title="Kritik stok yok">
          Tüm aktif varyantlar minimum seviyenin üzerinde.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {list.slice(0, LIMIT).map((r) => (
            <Row key={r.variant_id}>
              <div className="min-w-0">
                <Link href={`/urunler/${r.product_id}/varyant/${r.variant_id}`} className="link block">
                  {r.product_name}
                </Link>
                <p className="text-xs text-ink-muted">
                  {r.variant_name} · <span className="font-mono">{r.variant_code}</span>
                </p>
                <p className="text-xs text-ink-muted tabular-nums">
                  {r.stock_status === "critical" ? `Kritik eşik ≤ ${fmtInt(r.critical_stock)}` : `Minimum ≤ ${fmtInt(r.min_stock)}`} · hedef{" "}
                  {fmtInt(r.target_stock)}
                  {!hasHistory(r) ? " · hiç stok girişi yok" : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                <p className="text-[13px] font-semibold text-ink tabular-nums">{fmtInt(r.total_remaining)} adet</p>
                <StockStatusBadge row={r} />
              </div>
            </Row>
          ))}
        </ul>
      )}
    </ListCard>
  );
}

export function WipList({ rows, isAdmin }: { rows: Loaded<WipBatch[]>; isAdmin: boolean }) {
  const list = rows.data ?? [];
  const qty = list.reduce((a, b) => a + Number(b.quantity), 0);
  return (
    <ListCard
      title="Devam eden üretim"
      icon={Factory}
      allHref="/uretim?durum=in_production"
      description={
        rows.error ? undefined : list.length ? `${fmtInt(list.length)} parti · ${fmtInt(qty)} adet üretimde` : "Üretimdeki partiler"
      }
    >
      {rows.error ? (
        <ErrorState compact message={rows.error} />
      ) : list.length === 0 ? (
        <EmptyState
          compact
          icon={Factory}
          title="Üretimde parti yok"
          action={
            isAdmin ? (
              <ButtonLink href="/simulasyon" variant="soft" size="sm">
                <Plus aria-hidden />
                Üretimi başlat
              </ButtonLink>
            ) : undefined
          }
        >
          Yeni parti simülasyon ekranından başlatılır.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {list.slice(0, LIMIT).map((b) => (
            <Row key={b.id}>
              <div className="min-w-0">
                <Link href={`/uretim/${b.id}`} className="link font-mono text-xs">
                  {b.batch_no}
                </Link>
                <p className="text-[13px] text-ink">{b.display_name}</p>
                <p className="text-xs text-ink-muted">
                  Başladı {fmtDate(b.started_at)} · geçen {fmtMinutes(b.elapsed_minutes)}
                  {Number(b.estimated_minutes) > 0 ? ` · tahmini ${fmtMinutes(b.estimated_minutes)}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[13px] font-semibold text-ink tabular-nums">{fmtInt(b.quantity)} adet</p>
                <div className="mt-1">
                  <BatchStatusBadge status="in_production" />
                </div>
              </div>
            </Row>
          ))}
        </ul>
      )}
    </ListCard>
  );
}

export function DeliveryList({ rows, isAdmin }: { rows: Loaded<RecentDelivery[]>; isAdmin: boolean }) {
  const list = rows.data ?? [];
  return (
    <ListCard title="Son teslimatlar" icon={Truck} allHref="/teslimatlar" description="Heatemp → Mekonsis (satış değildir)">
      {rows.error ? (
        <ErrorState compact message={rows.error} />
      ) : list.length === 0 ? (
        <EmptyState
          compact
          icon={Truck}
          title="Henüz teslimat yok"
          action={
            isAdmin ? (
              <ButtonLink href="/rafim?islem=teslimat" variant="soft" size="sm">
                <Plus aria-hidden />
                Teslimat yap
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-line">
          {list.map((d) => (
            <Row key={d.id}>
              <div className="min-w-0">
                <Link href={`/teslimatlar/${d.id}`} className="link font-mono text-xs">
                  {d.delivery_no}
                </Link>
                <p className="text-[13px] text-ink">{d.display_name}</p>
                <p className="text-xs text-ink-muted tabular-nums">
                  {fmtDate(d.delivered_on)}
                  {d.status === "active" ? ` · satılan ${fmtInt(d.sold_qty)} · kalan ${fmtInt(d.remaining_qty)}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[13px] font-semibold text-ink tabular-nums">{fmtInt(d.quantity)} adet</p>
                {d.status === "cancelled" ? (
                  <div className="mt-1">
                    <DeliveryStatusBadge status={d.status} />
                  </div>
                ) : null}
              </div>
            </Row>
          ))}
        </ul>
      )}
    </ListCard>
  );
}

export function SalesList({ rows, isAdmin }: { rows: Loaded<RecentSale[]>; isAdmin: boolean }) {
  const list = rows.data ?? [];
  return (
    <ListCard title="Son satışlar" icon={Receipt} allHref="/satislar" description="Mekonsis'in gerçekleştirdiği satışlar">
      {rows.error ? (
        <ErrorState compact message={rows.error} />
      ) : list.length === 0 ? (
        <EmptyState
          compact
          icon={Receipt}
          title="Henüz satış yok"
          action={
            isAdmin ? (
              <ButtonLink href="/satislar/yeni" variant="soft" size="sm">
                <Plus aria-hidden />
                Satış ekle
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-line">
          {list.map((s) => (
            <Row key={s.id}>
              <div className="min-w-0">
                <Link href={`/satislar/${s.id}`} className="link font-mono text-xs">
                  {s.sale_no}
                </Link>
                <p className="text-[13px] text-ink">{s.customer_name ?? "Müşteri belirtilmemiş"}</p>
                <p className="line-clamp-1 text-xs break-words text-ink-muted" title={s.items_summary ?? undefined}>
                  {fmtDate(s.sold_on)} · {fmtInt(s.total_quantity)} adet
                  {s.items_summary ? ` · ${s.items_summary}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={
                    s.status === "cancelled"
                      ? "text-[13px] font-semibold text-ink-muted tabular-nums line-through"
                      : "text-[13px] font-semibold text-ink tabular-nums"
                  }
                >
                  {fmtMoney(s.revenue_try, "TRY")}
                </p>
                {s.status === "cancelled" ? (
                  <div className="mt-1">
                    <SaleStatusBadge status={s.status} />
                  </div>
                ) : null}
              </div>
            </Row>
          ))}
        </ul>
      )}
    </ListCard>
  );
}
