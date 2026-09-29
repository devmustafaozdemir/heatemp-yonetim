import { Ban, CalendarClock, CircleCheck, Layers, Package, Receipt, Store, Truck, Undo2, Wallet, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BatchStatusBadge, DeliveryStatusBadge, SaleStatusBadge } from "@/components/status";
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  cx,
  DefinitionList,
  EmptyState,
  ErrorState,
  IconBox,
  PageHeader,
  ProgressBar,
  StatCard,
  TableWrap,
  type Tone,
} from "@/components/ui";
import { Modal } from "@/components/ui/dialog";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtInt, fmtMoney, fmtPct, fmtUnitMoney, todayTr } from "@/lib/format";
import { isUuid } from "@/lib/parse";
import { load, must } from "@/lib/query";
import type { MekonsisShelfRow, SaleAllocationView } from "@/lib/types";
import { daysSince } from "../../rafim/_components/types";
import { CancelDeliveryForm } from "./CancelDeliveryForm";

export const metadata: Metadata = { title: "Teslimat" };

interface DeliveryDetail {
  id: string;
  delivery_no: string;
  delivered_on: string;
  variant_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  variant_code: string;
  variant_name: string;
  display_name: string;
  quantity: number;
  status: "active" | "cancelled";
  note: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
  sold_qty: number;
  remaining_qty: number;
  delivered_cost_try: number;
  batches: string | null;
}

interface SaleLine {
  id: string;
  sale_id: string;
  sale_no: string;
  sold_on: string;
  status: "completed" | "cancelled";
  customer_name: string | null;
  currency: "USD" | "TRY";
  unit_price: number;
}

export default async function DeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await requireMember();
  const isAdmin = ctx.role === "admin";
  const today = todayTr();

  const d = await must(ctx.supabase.from("v_deliveries").select("*").eq("id", id).maybeSingle<DeliveryDetail>(), "Teslimat");
  if (!d) notFound();

  const [layersRes, allocRes] = await Promise.all([
    load(ctx.supabase.from("v_mekonsis_shelf").select("*").eq("delivery_id", id).order("batch_no").returns<MekonsisShelfRow[]>()),
    load(ctx.supabase.from("v_sale_allocations").select("*").eq("delivery_id", id).order("id").returns<SaleAllocationView[]>()),
  ]);
  const allocs = allocRes.data ?? [];
  const batchIds = Array.from(new Set((layersRes.data ?? []).map((l) => l.batch_id)));
  const itemIds = Array.from(new Set(allocs.map((a) => a.sale_item_id)));
  const [batchRes, entryRes, linesRes] = await Promise.all([
    batchIds.length
      ? load(
          ctx.supabase
            .from("production_batches")
            .select("id, kind, completed_at")
            .in("id", batchIds)
            .returns<{ id: string; kind: "production" | "opening"; completed_at: string | null }[]>(),
        )
      : Promise.resolve({ data: [], error: null, count: null }),
    // Partinin Heatemp rafına giriş tarihi (açılış stoğunda sayım tarihi; completed_at kayıt anıdır).
    // Her partinin tek bir Heatemp katmanı vardır; kalan adetten bağımsız okunur.
    batchIds.length
      ? load(
          ctx.supabase
            .from("v_heatemp_shelf")
            .select("batch_id, received_on, completed_at")
            .in("batch_id", batchIds)
            .returns<{ batch_id: string; received_on: string; completed_at: string | null }[]>(),
        )
      : Promise.resolve({ data: [], error: null, count: null }),
    itemIds.length
      ? load(
          ctx.supabase
            .from("v_sale_lines")
            .select("id, sale_id, sale_no, sold_on, status, customer_name, currency, unit_price")
            .in("id", itemIds)
            .returns<SaleLine[]>(),
        )
      : Promise.resolve({ data: [] as SaleLine[], error: null, count: null }),
  ]);
  const batchInfo = new Map((batchRes.data ?? []).map((b) => [b.id, b]));
  const entryOn = new Map((entryRes.data ?? []).map((e) => [e.batch_id, e]));
  const lineById = new Map((linesRes.data ?? []).map((l) => [l.id, l]));
  // Katmanlar Heatemp FIFO sırasıyla: rafa giriş tarihi, sonra giriş (tamamlanma/kayıt) anı
  const layers = [...(layersRes.data ?? [])].sort((a, b) => {
    const ea = entryOn.get(a.batch_id);
    const eb = entryOn.get(b.batch_id);
    return (
      (ea?.received_on ?? "").localeCompare(eb?.received_on ?? "") ||
      (ea?.completed_at ?? "").localeCompare(eb?.completed_at ?? "") ||
      a.batch_no.localeCompare(b.batch_no)
    );
  });

  const cancelled = d.status === "cancelled";
  const canCancel = isAdmin && !cancelled && d.sold_qty === 0;
  const soldPct = d.quantity > 0 ? (d.sold_qty / d.quantity) * 100 : 0;
  // Hata ≠ boş: katmanlar yüklenemediyse tutarlar bilinmiyor (null → "—")
  const remainingValue = layersRes.error ? null : layers.reduce((s, l) => s + Number(l.value_try), 0);
  const deliveredUsd = layersRes.error ? null : layers.reduce((s, l) => s + l.delivered_qty * Number(l.unit_cost_usd), 0);

  const saleRows = allocs
    .map((a) => ({ ...a, line: lineById.get(a.sale_item_id) ?? null }))
    .sort((a, b) => (a.line?.sold_on ?? "").localeCompare(b.line?.sold_on ?? "") || a.id - b.id);
  // Satış durumu (iptal/gerçekleşti) satır bilgisinden gelir; ikisi de yüklenmeden özet verilmez.
  const salesError = allocRes.error ?? linesRes.error;
  const activeAllocs = saleRows.filter((a) => a.line?.status !== "cancelled");
  const activeSales = new Set(activeAllocs.map((a) => a.sale_id)).size;
  const allocQty = activeAllocs.reduce((s, a) => s + a.quantity, 0);
  const allocCost = activeAllocs.reduce((s, a) => s + Number(a.cost_try), 0);
  const cancelledSales = new Set(saleRows.filter((a) => a.line?.status === "cancelled").map((a) => a.sale_id)).size;
  const lastSaleOn = activeAllocs.reduce<string | null>((m, a) => (a.line && (!m || a.line.sold_on > m) ? a.line.sold_on : m), null);
  const soldOut = !cancelled && d.remaining_qty === 0 && d.sold_qty > 0;

  // Zaman çizelgesi (gerçek kayıtlar): teslimat → satışlar (tarih sırasıyla) → geri alma
  type Ev = { at: string; sortKey: string; icon: LucideIcon; tone: Tone; title: string; body: ReactNode };
  const events: Ev[] = [
    {
      at: fmtDate(d.delivered_on),
      sortKey: "0",
      icon: Truck,
      tone: "sky",
      title: "Teslim edildi",
      body: `${fmtInt(d.quantity)} adet Heatemp rafından Mekonsis rafına aktarıldı · kayıt ${fmtDateTime(d.created_at)}`,
    },
  ];
  const bySale = new Map<string, { sale_id: string; line: SaleLine | null; qty: number }>();
  for (const a of saleRows) {
    const e = bySale.get(a.sale_id) ?? { sale_id: a.sale_id, line: a.line, qty: 0 };
    e.qty += a.quantity;
    bySale.set(a.sale_id, e);
  }
  for (const s of bySale.values()) {
    const isCancelled = s.line?.status === "cancelled";
    events.push({
      at: fmtDate(s.line?.sold_on),
      sortKey: `1-${s.line?.sold_on ?? ""}`,
      icon: isCancelled ? Ban : Receipt,
      tone: isCancelled ? "slate" : "teal",
      title: isCancelled ? "Satış (iptal edildi)" : "Satış",
      body: (
        <>
          <Link href={`/satislar/${s.sale_id}`} className="link font-mono text-xs">
            {s.line?.sale_no ?? "Satış"}
          </Link>{" "}
          · {fmtInt(s.qty)} adet{s.line?.customer_name ? ` · ${s.line.customer_name}` : ""}
          {isCancelled ? " · adetler rafa döndü" : ""}
        </>
      ),
    });
  }
  if (cancelled) {
    events.push({
      at: fmtDateTime(d.cancelled_at),
      sortKey: "2",
      icon: Undo2,
      tone: "amber",
      title: "Teslimat geri alındı",
      body: d.cancel_reason ? `Gerekçe: ${d.cancel_reason}` : "Ürünler Heatemp rafına döndü",
    });
  }
  events.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  return (
    <>
      <PageHeader
        title={d.delivery_no}
        meta={
          <>
            <DeliveryStatusBadge status={d.status} />
            <Badge tone="gray" title="Teslimat ciro veya kâr oluşturmaz">
              Satış değildir
            </Badge>
          </>
        }
        description={`${fmtDate(d.delivered_on)} · ${d.display_name} · Heatemp → Mekonsis`}
        actions={
          <>
            <ButtonLink href="/teslimatlar" variant="secondary">
              <Truck aria-hidden />
              Tüm teslimatlar
            </ButtonLink>
            <ButtonLink href="/mekonsis" variant="secondary">
              <Store aria-hidden />
              Mekonsis rafı
            </ButtonLink>
            {canCancel ? (
              <Modal
                trigger={
                  <>
                    <Undo2 aria-hidden />
                    Teslimatı geri al
                  </>
                }
                triggerVariant="danger"
                title={`${d.delivery_no} geri alınsın mı?`}
                description="Bu teslimattan satış yapılmadığı için geri alınabilir. Ürünler aynı partilerle Heatemp rafına döner."
                size="sm"
              >
                <CancelDeliveryForm
                  deliveryId={d.id}
                  displayName={d.display_name}
                  remainingQty={d.remaining_qty}
                  remainingValue={remainingValue}
                />
              </Modal>
            ) : null}
          </>
        }
      />

      {cancelled ? (
        <Alert tone="warning" title="Bu teslimat geri alındı" className="mb-4">
          {fmtDateTime(d.cancelled_at)}
          {d.cancel_reason ? ` — ${d.cancel_reason}` : ""}. Ürünler aynı partilerle Heatemp rafına döndü; teslimat toplamlarına dahil
          değildir.
        </Alert>
      ) : null}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Teslim edilen"
          value={fmtInt(d.quantity)}
          unit="adet"
          icon={Package}
          tone="sky"
          description={`Parti maliyeti ${fmtMoney(d.delivered_cost_try, "TRY")} · ${
            deliveredUsd === null ? "USD karşılığı yüklenemedi" : `${fmtMoney(deliveredUsd, "USD")} (bilgi)`
          }`}
        />
        <StatCard
          label="Satılan"
          value={cancelled ? "—" : fmtInt(d.sold_qty)}
          unit={cancelled ? undefined : "adet"}
          icon={CircleCheck}
          tone="teal"
          description={
            salesError
              ? cancelled
                ? "Satış kayıtları yüklenemedi"
                : `${fmtPct(soldPct)} · satış ayrıntıları yüklenemedi`
              : cancelled
                ? cancelledSales > 0
                  ? `${fmtInt(cancelledSales)} satış yapılmış, iptal edilmişti; adetler rafa döndü`
                  : "Geri alınan teslimattan satış yapılmadı"
                : activeSales === 0
                  ? "Bu teslimattan henüz satış yapılmadı"
                  : `${fmtPct(soldPct)} · ${fmtInt(activeSales)} satış · satılan ürün maliyeti ${fmtMoney(allocCost, "TRY")}`
          }
        />
        <StatCard
          label="Mekonsis'te kalan"
          value={cancelled ? "—" : fmtInt(d.remaining_qty)}
          unit={cancelled ? undefined : "adet"}
          icon={Wallet}
          tone="blue"
          description={
            cancelled
              ? "Ürünler Heatemp rafına döndü"
              : remainingValue === null
                ? "Kalan maliyet değeri yüklenemedi"
                : `Kalan maliyet değeri ${fmtMoney(remainingValue, "TRY")}`
          }
        />
        {cancelled ? (
          <StatCard
            label="Geri alındı"
            value={fmtDate(d.cancelled_at)}
            icon={CalendarClock}
            tone="amber"
            description={`Teslimat tarihi ${fmtDate(d.delivered_on)}`}
          />
        ) : soldOut ? (
          <StatCard
            label="Tükenme süresi"
            value={!salesError && lastSaleOn ? `${fmtInt(daysSince(d.delivered_on, lastSaleOn))} gün` : "—"}
            icon={CalendarClock}
            tone="amber"
            description={
              !salesError && lastSaleOn
                ? `Tamamı satıldı · teslimat ${fmtDate(d.delivered_on)} → son satış ${fmtDate(lastSaleOn)}`
                : "Tamamı satıldı · satış tarihleri yüklenemedi"
            }
          />
        ) : (
          <StatCard
            label="Rafta geçen süre"
            value={`${fmtInt(daysSince(d.delivered_on, today))} gün`}
            icon={CalendarClock}
            tone="amber"
            description={`Teslimat tarihi ${fmtDate(d.delivered_on)}${
              !salesError && lastSaleOn ? ` · son satış ${fmtDate(lastSaleOn)}` : ""
            }`}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid min-w-0 content-start gap-4">
          <Card
            title="Parti katmanları"
            description="Bu teslimatla Mekonsis rafına aktarılan partiler (FIFO veya seçilen parti). Parti kimliği ve birim maliyeti korunur."
            icon={Layers}
            padded={false}
          >
            {layersRes.error ? (
              <ErrorState message={layersRes.error} compact />
            ) : layers.length === 0 ? (
              <EmptyState title="Parti katmanı bulunamadı" compact />
            ) : (
              <TableWrap className="relative">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Parti</th>
                      <th className="num hidden sm:table-cell">Teslim edilen</th>
                      <th className="num hidden sm:table-cell">Satılan</th>
                      <th className="num">Kalan</th>
                      <th className="num hidden min-[87.5rem]:table-cell">Birim maliyet</th>
                      <th className="num hidden 2xl:table-cell">Teslim maliyeti (TL)</th>
                      <th className="num">Kalan değer (TL)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {layers.map((l) => {
                      const b = batchInfo.get(l.batch_id);
                      const entry = entryOn.get(l.batch_id);
                      return (
                        <tr key={l.layer_id}>
                          <td>
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                              <Link href={`/uretim/${l.batch_id}`} className="link font-mono text-xs">
                                {l.batch_no}
                              </Link>
                              {b?.kind === "opening" ? <BatchStatusBadge status="completed" kind="opening" /> : null}
                            </div>
                            <span className="block text-[11px] text-ink-muted">
                              Rafa giriş:{" "}
                              {entry ? fmtDate(entry.received_on) : entryRes.error ? "yüklenemedi" : "—"}
                            </span>
                            <span className="block text-[11px] text-ink-muted sm:hidden">
                              {fmtInt(l.delivered_qty)} teslim · {fmtInt(l.sold_qty)} satıldı
                            </span>
                            <span className="block text-[11px] text-ink-muted min-[87.5rem]:hidden">
                              Birim {fmtUnitMoney(l.unit_cost_try, "TRY")} · {fmtUnitMoney(l.unit_cost_usd, "USD")}
                            </span>
                          </td>
                          <td className="num hidden sm:table-cell">{fmtInt(l.delivered_qty)}</td>
                          <td className="num hidden sm:table-cell">{fmtInt(l.sold_qty)}</td>
                          <td className="num font-semibold text-ink">{fmtInt(l.qty_remaining)}</td>
                          <td className="num hidden min-[87.5rem]:table-cell">
                            {fmtUnitMoney(l.unit_cost_try, "TRY")}
                            <span className="block text-[11px] text-ink-muted">{fmtUnitMoney(l.unit_cost_usd, "USD")}</span>
                          </td>
                          <td className="num hidden 2xl:table-cell">{fmtMoney(l.delivered_qty * Number(l.unit_cost_try), "TRY")}</td>
                          <td className="num">{fmtMoney(l.value_try, "TRY")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {layers.length > 1 ? (
                    <tfoot>
                      <tr>
                        <td>Toplam</td>
                        <td className="num hidden sm:table-cell">{fmtInt(layers.reduce((s, l) => s + l.delivered_qty, 0))}</td>
                        <td className="num hidden sm:table-cell">{fmtInt(layers.reduce((s, l) => s + l.sold_qty, 0))}</td>
                        <td className="num">{fmtInt(layers.reduce((s, l) => s + l.qty_remaining, 0))}</td>
                        <td className="hidden min-[87.5rem]:table-cell" />
                        <td className="num hidden 2xl:table-cell">{fmtMoney(d.delivered_cost_try, "TRY")}</td>
                        <td className="num">{fmtMoney(remainingValue, "TRY")}</td>
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </TableWrap>
            )}
            {batchRes.error || entryRes.error ? (
              <Alert tone="error" className="m-4 mt-3">
                Parti bilgileri yüklenemedi: {batchRes.error ?? entryRes.error}
              </Alert>
            ) : null}
          </Card>

          <Card
            title="Bu teslimattan yapılan satışlar"
            description="Satışlar Mekonsis rafındaki en eski teslimattan başlayarak (FIFO) tahsis edilir. Maliyet, partinin kayıtlı birim maliyetidir."
            icon={Receipt}
            padded={false}
            footer={
              !salesError && activeAllocs.length
                ? `Gerçekleşen: ${fmtInt(allocQty)} adet · ${fmtInt(activeSales)} satış · satılan ürün maliyeti ${fmtMoney(allocCost, "TRY")}`
                : undefined
            }
          >
            {allocRes.error ? (
              <ErrorState message={allocRes.error} compact />
            ) : saleRows.length === 0 ? (
              <EmptyState
                title={cancelled ? "Bu teslimattan satış yapılmadı" : "Bu teslimattan henüz satış yapılmadı"}
                icon={Receipt}
                compact
              >
                {cancelled
                  ? "Teslimat geri alındı; ürünler Heatemp rafına döndü, bu teslimattan satış yapılamaz."
                  : `${fmtInt(d.remaining_qty)} adet Mekonsis rafında satış bekliyor.`}
              </EmptyState>
            ) : (
              <TableWrap className="relative">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Satış</th>
                      <th className="hidden sm:table-cell">Müşteri</th>
                      <th className="hidden 2xl:table-cell">Parti</th>
                      <th className="num">Adet</th>
                      <th className="num hidden 2xl:table-cell">Birim maliyet (TL)</th>
                      <th className="num">Maliyet (TL)</th>
                      <th className="num hidden min-[87.5rem]:table-cell">Satış birim fiyatı</th>
                      <th className="hidden sm:table-cell">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saleRows.map((a) => {
                      const isCancelled = a.line?.status === "cancelled";
                      return (
                        <tr key={a.id} className={cx(isCancelled && "text-ink-muted")}>
                          <td className="whitespace-nowrap">
                            <Link href={`/satislar/${a.sale_id}`} className="link font-mono text-xs">
                              {a.line?.sale_no ?? "Satış"}
                            </Link>
                            <span className="block text-[11px] text-ink-muted">
                              {fmtDate(a.line?.sold_on)}
                              <span className="2xl:hidden">
                                {" · "}
                                <Link href={`/uretim/${a.batch_id}`} className="link font-mono">
                                  {a.batch_no}
                                </Link>
                              </span>
                            </span>
                            <span className="block max-w-[11rem] text-[11px] whitespace-normal text-ink-muted sm:hidden">
                              {a.line?.customer_name ?? "Müşteri belirtilmedi"}
                              {isCancelled ? " · iptal, adet rafa döndü" : ""}
                            </span>
                          </td>
                          <td className="hidden min-w-[8rem] sm:table-cell">
                            {a.line?.customer_name ?? <span className="text-xs text-ink-muted">Belirtilmedi</span>}
                          </td>
                          <td className="hidden whitespace-nowrap 2xl:table-cell">
                            <Link href={`/uretim/${a.batch_id}`} className="link font-mono text-xs">
                              {a.batch_no}
                            </Link>
                          </td>
                          <td className="num font-medium">{fmtInt(a.quantity)}</td>
                          <td className="num hidden 2xl:table-cell">{fmtUnitMoney(a.unit_cost_try, "TRY")}</td>
                          <td className="num">{fmtMoney(a.cost_try, "TRY")}</td>
                          <td className="num hidden min-[87.5rem]:table-cell">{a.line ? fmtUnitMoney(a.line.unit_price, a.line.currency) : "—"}</td>
                          <td className="hidden sm:table-cell">
                            {a.line ? <SaleStatusBadge status={a.line.status} /> : "—"}
                            {isCancelled ? <span className="mt-0.5 block text-[11px]">adet rafa döndü</span> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
            )}
            {linesRes.error ? (
              <Alert tone="error" className="m-4 mt-3">
                Satış bilgileri (numara, tarih, müşteri, durum) yüklenemedi: {linesRes.error}
              </Alert>
            ) : null}
          </Card>
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <Card title="Teslimat bilgileri" icon={Truck}>
            <DefinitionList
              columns={1}
              items={[
                [
                  "Teslimat no",
                  <span key="n" className="font-mono text-xs">
                    {d.delivery_no}
                  </span>,
                ],
                ["Teslimat tarihi", fmtDate(d.delivered_on)],
                [
                  "Ürün / varyant",
                  <Link key="v" href={`/urunler/${d.product_id}/varyant/${d.variant_id}?sekme=stok`} className="link">
                    {d.display_name}
                  </Link>,
                ],
                [
                  "Varyant kodu",
                  <span key="c" className="code">
                    {d.variant_code}
                  </span>,
                ],
                ["Durum", <DeliveryStatusBadge key="s" status={d.status} />],
                ["Parti sayısı", layersRes.error ? "—" : fmtInt(layers.length)],
                ["Kayıt zamanı", fmtDateTime(d.created_at)],
                ...(d.note ? ([["Not", d.note]] as [string, string][]) : []),
                ...(cancelled
                  ? ([
                      ["Geri alma zamanı", fmtDateTime(d.cancelled_at)],
                      ["Gerekçe", d.cancel_reason ?? "—"],
                    ] as [string, string][])
                  : []),
              ]}
            />
          </Card>

          {!cancelled ? (
            <Card title="Satış durumu" icon={CircleCheck}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[22px] font-semibold text-ink tabular-nums">{fmtPct(soldPct)}</span>
                <span className="text-xs text-ink-muted">
                  {fmtInt(d.sold_qty)} / {fmtInt(d.quantity)} adet satıldı
                </span>
              </div>
              <div className="mt-2">
                <ProgressBar value={d.sold_qty} max={d.quantity} tone="teal" label="Bu teslimatın satış oranı" />
              </div>
              <p className="mt-3 text-xs text-ink-muted">
                {d.remaining_qty > 0
                  ? `${fmtInt(d.remaining_qty)} adet${
                      remainingValue === null ? "" : ` (${fmtMoney(remainingValue, "TRY")})`
                    } Mekonsis rafında; satılana kadar Heatemp'in varlığıdır.`
                  : `Bu teslimatın tamamı satıldı${!salesError && lastSaleOn ? ` (son satış ${fmtDate(lastSaleOn)})` : ""}.`}
              </p>
              {isAdmin && d.sold_qty > 0 ? (
                <Alert tone="info" className="mt-3">
                  Bu teslimattan satış yapıldığı için geri alınamaz. Gerekirse önce ilgili satışları iptal edin.
                </Alert>
              ) : null}
            </Card>
          ) : null}

          <Card title="Geçmiş" icon={CalendarClock}>
            <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-line">
              {events.map((e, i) => (
                <li key={i} className="relative flex gap-3">
                  <span className="z-[1] shrink-0 rounded-md bg-white ring-4 ring-white">
                    <IconBox icon={e.icon} tone={e.tone} size="sm" />
                  </span>
                  <div className="min-w-0 text-[13px]">
                    <p className="font-medium text-ink">
                      {e.title} <span className="ml-1 text-xs font-normal text-ink-muted">{e.at}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">{e.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            {salesError ? (
              <Alert tone="error" className="mt-3">
                Satış kayıtları yüklenemedi; çizelgede satışlar eksik olabilir.
              </Alert>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}
