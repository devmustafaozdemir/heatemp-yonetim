import {
  CalendarClock,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Ban,
  Calculator,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coins,
  Factory,
  History,
  Layers,
  Package,
  PackageOpen,
  Play,
  Receipt,
  StickyNote,
  Timer,
  TrendingUp,
  Truck,
  Undo2,
  Wallet,
  Warehouse,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, FormField, SubmitButton } from "@/components/forms";
import { fxSourceLabel } from "@/components/FxBadge";
import { DeliveryStatusBadge } from "@/components/status";
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  DefinitionList,
  EmptyState,
  ErrorState,
  IconBox,
  PageHeader,
  StatCard,
  TableWrap,
  cx,
  type Tone,
} from "@/components/ui";
import { Modal } from "@/components/ui/dialog";
import { getAuthContext, requireMember } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtInt, fmtMinutes, fmtMinutes100, fmtMoney, fmtNum, fmtPct, fmtQty, fmtRate, pctChange } from "@/lib/format";
import { isUuid } from "@/lib/parse";
import { load, must } from "@/lib/query";
import type { BatchConsumption, BatchView } from "@/lib/types";
import { UnitCostHistory, type CostHistoryPoint } from "../_components/UnitCostHistory";
import { cancelProduction, completeProduction, updateBatchDates } from "../actions";
import { BatchStatusBadge, CostChange } from "../StatusBadge";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx || !isUuid(id)) return { title: "Parti" };
  const { data } = await ctx.supabase.from("production_batches").select("batch_no").eq("id", id).maybeSingle<{ batch_no: string }>();
  return { title: data ? `Parti ${data.batch_no}` : "Parti" };
}

/** İşlem geçmişi için okunan en fazla stok hareketi satırı (fazlası varsa not düşülür). */
const MOVES_LIMIT = 500;

interface MekonsisLayer {
  layer_id: string;
  delivery_id: string;
  delivery_no: string;
  delivered_on: string;
  delivery_status: "active" | "cancelled";
  delivered_qty: number;
  sold_qty: number;
  qty_remaining: number;
}

interface HeatempLayer {
  produced_qty: number;
  delivered_qty: number;
  qty_remaining: number;
  received_on: string;
}

interface Movement {
  id: number;
  movement_type: string;
  qty: number;
  movement_date: string;
  created_at: string;
  delivery_id: string | null;
  sale_id: string | null;
  deliveries: { delivery_no: string } | null;
  sales: { sale_no: string } | null;
}

type HistoryRow = Pick<BatchView, "id" | "batch_no" | "started_at" | "completed_at" | "unit_cost_try" | "unit_cost_usd" | "quantity">;

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await requireMember();
  const batch = await must(ctx.supabase.from("v_batches").select("*").eq("id", id).maybeSingle<BatchView>(), "Parti");
  if (!batch) notFound();

  const [linesRes, fxRes, heatempRes, mekonsisRes, movesRes, historyRes] = await Promise.all([
    load(ctx.supabase.from("v_batch_consumptions").select("*").eq("batch_id", id).order("material_name").returns<BatchConsumption[]>()),
    load(
      ctx.supabase.from("fx_rates").select("source, rate_type, rate_date").eq("id", batch.fx_rate_id).maybeSingle<{
        source: string;
        rate_type: string;
        rate_date: string;
      }>(),
    ),
    load(
      ctx.supabase
        .from("v_heatemp_shelf")
        .select("produced_qty, delivered_qty, qty_remaining, received_on")
        .eq("batch_id", id)
        .maybeSingle<HeatempLayer>(),
    ),
    load(
      ctx.supabase
        .from("v_mekonsis_shelf")
        .select("layer_id, delivery_id, delivery_no, delivered_on, delivery_status, delivered_qty, sold_qty, qty_remaining")
        .eq("batch_id", id)
        .order("delivered_on")
        .order("delivery_no")
        .returns<MekonsisLayer[]>(),
    ),
    load(
      ctx.supabase
        .from("stock_movements")
        .select("id, movement_type, qty, movement_date, created_at, delivery_id, sale_id, deliveries(delivery_no), sales(sale_no)", {
          count: "exact",
        })
        .eq("batch_id", id)
        .order("movement_date", { ascending: false })
        .order("id", { ascending: false })
        .limit(MOVES_LIMIT)
        .returns<Movement[]>(),
    ),
    batch.kind === "production"
      ? load(
          ctx.supabase
            .from("v_batches")
            .select("id, batch_no, started_at, completed_at, unit_cost_try, unit_cost_usd, quantity")
            .eq("variant_id", batch.variant_id)
            .eq("kind", "production")
            .eq("status", "completed")
            .order("completed_at", { ascending: false })
            .limit(12)
            .returns<HistoryRow[]>(),
        )
      : null,
  ]);

  const isAdmin = ctx.role === "admin";
  const opening = batch.kind === "opening";
  const inProduction = batch.status === "in_production";
  const cancelled = batch.status === "cancelled";
  const completed = batch.status === "completed";
  const fx = fxRes.data;
  const variantHref = `/urunler/${batch.product_id}/varyant/${batch.variant_id}`;

  // Önceki partiye göre birim maliyet: tamamlanmışsa görünümdeki önceki parti,
  // üretimdeyse bu varyantın son tamamlanan üretim partisi (gerçek kayıtlar).
  const history = historyRes?.data ?? [];
  const lastCompleted = inProduction ? (history.find((h) => h.id !== batch.id) ?? null) : null;
  const compare = completed
    ? batch.prev_batch_no
      ? {
          prevNo: batch.prev_batch_no,
          prevId: history.find((h) => h.batch_no === batch.prev_batch_no)?.id ?? null,
          prevUsd: batch.prev_unit_cost_usd,
          prevTry: batch.prev_unit_cost_try,
          pctUsd: batch.unit_cost_usd_change_pct,
          pctTry: batch.unit_cost_try_change_pct,
        }
      : null
    : lastCompleted
      ? {
          prevNo: lastCompleted.batch_no,
          prevId: lastCompleted.id,
          prevUsd: lastCompleted.unit_cost_usd,
          prevTry: lastCompleted.unit_cost_try,
          pctUsd: pctChange(batch.unit_cost_usd, lastCompleted.unit_cost_usd),
          pctTry: pctChange(batch.unit_cost_try, lastCompleted.unit_cost_try),
        }
      : null;

  const historyPoints: CostHistoryPoint[] = [
    ...history
      .filter((h) => h.id !== batch.id)
      .map((h) => ({
        id: h.id,
        batchNo: h.batch_no,
        startedAt: h.started_at,
        completedAt: h.completed_at,
        usd: Number(h.unit_cost_usd),
        try: Number(h.unit_cost_try),
        qty: Number(h.quantity),
        current: false,
        inProduction: false,
      })),
    ...(batch.kind === "production" && !cancelled
      ? [
          {
            id: batch.id,
            batchNo: batch.batch_no,
            startedAt: batch.started_at,
            completedAt: batch.completed_at,
            usd: Number(batch.unit_cost_usd),
            try: Number(batch.unit_cost_try),
            qty: Number(batch.quantity),
            current: true,
            inProduction,
          },
        ]
      : []),
  ].sort((a, b) => (a.completedAt ?? "9999").localeCompare(b.completedAt ?? "9999") || a.batchNo.localeCompare(b.batchNo));

  // Süreler (gerçek zaman damgalarından)
  const cancelMinutes =
    cancelled && batch.cancelled_at ? Math.max(0, (Date.parse(batch.cancelled_at) - Date.parse(batch.started_at)) / 60000) : null;
  const durationValue = opening
    ? "—"
    : completed
      ? fmtMinutes(batch.actual_minutes)
      : inProduction
        ? fmtMinutes(batch.elapsed_minutes)
        : fmtMinutes(cancelMinutes);
  // Tahmini süre yalnızca birim üretim süresi tanımlıysa (> 0) vardır; yoksa karşılaştırma yapılmaz.
  const estimated = Number(batch.estimated_minutes);
  const hasEstimate = !opening && Number.isFinite(estimated) && estimated > 0;
  const overEstimate = inProduction && hasEstimate && Number(batch.elapsed_minutes) > estimated;

  return (
    <>
      <PageHeader
        title={batch.batch_no}
        meta={<BatchStatusBadge status={batch.status} kind={batch.kind} />}
        description={
          <>
            <Link href={variantHref} className="link">
              {batch.display_name}
            </Link>{" "}
            · {fmtInt(batch.quantity)} adet ·{" "}
            {opening ? `açılış tarihi ${fmtDate(heatempRes.data?.received_on ?? null)}` : `başlama ${fmtDateTime(batch.started_at)}`}
          </>
        }
        actions={
          <>
            {!opening ? (
              <ButtonLink href={`/simulasyon?varyant=${batch.variant_id}&adet=${batch.quantity}`} variant="secondary">
                <Calculator aria-hidden />
                Simülasyonu aç
              </ButtonLink>
            ) : null}
            {isAdmin && !cancelled ? (
              <Modal
                trigger={
                  <>
                    <CalendarClock aria-hidden />
                    Tarihleri düzenle
                  </>
                }
                triggerVariant="secondary"
                title={`${batch.batch_no} tarihleri`}
                description="Başlama ve tamamlanma zamanını düzeltin. Rafa giriş günü, raf hareketi ve hammadde tüketim tarihleri birlikte güncellenir; maliyet ve kur değişmez."
                size="sm"
              >
                <ActionForm action={updateBatchDates}>
                  <input type="hidden" name="batch_id" value={batch.id} />
                  <div className="grid gap-3">
                    <FormField name="started_at" label="Başlama zamanı" required>
                      <input className="input" type="datetime-local" name="started_at" defaultValue={trLocalInput(batch.started_at)} required />
                    </FormField>
                    {batch.status === "completed" ? (
                      <FormField
                        name="completed_at"
                        label="Tamamlanma zamanı (rafa giriş)"
                        required
                        hint="Partiden teslimat yapıldıysa ilk teslimat gününden sonra olamaz."
                      >
                        <input className="input" type="datetime-local" name="completed_at" defaultValue={trLocalInput(batch.completed_at)} required />
                      </FormField>
                    ) : null}
                  </div>
                  <div className="mt-4 flex justify-end border-t border-line pt-4">
                    <SubmitButton>Kaydet</SubmitButton>
                  </div>
                </ActionForm>
              </Modal>
            ) : null}
            {isAdmin && inProduction ? (
              <>
                <Modal
                  trigger={
                    <>
                      <XCircle aria-hidden />
                      İptal et
                    </>
                  }
                  triggerVariant="secondary"
                  title={`${batch.batch_no} partisini iptal et`}
                  description="Tüketilen malzemeler aynı birim maliyetle bir kez stoğa iade edilir. Bu işlem geri alınamaz."
                  size="sm"
                >
                  <ActionForm action={cancelProduction}>
                    <input type="hidden" name="batch_id" value={batch.id} />
                    <FormField name="reason" label="İptal gerekçesi" hint="İsteğe bağlı; partiye kaydedilir (en fazla 500 karakter).">
                      <textarea className="input min-h-20" name="reason" maxLength={500} rows={3} />
                    </FormField>
                    <div className="mt-4 flex justify-end border-t border-line pt-4">
                      <SubmitButton variant="danger">
                        <Ban aria-hidden />
                        Partiyi iptal et
                      </SubmitButton>
                    </div>
                  </ActionForm>
                </Modal>
                <ActionForm action={completeProduction} confirmMessage={`${fmtInt(batch.quantity)} adet Heatemp rafına eklensin mi?`}>
                  <input type="hidden" name="batch_id" value={batch.id} />
                  <SubmitButton variant="success">
                    <CheckCircle2 aria-hidden />
                    Tamamla
                  </SubmitButton>
                </ActionForm>
              </>
            ) : null}
          </>
        }
      />

      {opening ? (
        <Alert tone="info" title="Açılış stoğu — üretim sayılmaz" className="mb-4">
          Sistem öncesi mevcut mamul; hammadde tüketmez, üretilen adet, üretim harcaması ve maliyet karşılaştırmasına dahil edilmez. Birim
          maliyet açılış kaydında girildi.
        </Alert>
      ) : inProduction ? (
        <Alert tone="info" title="Parti üretimde" className="mb-4">
          {isAdmin
            ? `“Tamamla” ile ${fmtInt(batch.quantity)} adet Heatemp rafına eklenir. “İptal et” ile tüketilen malzemeler aynı maliyetle stoğa iade edilir.`
            : `Tamamlandığında ${fmtInt(batch.quantity)} adet Heatemp rafına eklenir.`}
        </Alert>
      ) : cancelled ? (
        <Alert tone="warning" title={`Parti iptal edildi · ${fmtDateTime(batch.cancelled_at)}`} className="mb-4">
          Tüketilen malzemeler aynı maliyetle stoğa iade edildi.
          {batch.cancel_reason ? <span className="block">Gerekçe: {batch.cancel_reason}</span> : null}
        </Alert>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Adet"
          value={fmtInt(batch.quantity)}
          unit="adet"
          icon={Package}
          tone="brand"
          description={
            completed
              ? `Heatemp rafında kalan ${batch.heatemp_remaining !== null ? fmtInt(batch.heatemp_remaining) : "—"}`
              : inProduction
                ? "Tamamlanınca Heatemp rafına girer"
                : "İptal edildi; rafa girmedi"
          }
        />
        <StatCard
          label={opening ? "Açılış değeri" : cancelled ? "İptal edilen maliyet" : "Toplam maliyet"}
          value={fmtMoney(batch.total_cost_try, "TRY")}
          icon={cancelled ? Undo2 : Wallet}
          tone={cancelled ? "slate" : "blue"}
          description={`${fmtMoney(batch.total_cost_usd, "USD")} · ${
            opening ? "açılış kaydı" : cancelled ? "malzemeler stoğa iade edildi, maliyet oluşmadı" : "malzeme tüketimi"
          }`}
        />
        <StatCard
          label="Birim maliyet"
          value={fmtMoney(batch.unit_cost_try, "TRY")}
          icon={Coins}
          tone="violet"
          description={fmtMoney(batch.unit_cost_usd, "USD")}
          delta={
            !opening && !cancelled && (compare || completed)
              ? {
                  pct: compare ? (compare.pctUsd === null ? null : Number(compare.pctUsd)) : null,
                  label: "önceki partiye göre (USD)",
                  invert: true,
                }
              : undefined
          }
        />
        <StatCard
          label={opening ? "Üretim süresi" : completed ? "Gerçekleşen süre" : inProduction ? "Geçen süre" : "İptale kadar geçen"}
          value={durationValue}
          icon={Timer}
          tone={overEstimate ? "red" : "amber"}
          description={
            opening
              ? "Açılış stoğunda üretim süresi yok"
              : hasEstimate
                ? `Tahmini ${fmtMinutes(estimated)}${overEstimate ? " · tahmini aştı" : ""}`
                : "Tahmini süre tanımlı değil"
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-w-0 content-start gap-4">
          {/* Kullanılan malzemeler (açılış stoğu hammadde tüketmez) */}
          {!opening ? (
            <Card
              title="Kullanılan malzemeler"
              description="Partiye sabitlenmiş miktar ve maliyetler"
              icon={Layers}
              padded={false}
              actions={
                cancelled && (linesRes.data ?? []).length > 0 ? (
                  <Badge tone="sky" icon={Undo2}>
                    Tümü stoğa iade edildi
                  </Badge>
                ) : null
              }
            >
              {linesRes.error ? (
                <ErrorState message={linesRes.error} compact title="Malzeme tüketimi yüklenemedi" />
              ) : (linesRes.data ?? []).length === 0 ? (
                <EmptyState title="Tüketim kaydı yok" icon={PackageOpen} compact>
                  Bu partiye bağlı malzeme tüketimi bulunamadı.
                </EmptyState>
              ) : (
                <ConsumptionTable lines={linesRes.data!} batch={batch} />
              )}
            </Card>
          ) : null}

          {/* Raf ve satış durumu */}
          <Card
            title="Raf ve teslimat durumu"
            description="Bu partinin mamulleri nerede"
            icon={Warehouse}
            padded={false}
          >
            {heatempRes.error || mekonsisRes.error ? (
              <ErrorState message={(heatempRes.error ?? mekonsisRes.error)!} compact title="Raf bilgisi yüklenemedi" />
            ) : !heatempRes.data ? (
              <EmptyState title={inProduction ? "Henüz rafta değil" : "Rafa girmedi"} icon={Warehouse} compact>
                {inProduction ? "Parti tamamlanınca mamul Heatemp rafına girer." : "İptal edilen parti rafa girmez."}
              </EmptyState>
            ) : (
              <ShelfFlow heatemp={heatempRes.data} layers={mekonsisRes.data ?? []} batch={batch} />
            )}
          </Card>

          <Card title="İşlem geçmişi" description="Gerçek kayıt zamanları ve işlem tarihleri" icon={History}>
            {movesRes.error ? (
              <ErrorState message={movesRes.error} compact title="Hareketler yüklenemedi" />
            ) : (
              <>
                {movesRes.count !== null && movesRes.count > MOVES_LIMIT ? (
                  <Alert tone="info" className="mb-3">
                    Bu partinin {fmtInt(movesRes.count)} stok hareketi var; teslimat ve satış olayları en yeni {fmtInt(MOVES_LIMIT)} hareketten
                    oluşturuldu, daha eskileri burada gösterilmiyor.
                  </Alert>
                ) : null}
                <Timeline events={buildEvents(batch, heatempRes.data ?? null, movesRes.data ?? [])} />
              </>
            )}
          </Card>
        </div>

        <div className="grid min-w-0 content-start gap-4 md:grid-cols-2 xl:grid-cols-1">
          <Card title="Maliyet dökümü" icon={Coins}>
            <DefinitionList
              columns={1}
              items={[
                [opening ? "Açılış değeri (TL)" : "Malzeme toplamı (TL)", <strong key="t">{fmtMoney(batch.total_cost_try, "TRY")}</strong>],
                [opening ? "Açılış değeri (USD)" : "Malzeme toplamı (USD)", fmtMoney(batch.total_cost_usd, "USD")],
                ["Birim maliyet (TL)", <strong key="u">{fmtMoney(batch.unit_cost_try, "TRY", 4)}</strong>],
                ["Birim maliyet (USD)", fmtMoney(batch.unit_cost_usd, "USD", 4)],
                [
                  opening ? "Açılış kuru" : "Başlangıç kuru",
                  <span key="fx" className="block">
                    {fmtRate(batch.fx_rate)}
                    <span className="block text-xs font-normal text-ink-muted">
                      {fx
                        ? `${fxSourceLabel(fx.source, fx.rate_type)} · ${fmtDate(fx.rate_date)}`
                        : fxRes.error
                          ? "Kur kaynağı okunamadı"
                          : "—"}
                    </span>
                  </span>,
                ],
                [
                  "Başlangıçtaki satış fiyatı",
                  batch.sale_price_snapshot !== null
                    ? fmtMoney(batch.sale_price_snapshot, batch.sale_currency_snapshot ?? "USD")
                    : "Tanımlı değildi",
                ],
              ]}
            />
            <p className="mt-2 text-xs text-ink-muted">
              {opening
                ? "Açılış birim maliyeti girildiği para biriminden açılış kuruyla çevrilip partiye sabitlendi."
                : cancelled
                  ? "Parti iptal edildi: tutarlar başlangıçta sabitlenen maliyettir; malzemeler aynı maliyetle stoğa iade edildiği için maliyet oluşmadı."
                  : "TL tutarlar kayıt değeridir (malzemelerin alış günü kurlarıyla); kur partiye başlangıçta sabitlenir."}
            </p>
          </Card>

          {opening ? (
            <Card title="Açılış kaydı" icon={PackageOpen}>
              <DefinitionList
                columns={1}
                items={[
                  ["Açılış (stok) tarihi", fmtDate(heatempRes.data?.received_on ?? null)],
                  ["Kayıt zamanı", fmtDateTime(batch.started_at)],
                  [
                    "Kaynak / açıklama",
                    <span key="n" className="font-normal break-words whitespace-pre-line">
                      {batch.note ?? "—"}
                    </span>,
                  ],
                ]}
              />
            </Card>
          ) : (
            <Card title="Süre" icon={Clock}>
              <DefinitionList
                columns={1}
                items={[
                  [
                    "Üretim süresi (100 adet)",
                    hasEstimate ? fmtMinutes100(batch.unit_production_minutes) : <span className="text-ink-muted">Tanımlı değil</span>,
                  ],
                  ["Tahmini süre", hasEstimate ? fmtMinutes(estimated) : <span className="text-ink-muted">Tanımlı değil</span>],
                  ...(completed
                    ? ([
                        ["Gerçekleşen süre", <strong key="a">{fmtMinutes(batch.actual_minutes)}</strong>],
                        [
                          "Fark",
                          hasEstimate ? (
                            <DurationDiff key="d" actual={Number(batch.actual_minutes)} estimated={estimated} />
                          ) : (
                            <span key="d" className="text-ink-muted">
                              Karşılaştırılamaz
                            </span>
                          ),
                        ],
                      ] as [React.ReactNode, React.ReactNode][])
                    : inProduction
                      ? ([
                          ["Geçen süre", <strong key="e">{fmtMinutes(batch.elapsed_minutes)}</strong>],
                          [
                            "Durum",
                            !hasEstimate ? (
                              <span key="o" className="text-ink-muted">
                                Karşılaştırılamaz
                              </span>
                            ) : overEstimate ? (
                              <Badge key="o" tone="red" icon={Clock}>
                                Tahmini süre aşıldı
                              </Badge>
                            ) : (
                              <span key="o" className="text-ink-muted">
                                Tahmini süre içinde
                              </span>
                            ),
                          ],
                        ] as [React.ReactNode, React.ReactNode][])
                      : ([["İptale kadar geçen", fmtMinutes(cancelMinutes)]] as [React.ReactNode, React.ReactNode][])),
                ]}
              />
              <p className="mt-2 text-xs text-ink-muted">
                {hasEstimate
                  ? "Süreler başlama, tamamlanma ve iptal zaman damgalarından hesaplanır."
                  : "Bu parti başlatılırken birim üretim süresi tanımlı değildi; tahmini süre ve karşılaştırma yapılmaz. Gerçek süre zaman damgalarından hesaplanır."}{" "}
                {!hasEstimate && isAdmin ? (
                  <Link href={variantHref} className="link">
                    Süreyi tanımla
                  </Link>
                ) : null}
              </p>
            </Card>
          )}

          {!opening ? (
            <Card title="Önceki partiye göre birim maliyet" icon={TrendingUp}>
              {cancelled ? (
                <p className="text-[13px] text-ink-muted">İptal edilen parti karşılaştırmaya girmez.</p>
              ) : historyRes?.error ? (
                <ErrorState message={historyRes.error} compact />
              ) : compare ? (
                <>
                  <DefinitionList
                    columns={1}
                    items={[
                      [
                        inProduction ? "Son tamamlanan parti" : "Önceki parti",
                        compare.prevId ? (
                          <Link key="p" href={`/uretim/${compare.prevId}`} className="link font-mono text-xs">
                            {compare.prevNo}
                          </Link>
                        ) : (
                          <span key="p" className="font-mono text-xs">
                            {compare.prevNo}
                          </span>
                        ),
                      ],
                      ["Önceki birim (USD)", fmtMoney(compare.prevUsd, "USD", 4)],
                      ["Bu parti (USD)", fmtMoney(batch.unit_cost_usd, "USD", 4)],
                      [
                        "Değişim (USD)",
                        <CostChange key="c" pct={compare.pctUsd === null ? null : Number(compare.pctUsd)} prev={compare.prevNo} />,
                      ],
                      ["Önceki birim (TL, tarihsel)", fmtMoney(compare.prevTry, "TRY", 4)],
                      ["Değişim (TL, tarihsel)", fmtPct(compare.pctTry, true)],
                    ]}
                  />
                  {inProduction ? <p className="mt-2 text-xs text-ink-muted">Bu partinin maliyeti başlangıçta sabitlendi.</p> : null}
                </>
              ) : (
                <p className="text-[13px] text-ink-muted">
                  Bu varyantın ilk üretim partisi; karşılaştırılacak önceki tamamlanmış parti yok.
                </p>
              )}
              {!cancelled && historyPoints.length >= 2 ? (
                <div className="mt-4 border-t border-line pt-3">
                  <UnitCostHistory points={historyPoints} />
                </div>
              ) : null}
            </Card>
          ) : null}

          {batch.note && !opening ? (
            <Card title="Not" icon={StickyNote}>
              <p className="text-[13px] break-words whitespace-pre-line text-ink-soft">{batch.note}</p>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

/** Gerçekleşen − tahmini süre. Yalnız tahmini süre tanımlıyken (> 0) çağrılır. */
function DurationDiff({ actual, estimated }: { actual: number; estimated: number }) {
  if (!Number.isFinite(actual) || !Number.isFinite(estimated) || estimated <= 0) return <span className="text-ink-muted">—</span>;
  const diff = actual - estimated;
  if (Math.abs(diff) < 1) return <span className="text-ink-muted">Tahminle aynı</span>;
  return diff > 0 ? (
    <Badge tone="red" icon={ArrowUpRight}>
      {fmtMinutes(diff)} uzun
    </Badge>
  ) : (
    <Badge tone="green" icon={ArrowDownRight}>
      {fmtMinutes(-diff)} kısa
    </Badge>
  );
}

function ConsumptionTable({ lines, batch }: { lines: BatchConsumption[]; batch: BatchView }) {
  const total = Number(batch.total_cost_try);
  return (
    <TableWrap>
      <table className="table-base">
        <thead>
          <tr>
            <th>Malzeme</th>
            <th className="num">Tüketilen</th>
            <th className="num">Birim maliyet</th>
            <th className="num">Tutar</th>
            <th>Durum</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const share = total > 0 ? (Number(l.total_try) / total) * 100 : null;
            return (
              <tr key={l.id}>
                <td className="min-w-36">
                  <Link href={`/hammadde/${l.material_id}`} className="link">
                    {l.material_name}
                  </Link>
                  <div className="code">{l.material_code}</div>
                </td>
                <td className="num">
                  {fmtQty(l.qty, l.display_factor, l.display_unit)}
                  <div className="text-xs text-ink-muted">
                    {fmtQty(l.qty_per_unit, l.display_factor, l.display_unit, 4)} × {fmtInt(batch.quantity)}
                  </div>
                </td>
                <td className="num">
                  {fmtMoney(Number(l.unit_cost_try) * Number(l.display_factor), "TRY", 4)}
                  <span className="text-xs text-ink-muted"> / {l.display_unit}</span>
                  <div className="text-xs text-ink-muted">
                    {fmtMoney(Number(l.unit_cost_usd) * Number(l.display_factor), "USD", 4)} / {l.display_unit}
                  </div>
                </td>
                <td className="num">
                  {fmtMoney(l.total_try, "TRY")}
                  <div className="text-xs text-ink-muted">
                    {fmtMoney(l.total_usd, "USD")}
                    {share !== null ? ` · %${fmtNum(share, 1, 1)}` : ""}
                  </div>
                </td>
                <td className="whitespace-nowrap">
                  {l.returned ? (
                    <Badge tone="sky" icon={Undo2}>
                      İade edildi
                    </Badge>
                  ) : (
                    <Badge tone="gray" icon={CheckCircle2}>
                      Tüketildi
                    </Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>Toplam malzeme maliyeti</td>
            <td className="num">
              {fmtMoney(batch.total_cost_try, "TRY")}
              <div className="text-xs font-medium text-ink-muted">{fmtMoney(batch.total_cost_usd, "USD")}</div>
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </TableWrap>
  );
}

function ShelfFlow({ heatemp, layers, batch }: { heatemp: HeatempLayer; layers: MekonsisLayer[]; batch: BatchView }) {
  const active = layers.filter((l) => l.delivery_status === "active");
  const produced = Number(heatemp.produced_qty);
  const atHeatemp = Number(heatemp.qty_remaining);
  const atMekonsis = active.reduce((s, l) => s + Number(l.qty_remaining), 0);
  const sold = active.reduce((s, l) => s + Number(l.sold_qty), 0);
  const delivered = active.reduce((s, l) => s + Number(l.delivered_qty), 0);
  const parts = [
    {
      key: "h",
      label: "Heatemp rafında",
      value: atHeatemp,
      bar: "bg-chart-blue",
      dot: "bg-chart-blue",
      icon: Warehouse,
    },
    {
      key: "m",
      label: "Mekonsis rafında",
      value: atMekonsis,
      bar: "bg-chart-sky",
      dot: "bg-chart-sky",
      icon: Truck,
    },
    {
      key: "s",
      label: "Satıldı",
      value: sold,
      bar: "bg-chart-teal",
      dot: "bg-chart-teal",
      icon: Receipt,
    },
  ];
  const unitTry = Number(batch.unit_cost_try);
  return (
    <>
      <div className="p-4">
        <div
          className="flex h-3 w-full overflow-hidden rounded-full bg-canvas"
          role="img"
          aria-label={`${fmtInt(produced)} adetin dağılımı: Heatemp ${atHeatemp}, Mekonsis ${atMekonsis}, satılan ${sold}`}
        >
          {parts
            .filter((p) => p.value > 0)
            .map((p) => (
              <div key={p.key} className={cx("h-full", p.bar)} style={{ width: `${(p.value / Math.max(1, produced)) * 100}%` }} />
            ))}
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {parts.map((p) => (
            <div key={p.key} className="rounded-md border border-line px-3 py-2.5">
              <dt className="flex items-center gap-1.5 text-xs text-ink-muted">
                <span className={cx("size-2.5 rounded-sm", p.dot)} aria-hidden />
                {p.label}
              </dt>
              <dd className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-lg font-semibold text-ink tabular-nums">
                  {fmtInt(p.value)} <span className="text-xs font-medium text-ink-muted">adet</span>
                </span>
                <span className="text-xs text-ink-muted tabular-nums">
                  {produced > 0 ? `%${fmtNum((p.value / produced) * 100, 1)}` : "—"}
                </span>
              </dd>
              {p.key !== "s" ? (
                <dd className="mt-0.5 text-xs text-ink-muted tabular-nums">maliyet değeri {fmtMoney(p.value * unitTry, "TRY")}</dd>
              ) : null}
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-ink-muted">
          Rafa giren {fmtInt(produced)} adet · Mekonsis&apos;e teslim edilen {fmtInt(delivered)} adet. Teslimat satış değildir; Mekonsis
          rafındaki stok Heatemp&apos;in varlığıdır. Ciro yalnız satışlardan doğar.{" "}
          <Link href="/rafim" className="link">
            Heatemp rafı
          </Link>
        </p>
      </div>
      {layers.length > 0 ? (
        <TableWrap className="border-t border-line">
          <table className="table-base">
            <thead>
              <tr>
                <th>Teslimat</th>
                <th>Tarih</th>
                <th className="num">Teslim edilen</th>
                <th className="num">Satılan</th>
                <th className="num">Mekonsis&apos;te kalan</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {layers.map((l) => (
                <tr key={l.layer_id}>
                  <td className="whitespace-nowrap">
                    <Link href={`/teslimatlar/${l.delivery_id}`} className="link font-mono text-xs">
                      {l.delivery_no}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">{fmtDate(l.delivered_on)}</td>
                  <td className="num">{fmtInt(l.delivered_qty)}</td>
                  <td className="num">{fmtInt(l.sold_qty)}</td>
                  <td className="num">{fmtInt(l.qty_remaining)}</td>
                  <td>
                    <DeliveryStatusBadge status={l.delivery_status} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Toplam (etkin teslimatlar)</td>
                <td className="num">{fmtInt(delivered)}</td>
                <td className="num">{fmtInt(sold)}</td>
                <td className="num">{fmtInt(atMekonsis)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </TableWrap>
      ) : (
        <p className="border-t border-line px-4 py-3 text-xs text-ink-muted">Bu partiden henüz Mekonsis&apos;e teslimat yapılmadı.</p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// İşlem geçmişi
// ---------------------------------------------------------------------------
interface TimelineEvent {
  key: string;
  /** Sıralama anahtarı: YYYY-MM-DD + zaman */
  sort: string;
  when: string;
  title: string;
  detail?: React.ReactNode;
  icon: LucideIcon;
  tone: Tone;
}

function istanbulDate(ts: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}

function buildEvents(batch: BatchView, heatemp: HeatempLayer | null, moves: Movement[]): TimelineEvent[] {
  const ev: TimelineEvent[] = [];
  const stamp = (ts: string) => `${istanbulDate(ts)} ${ts}`;
  if (batch.kind === "opening") {
    const day = heatemp?.received_on ?? istanbulDate(batch.started_at);
    ev.push({
      key: "open",
      sort: `${day} 0`,
      when: fmtDate(day),
      title: "Açılış stoğu kaydedildi",
      detail: `${fmtInt(batch.quantity)} adet Heatemp rafına girdi · kayıt ${fmtDateTime(batch.started_at)}`,
      icon: PackageOpen,
      tone: "violet",
    });
  } else {
    ev.push({
      key: "start",
      sort: stamp(batch.started_at),
      when: fmtDateTime(batch.started_at),
      title: "Üretim başlatıldı",
      detail: `${fmtInt(batch.quantity)} adet · malzeme stoktan düştü (${fmtMoney(batch.total_cost_try, "TRY")})`,
      icon: Play,
      tone: "amber",
    });
    if (batch.completed_at) {
      ev.push({
        key: "complete",
        sort: stamp(batch.completed_at),
        when: fmtDateTime(batch.completed_at),
        title: "Tamamlandı",
        detail: `${fmtInt(batch.quantity)} adet Heatemp rafına eklendi · süre ${fmtMinutes(batch.actual_minutes)}`,
        icon: CheckCircle2,
        tone: "teal",
      });
    }
    if (batch.cancelled_at) {
      ev.push({
        key: "cancel",
        sort: stamp(batch.cancelled_at),
        when: fmtDateTime(batch.cancelled_at),
        title: "İptal edildi",
        detail: `Malzemeler aynı maliyetle stoğa iade edildi${batch.cancel_reason ? ` · Gerekçe: ${batch.cancel_reason}` : ""}`,
        icon: Ban,
        tone: "slate",
      });
    }
  }

  // Stok hareketleri: aynı teslimat/satış için birden çok katman satırı tek olayda toplanır.
  const groups = new Map<
    string,
    {
      type: string;
      qty: number;
      date: string;
      created: string;
      ref: string;
      href: string | null;
    }
  >();
  for (const m of moves) {
    if (!["delivery_out", "delivery_reversal_in", "sale_out", "sale_return"].includes(m.movement_type)) continue;
    const ref = m.movement_type.startsWith("sale") ? (m.sales?.sale_no ?? "Satış") : (m.deliveries?.delivery_no ?? "Teslimat");
    const k = `${m.movement_type}:${m.sale_id ?? m.delivery_id ?? m.id}`;
    const g = groups.get(k);
    if (g) g.qty += Math.abs(Number(m.qty));
    else
      groups.set(k, {
        type: m.movement_type,
        qty: Math.abs(Number(m.qty)),
        date: m.movement_date,
        created: m.created_at,
        ref,
        href: m.movement_type.startsWith("sale")
          ? m.sale_id
            ? `/satislar/${m.sale_id}`
            : null
          : m.delivery_id
            ? `/teslimatlar/${m.delivery_id}`
            : null,
      });
  }
  for (const [k, g] of groups) {
    const meta: Record<string, { title: string; icon: LucideIcon; tone: Tone; text: string }> = {
      delivery_out: {
        title: "Mekonsis'e teslim edildi",
        icon: Truck,
        tone: "sky",
        text: `${fmtInt(g.qty)} adet Heatemp rafından çıktı`,
      },
      delivery_reversal_in: {
        title: "Teslimat iptal edildi",
        icon: ArrowLeftRight,
        tone: "slate",
        text: `${fmtInt(g.qty)} adet Heatemp rafına döndü`,
      },
      sale_out: {
        title: "Satış",
        icon: Receipt,
        tone: "teal",
        text: `${fmtInt(g.qty)} adet Mekonsis rafından satıldı`,
      },
      sale_return: {
        title: "Satış iptali",
        icon: Undo2,
        tone: "slate",
        text: `${fmtInt(g.qty)} adet Mekonsis rafına döndü`,
      },
    };
    const x = meta[g.type];
    ev.push({
      key: k,
      sort: `${g.date} ${g.created}`,
      when: fmtDate(g.date),
      title: x.title,
      detail: (
        <>
          {g.href ? (
            <Link href={g.href} className="link font-mono text-xs">
              {g.ref}
            </Link>
          ) : (
            <span className="font-mono text-xs text-ink-soft">{g.ref}</span>
          )}{" "}
          · {x.text}
        </>
      ),
      icon: x.icon,
      tone: x.tone,
    });
  }
  return ev.sort((a, b) => b.sort.localeCompare(a.sort));
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return <EmptyState title="Kayıt yok" icon={Factory} compact />;
  const LIMIT = 8;
  const head = events.slice(0, LIMIT);
  const rest = events.slice(LIMIT);
  const item = (e: TimelineEvent) => (
    <li key={e.key} className="relative flex gap-3 pb-4 last:pb-0">
      {/* Opak zemin: zaman çizgisi ikonun arkasında kalır. */}
      <span className="relative z-10 flex shrink-0 rounded-md bg-white">
        <IconBox icon={e.icon} tone={e.tone} size="sm" />
      </span>
      <div className="min-w-0 pt-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] font-medium text-ink">{e.title}</span>
          <span className="text-xs text-ink-muted tabular-nums">{e.when}</span>
        </div>
        {e.detail ? <div className="mt-0.5 text-xs break-words text-ink-muted">{e.detail}</div> : null}
      </div>
    </li>
  );
  return (
    <div>
      <ol className="relative before:absolute before:top-2 before:bottom-2 before:left-4 before:w-px before:bg-line">{head.map(item)}</ol>
      {rest.length > 0 ? (
        <details className="group mt-3">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-xs font-medium text-brand-600 hover:underline [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
            <span className="group-open:hidden">Daha eski {fmtInt(rest.length)} kaydı göster</span>
            <span className="hidden group-open:inline">Daha eski {fmtInt(rest.length)} kaydı gizle</span>
          </summary>
          <ol className="relative mt-3 before:absolute before:top-2 before:bottom-2 before:left-4 before:w-px before:bg-line">
            {rest.map(item)}
          </ol>
        </details>
      ) : null}
    </div>
  );
}

/** ISO zamanı Türkiye saatinde datetime-local alan değerine çevirir ("YYYY-AA-GGTSS:DD"). */
function trLocalInput(iso: string | null): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}
