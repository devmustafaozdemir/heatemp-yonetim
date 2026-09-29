import { AlertTriangle, ArrowRight, Factory, Plus, Receipt, Truck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { StockStatusBadge } from "@/components/StockStatus";
import { BatchStatusBadge, DeliveryStatusBadge, SaleStatusBadge } from "@/components/status";
import { ButtonLink, Card, cx, EmptyState, ErrorState } from "@/components/ui";
import { fmtDate, fmtInt, fmtMinutes, fmtMoney, fmtUnitMoney } from "@/lib/format";
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

/** Son tamamlanan üretim partisi (v_batches; kind='production', status='completed') */
export interface RecentBatch {
  id: string;
  batch_no: string;
  product_name: string;
  variant_name: string;
  completed_at: string;
  quantity: number;
  unit_cost_usd: number;
}

/**
 * Operasyon listesi kartı. "Tümünü gör" bağlantısı her kartta aynı yerde, altbilgi satırının sağındadır
 * (başlık açıklamasının uzunluğundan etkilenmez); altbilginin solunda kısa bir sayım notu durabilir.
 */
function ListCard({
  title,
  icon,
  description,
  allHref,
  allLabel = "Tümünü gör",
  note,
  children,
}: {
  title: string;
  icon: LucideIcon;
  description?: ReactNode;
  allHref: string;
  allLabel?: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card
      title={title}
      icon={icon}
      description={description}
      padded={false}
      className="h-full"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="min-w-0 tabular-nums">{note}</span>
          <Link
            href={allHref}
            className="ml-auto inline-flex items-center gap-1 font-medium whitespace-nowrap text-brand-600 hover:text-brand-800 hover:underline"
          >
            {allLabel}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      }
    >
      {children}
    </Card>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <li className="flex items-start justify-between gap-3 px-4 py-2.5 hover:bg-canvas/50">{children}</li>;
}

/** "6 / 47 gösteriliyor" (liste sınırlıysa) */
function shownNote(shown: number, total: number, noun: string) {
  return shown < total ? `${fmtInt(shown)} / ${fmtInt(total)} ${noun} gösteriliyor` : `${fmtInt(total)} ${noun}`;
}

export function RiskList({ rows, allHref }: { rows: Loaded<VariantOverview[]>; allHref: string }) {
  const list = rows.data ?? [];
  const critical = list.filter((r) => r.stock_status === "critical").length;
  const low = list.length - critical;
  const noHistory = list.filter((r) => !hasHistory(r)).length;
  return (
    <ListCard
      title="Kritik stoklar"
      icon={AlertTriangle}
      allHref={allHref}
      description={rows.error ? undefined : `${fmtInt(critical)} kritik · ${fmtInt(low)} minimum altı (aktif varyantlar)`}
      note={
        rows.error || list.length === 0
          ? undefined
          : `${shownNote(Math.min(LIMIT, list.length), list.length, "varyant")}${noHistory ? ` · ${fmtInt(noHistory)} varyantta hiç stok girişi yok` : ""}`
      }
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

function WipRow({ b }: { b: WipBatch }) {
  return (
    <Row>
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
  );
}

function RecentBatchRow({ b }: { b: RecentBatch }) {
  return (
    <Row>
      <div className="min-w-0">
        <Link href={`/uretim/${b.id}`} className="link font-mono text-xs">
          {b.batch_no}
        </Link>
        <p className="text-[13px] text-ink">
          {b.product_name} · {b.variant_name}
        </p>
        <p className="text-xs text-ink-muted tabular-nums">
          Tamamlandı {fmtDate(b.completed_at)} · birim {fmtUnitMoney(b.unit_cost_usd, "USD")}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[13px] font-semibold text-ink tabular-nums">{fmtInt(b.quantity)} adet</p>
        <div className="mt-1">
          <BatchStatusBadge status="completed" />
        </div>
      </div>
    </Row>
  );
}

/**
 * Devam eden üretim partileri. Liste kısaysa (veya boşsa) kartın geri kalanı boş kalmasın diye
 * son tamamlanan üretim partileri (açılış stoğu hariç) ayrı bir alt başlıkla gösterilir.
 */
export function WipList({ rows, isAdmin, recent }: { rows: Loaded<WipBatch[]>; isAdmin: boolean; recent: RecentBatch[] | null }) {
  const list = rows.data ?? [];
  const qty = list.reduce((a, b) => a + Number(b.quantity), 0);
  const recentShown = rows.error ? [] : (recent ?? []).slice(0, Math.max(0, LIMIT - list.length));
  return (
    <ListCard
      title="Devam eden üretim"
      icon={Factory}
      allHref={list.length ? "/uretim?durum=in_production" : "/uretim"}
      allLabel={list.length ? "Tümünü gör" : "Tüm partiler"}
      description={
        rows.error
          ? undefined
          : list.length
            ? `${fmtInt(list.length)} parti · ${fmtInt(qty)} adet üretimde`
            : "Üretimdeki ve son tamamlanan partiler"
      }
      note={rows.error || list.length === 0 ? undefined : shownNote(Math.min(LIMIT, list.length), list.length, "parti")}
    >
      {rows.error ? (
        <ErrorState compact message={rows.error} />
      ) : list.length === 0 && recentShown.length === 0 && recent !== null ? (
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
        <>
          {list.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-canvas/60 px-4 py-2.5">
              <p className="flex items-center gap-2 text-[13px] text-ink-soft">
                <Factory className="size-4 shrink-0 text-ink-muted" aria-hidden />
                Üretimde parti yok
              </p>
              {isAdmin ? (
                <ButtonLink href="/simulasyon" variant="soft" size="sm">
                  <Plus aria-hidden />
                  Üretimi başlat
                </ButtonLink>
              ) : null}
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {list.slice(0, LIMIT).map((b) => (
                <WipRow key={b.id} b={b} />
              ))}
            </ul>
          )}
          {recent === null ? (
            <p className="border-t border-line px-4 py-2.5 text-xs text-ink-muted" role="alert">
              Son tamamlanan partiler yüklenemedi.
            </p>
          ) : recentShown.length ? (
            <>
              <h3
                className={cx(
                  "bg-canvas/60 px-4 py-1.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase",
                  list.length > 0 && "border-t border-line",
                )}
              >
                Son tamamlanan partiler
              </h3>
              <ul className="divide-y divide-line border-t border-line">
                {recentShown.map((b) => (
                  <RecentBatchRow key={b.id} b={b} />
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </ListCard>
  );
}

export function DeliveryList({ rows, isAdmin }: { rows: Loaded<RecentDelivery[]>; isAdmin: boolean }) {
  const list = rows.data ?? [];
  return (
    <ListCard
      title="Son teslimatlar"
      icon={Truck}
      allHref="/teslimatlar"
      description="Heatemp → Mekonsis (satış değildir)"
      note={rows.error || list.length === 0 ? undefined : shownNote(list.length, rows.count ?? list.length, "teslimat")}
    >
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
                <p
                  className={cx(
                    "text-[13px] font-semibold tabular-nums",
                    d.status === "cancelled" ? "text-ink-muted line-through" : "text-ink",
                  )}
                >
                  {fmtInt(d.quantity)} adet
                </p>
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
    <ListCard
      title="Son satışlar"
      icon={Receipt}
      allHref="/satislar"
      description="Mekonsis'in gerçekleştirdiği satışlar"
      note={rows.error || list.length === 0 ? undefined : shownNote(list.length, rows.count ?? list.length, "satış")}
    >
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
                  className={cx(
                    "text-[13px] font-semibold tabular-nums",
                    s.status === "cancelled" ? "text-ink-muted line-through" : "text-ink",
                  )}
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
