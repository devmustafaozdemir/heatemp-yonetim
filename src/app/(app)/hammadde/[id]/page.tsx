import {
  ArrowDownToLine,
  Boxes,
  CalendarClock,
  Calculator,
  ChevronRight,
  History,
  Info,
  ListTree,
  Lock,
  PackageMinus,
  Pencil,
  Scale,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, ButtonLink, Card, EmptyState, ErrorState, IconBox, PageHeader, StatCard, TableWrap } from "@/components/ui";
import { Drawer } from "@/components/ui/dialog";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { LinkSegmented, Pagination, SortTh } from "@/components/ui/list";
import { getAuthContext, requireMember } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtInt, fmtMoney, fmtMonth, fmtNum, fmtQty, fmtRate, fmtUnitMoney, todayTr } from "@/lib/format";
import { hrefWith, isoDateOrNull, parseListParams, searchPattern, type SearchParams } from "@/lib/list-params";
import { isUuid } from "@/lib/parse";
import { addDays } from "@/lib/period";
import { load, must } from "@/lib/query";
import type { MaterialMovement, SupplierOption, Unit, UnitKind } from "@/lib/types";
import { updateMaterial } from "../actions";
import { KindBadge, MOVEMENT_META, MOVEMENT_ORDER, MaterialStateBadge, MovementBadge, movementTypeFromKey } from "../_components/bits";
import { CorrectPurchase, DeleteMovement } from "../_components/CorrectPurchase";
import { lastPageOf, loadPage } from "../_components/paging";
import { StockFlowChart, type StockFlowPoint } from "../_components/StockFlowChart";
import { toOption, type MaterialListRow, type MonthlyFlowRow } from "../_components/types";
import { WriteOffForm } from "../_components/WriteOffForm";
import { MaterialFields } from "../MaterialForm";
import { ReceiveForm } from "../ReceiveForm";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx || !isUuid(id)) return { title: "Malzeme" };
  const { data } = await ctx.supabase.from("raw_materials").select("name, code").eq("id", id).maybeSingle<{ name: string; code: string }>();
  return { title: data ? `${data.name} (${data.code})` : "Malzeme" };
}

/** 1280–1400 px arasında Tutar ve Kur sütunları Birim fiyat hücresine katlanır (tablo yatay kaymasın). */
const WIDE_CELL = "hidden min-[1400px]:table-cell";
const NARROW_ONLY = "min-[1400px]:hidden";
const MOBILE_SORTS = [
  { key: "movement_date", label: "Tarih", dir: "desc" },
  { key: "qty", label: "Miktar", dir: "desc" },
  { key: "value_try", label: "Değer", dir: "desc" },
] as const;

const UNIT_KIND_LABEL: Record<UnitKind, string> = {
  count: "Adet",
  mass: "Ağırlık",
  length: "Uzunluk",
  area: "Alan",
  volume: "Hacim",
};

type LastPurchase = Pick<
  MaterialMovement,
  | "movement_date"
  | "entry_qty"
  | "entry_unit"
  | "unit_price"
  | "currency"
  | "total_amount"
  | "supplier"
  | "qty"
  | "value_try"
  | "unit_cost_try"
  | "unit_cost_usd"
  | "balance_qty_after"
  | "balance_value_try_after"
>;
type BomUse = {
  id: string;
  variant_id: string;
  qty_per_unit: number;
  entry_qty: number;
  entry_unit: string;
};
type VariantInfo = {
  id: string;
  display_name: string;
  product_id: string;
  variant_code: string;
  is_active: boolean;
};

export default async function MaterialPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await requireMember();
  const isAdmin = ctx.role === "admin";
  const base = `/hammadde/${id}`;
  const lp = parseListParams(await searchParams, {
    sortable: ["movement_date", "qty", "value_try"],
    defaultSort: "movement_date",
    defaultDir: "desc",
  });
  const values = lp.values;
  const today = todayTr();

  const material = await must(ctx.supabase.from("v_material_list").select("*").eq("id", id).maybeSingle<MaterialListRow>(), "Malzeme");
  if (!material) notFound();

  // Hareket geçmişi: sunucu tarafı filtre, sıralama ve sayfalama
  const type = movementTypeFromKey(values.tur);
  const from = isoDateOrNull(values.bas);
  const to = isoDateOrNull(values.bit);
  const pattern = searchPattern(lp.q);
  const movementQuery = (columns: string, head = false) => {
    let mq = ctx.supabase.from("material_movements").select(columns, { count: "exact", head }).eq("material_id", id);
    if (type) mq = mq.eq("movement_type", type);
    if (from) mq = mq.gte("movement_date", from);
    if (to) mq = mq.lte("movement_date", to);
    if (pattern) mq = mq.or(`supplier.ilike.${pattern},note.ilike.${pattern}`);
    return mq;
  };

  const grain = flowGrain(values.seyir);
  const grainBuckets = flowBuckets(grain, today);
  const [units, movements, lastPurchase, flows, bom, supplierRes, grainFlows, vatRes] = await Promise.all([
    must(ctx.supabase.from("units").select("*").eq("kind", material.unit_kind).order("sort_order").returns<Unit[]>(), "Birimler"),
    loadPage(
      movementQuery("*")
        .order(lp.sort ?? "movement_date", { ascending: lp.dir === "asc" })
        .order("id", { ascending: lp.dir === "asc" })
        .range(lp.from, lp.to)
        .returns<MaterialMovement[]>(),
    ),
    load(
      ctx.supabase
        .from("material_movements")
        .select(
          "movement_date, entry_qty, entry_unit, unit_price, currency, total_amount, supplier, qty, value_try, unit_cost_try, unit_cost_usd, balance_qty_after, balance_value_try_after",
        )
        .eq("material_id", id)
        .eq("movement_type", "purchase")
        .order("movement_date", { ascending: false })
        .order("id", { ascending: false })
        .limit(2)
        .returns<LastPurchase[]>(),
    ),
    load<MonthlyFlowRow[]>(ctx.supabase.rpc("material_monthly_flows", { p_material_id: id })),
    load(
      ctx.supabase
        .from("bom_items")
        .select("id, variant_id, qty_per_unit, entry_qty, entry_unit")
        .eq("material_id", id)
        .returns<BomUse[]>(),
    ),
    load(ctx.supabase.from("suppliers").select("id, name, is_active").order("name").returns<SupplierOption[]>()),
    load<{ bucket: string; in_qty: number; out_qty: number }[]>(
      ctx.supabase.rpc("material_flows", { p_material_id: id, p_grain: grain, p_from: grainBuckets[0].key }),
    ),
    load(ctx.supabase.from("raw_materials").select("vat_rate").eq("id", id).maybeSingle<{ vat_rate: number }>()),
  ]);
  const vatRate = vatRes.data ? Number(vatRes.data.vat_rate) : 20;
  const suppliers = supplierRes.data ?? [];

  // Eski / paylaşılmış bağlantıda sayfa numarası hareket sayısını aşıyorsa son geçerli sayfaya git.
  if (movements.outOfRange) {
    const c = await load(movementQuery("id", true));
    if (!c.error && c.count !== null) {
      const lastPage = lastPageOf(c.count, lp.pageSize);
      redirect(hrefWith(base, values, { sayfa: lastPage > 1 ? lastPage : null }));
    }
  }

  const movementRows = movements.data ?? [];
  const bomRows = bom.data ?? [];
  const batchIds = [...new Set(movementRows.map((m) => m.batch_id).filter(Boolean))] as string[];
  const [variants, batches] = await Promise.all([
    bomRows.length
      ? load(
          ctx.supabase
            .from("v_variants")
            .select("id, display_name, product_id, variant_code, is_active")
            .in(
              "id",
              bomRows.map((b) => b.variant_id),
            )
            .returns<VariantInfo[]>(),
        )
      : Promise.resolve({
          data: [] as VariantInfo[],
          error: null,
          count: null,
        }),
    batchIds.length
      ? load(
          ctx.supabase.from("production_batches").select("id, batch_no").in("id", batchIds).returns<{ id: string; batch_no: string }[]>(),
        )
      : Promise.resolve({
          data: [] as { id: string; batch_no: string }[],
          error: null,
          count: null,
        }),
  ]);
  // Alış düzenleme / alış ve fire silme: yalnız yönetici; hareketten sonra tüketim/fire varsa kilitli.
  const editable = (m: MaterialMovement) => m.movement_type === "purchase" || m.movement_type === "write_off";
  const purchaseIds = movementRows.filter((m) => m.movement_type === "purchase").map((m) => m.id);
  const [lastOutflow, reversals] =
    isAdmin && movementRows.some(editable)
      ? await Promise.all([
          load(
            ctx.supabase
              .from("material_movements")
              .select("id")
              .eq("material_id", id)
              .in("movement_type", ["production_consume", "write_off"])
              .order("id", { ascending: false })
              .limit(1)
              .maybeSingle<{ id: number }>(),
          ),
          load(
            ctx.supabase
              .from("material_movements")
              .select("reverses_movement_id")
              .in("reverses_movement_id", purchaseIds.length ? purchaseIds : [0])
              .returns<{ reverses_movement_id: number }[]>(),
          ),
        ])
      : [null, null];
  const correctionReady = !!lastOutflow && !lastOutflow.error && !!reversals && !reversals.error;
  const lastOutflowId = Number(lastOutflow?.data?.id ?? 0);
  const reversedIds = new Set((reversals?.data ?? []).map((r) => Number(r.reverses_movement_id)));
  const correctionState = (m: MaterialMovement): "open" | "reversed" | "locked" | null => {
    if (!correctionReady || !editable(m)) return null;
    if (reversedIds.has(Number(m.id))) return "reversed";
    // Kendisinden sonra üretim tüketimi veya fire yoksa değiştirilebilir.
    return Number(m.id) >= lastOutflowId ? "open" : "locked";
  };
  const LOCK_TITLE = "Bu hareketten sonra malzeme üretimde kullanıldı veya fire yazıldı; farkı yeni bir alış veya fire kaydıyla girin.";
  const correctionCell = (m: MaterialMovement, compact: boolean) => {
    const s = correctionState(m);
    if (s === "open") {
      const q = `${fmtNum(Math.abs(Number(m.qty)) / Number(material.display_factor), 3)} ${material.display_unit}`;
      return (
        <span className="inline-flex items-center gap-1">
          {m.movement_type === "purchase" ? (
            <CorrectPurchase
              compact={compact}
              units={units}
              suppliers={suppliers}
              today={today}
              defaultVatRate={vatRate}
              movement={{
                id: Number(m.id),
                movement_date: m.movement_date,
                entry_qty: m.entry_qty,
                entry_unit: m.entry_unit,
                unit_price: m.unit_price,
                currency: m.currency,
                total_amount: m.total_amount,
                supplier_id: m.supplier_id ?? null,
                vat_rate: m.vat_rate ?? null,
                vat_amount: m.vat_amount ?? null,
                note: m.note,
              }}
            />
          ) : null}
          <DeleteMovement
            id={Number(m.id)}
            compact={compact}
            summary={`${fmtDate(m.movement_date)} · ${MOVEMENT_META[m.movement_type].label} · ${q}`}
          />
        </span>
      );
    }
    if (s === "reversed") return <Badge>İptal edildi</Badge>;
    if (s === "locked")
      return (
        <span className="inline-flex items-center gap-1 text-xs text-ink-muted" title={LOCK_TITLE}>
          <Lock className="size-3.5" aria-hidden />
          Kilitli
        </span>
      );
    return null;
  };
  const variantInfo = new Map((variants.data ?? []).map((v) => [v.id, v]));
  const batchNo = new Map((batches.data ?? []).map((b) => [b.id, b.batch_no]));
  // Parti numaraları yüklenemezse bağlantı kısa kimlikle gösterilir (tabloda ayrıca not düşülür).
  const batchLabel = (batchId: string) => batchNo.get(batchId) ?? `Parti ${batchId.slice(0, 8)}`;

  const f = Number(material.display_factor);
  const option = { ...toOption(material), vat_rate: vatRate };
  const unit = material.display_unit;
  const qtyFmt = (baseQty: number) => fmtQty(baseQty, f, unit, 3);

  // Hareket özeti (tüm zamanlar) ve son 12 ayın aylık akışı
  const flowRows = flows.data ?? [];
  const totals = MOVEMENT_ORDER.map((t) => {
    const rows = flowRows.filter((r) => r.movement_type === t);
    return {
      type: t,
      count: rows.reduce((s, r) => s + Number(r.movement_count), 0),
      qty: rows.reduce((s, r) => s + Number(r.qty), 0),
      value: rows.reduce((s, r) => s + Number(r.value_try), 0),
    };
  });
  // Stok seyri: seçilen dönem (gün / hafta / ay / yıl) için giriş, çıkış ve dönem sonu stok.
  const flowPoints: StockFlowPoint[] = [];
  const netByBucket = new Map((grainFlows.data ?? []).map((r) => [r.bucket, { inQty: Number(r.in_qty), outQty: Number(r.out_qty) }]));
  // Dönem sonu bakiyesi: güncel stoktan geriye doğru (sonraki dönemlerin net hareketi düşülerek).
  let balanceBase = Number(material.qty);
  for (let i = grainBuckets.length - 1; i >= 0; i--) {
    const b = grainBuckets[i];
    const n = netByBucket.get(b.key) ?? { inQty: 0, outQty: 0 };
    flowPoints.unshift({ ...b, inQty: n.inQty / f, outQty: n.outQty / f, balance: Math.max(0, balanceBase) / f });
    balanceBase -= n.inQty - n.outQty;
  }

  const last = lastPurchase.data?.[0] ?? null;
  const prev = lastPurchase.data?.[1] ?? null;
  // Maliyet hareketi (%): son alışın birim maliyeti önceki alışa göre (USD, kurdan bağımsız fiyat değişimi)
  // ve ortalama TL maliyetin son alışla değişimi (alış öncesi bakiye → alış sonrası bakiye).
  const pctChange = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null);
  const purchaseDelta = last && prev ? pctChange(Number(last.unit_cost_usd), Number(prev.unit_cost_usd)) : null;
  const beforeQty = last ? Number(last.balance_qty_after) - Number(last.qty) : 0;
  const avgDelta =
    last && beforeQty > 0
      ? pctChange(
          Number(last.balance_value_try_after) / Number(last.balance_qty_after),
          (Number(last.balance_value_try_after) - Number(last.value_try)) / beforeQty,
        )
      : null;
  const sortProps = { sort: lp.sort, dir: lp.dir, basePath: base, values };
  const movementFiltered = Object.keys(values).some((k) => !["sayfa", "adet", "sirala", "yon", "seyir"].includes(k));

  return (
    <>
      <PageHeader
        title={material.name}
        meta={
          <>
            <span className="code rounded bg-white px-1.5 py-0.5 ring-1 ring-line">{material.code}</span>
            <KindBadge kind={material.kind} />
            <MaterialStateBadge state={material.stock_state} />
            {!material.is_active ? <Badge>Pasif</Badge> : null}
          </>
        }
        description={material.notes ?? undefined}
        actions={
          isAdmin ? (
            <>
              {/* Geniş ekranda stok girişi formu sayfada; daha dar ekranlarda bu pencereden açılır. */}
              <Drawer
                trigger={
                  <>
                    <ArrowDownToLine aria-hidden />
                    Stok girişi
                  </>
                }
                triggerClassName="xl:hidden"
                title="Stok girişi (alış)"
                description={`${material.name} · her alış kendi günündeki kurla sabitlenir.`}
                size="lg"
              >
                <ReceiveForm material={option} units={units} suppliers={suppliers} today={today} />
              </Drawer>
              <Drawer
                trigger={
                  <>
                    <PackageMinus aria-hidden />
                    Fire / sayım düşümü
                  </>
                }
                triggerVariant="secondary"
                title="Fire / sayım düşümü"
                description={`${material.name} · ortalama maliyetle stoktan düşer; gerekçe zorunludur.`}
                size="md"
              >
                <WriteOffForm material={option} units={units} />
              </Drawer>
              <Drawer
                trigger={
                  <>
                    <Pencil aria-hidden />
                    Düzenle
                  </>
                }
                triggerVariant="secondary"
                title="Malzeme bilgileri"
                description={`${material.code} · kod, ad, tür, gösterim birimi, not ve aktiflik`}
                size="md"
              >
                <ActionForm action={updateMaterial}>
                  <input type="hidden" name="id" value={material.id} />
                  <MaterialFields units={units} material={material} vatRate={vatRate} />
                  <div className="mt-5 flex justify-end border-t border-line pt-4">
                    <SubmitButton>Kaydet</SubmitButton>
                  </div>
                </ActionForm>
              </Drawer>
            </>
          ) : null
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Mevcut miktar"
          value={fmtNum(material.qty_display, 3)}
          unit={unit}
          icon={Boxes}
          tone="brand"
          description={
            unit !== material.base_unit
              ? `Güncel stok · temel birimde ${fmtNum(material.qty, 3)} ${material.base_unit}`
              : `Güncel stok · temel birim ${material.base_unit}`
          }
        />
        <StatCard
          label="Ort. birim maliyet"
          value={material.avg_cost_try_display !== null ? fmtUnitMoney(material.avg_cost_try_display, "TRY") : "—"}
          unit={material.avg_cost_try_display !== null ? `/ ${unit}` : undefined}
          icon={Scale}
          tone="violet"
          delta={last ? { pct: avgDelta, label: "son alışla", invert: true } : undefined}
          description={
            material.avg_cost_usd_display !== null
              ? `${fmtUnitMoney(material.avg_cost_usd_display, "USD")} / ${unit} · hareketli ağırlıklı ortalama`
              : "Stok yokken ortalama maliyet hesaplanmaz"
          }
        />
        <StatCard
          label="Stok değeri"
          value={fmtMoney(material.value_try, "TRY")}
          icon={Wallet}
          tone="blue"
          description={`Güncel stok · USD karşılığı ${fmtMoney(material.value_usd, "USD")} (alış kurlarıyla, bilgi)`}
        />
        <StatCard
          label="Son alış"
          value={lastPurchase.error ? "—" : last ? fmtDate(last.movement_date) : "—"}
          icon={CalendarClock}
          tone="teal"
          delta={last ? { pct: purchaseDelta, label: "önceki alışa göre (USD birim maliyet)", invert: true } : undefined}
          description={
            lastPurchase.error
              ? `Son alış yüklenemedi: ${lastPurchase.error}`
              : last && last.currency
                ? `${fmtNum(last.entry_qty, 3)} ${last.entry_unit} × ${fmtUnitMoney(last.unit_price, last.currency)} = ${fmtMoney(last.total_amount, last.currency)}${last.supplier ? ` · ${last.supplier}` : ""}`
                : "Henüz alış kaydı yok"
          }
        />
      </div>

      <div className="mb-4 grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-4">
          {isAdmin ? (
            // Dar ekranlarda form başlıktaki "Stok girişi" penceresindedir; sayfa kısa kalır.
            <div className="hidden min-w-0 xl:block">
              <Card
                id="stok-girisi"
                title="Stok girişi (alış)"
                icon={ArrowDownToLine}
                description="Her alış ayrı bir maliyet hareketi olarak saklanır ve kendi günündeki kurla sabitlenir."
              >
                <ReceiveForm material={option} units={units} suppliers={suppliers} today={today} />
              </Card>
            </div>
          ) : null}
          <Card
            id="stok-seyri"
            title="Stok seyri"
            icon={History}
            description={`${FLOW_GRAIN[grain].range} · giriş, çıkış ve ${FLOW_GRAIN[grain].end.toLowerCase()} (${unit})`}
            actions={
              <LinkSegmented
                label="Stok seyri dönemi"
                active={grain}
                items={FLOW_GRAINS.map((g) => ({ key: g, label: FLOW_GRAIN[g].label, href: `${hrefWith(base, values, { seyir: g === "ay" ? null : g })}#stok-seyri` }))}
              />
            }
          >
            {grainFlows.error ? (
              <ErrorState message={grainFlows.error} compact />
            ) : (
              <StockFlowChart data={flowPoints} unit={unit} rangeLabel={FLOW_GRAIN[grain].range} endLabel={FLOW_GRAIN[grain].end} />
            )}
          </Card>
        </div>

        <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-1">
          <Card title="Hareket özeti" description="Tüm zamanlar · miktar ve işlem günü değeri" padded={false}>
            {flows.error ? (
              <ErrorState message={flows.error} compact />
            ) : (
              <ul className="divide-y divide-line">
                {totals.map((t) => {
                  const meta = MOVEMENT_META[t.type];
                  return (
                    <li key={t.type} className="flex items-center gap-3 px-4 py-2.5">
                      <IconBox
                        icon={meta.icon}
                        size="sm"
                        tone={
                          t.type === "purchase"
                            ? "teal"
                            : t.type === "write_off"
                              ? "red"
                              : t.type === "purchase_reversal"
                                ? "slate"
                                : t.type === "production_consume"
                                  ? "amber"
                                  : "blue"
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink">{meta.label}</p>
                        <p className="text-xs text-ink-muted">{fmtInt(t.count)} hareket</p>
                      </div>
                      <div className="text-right tabular-nums">
                        <p className="text-[13px] font-semibold text-ink">
                          {t.qty > 0 ? "+" : t.qty < 0 ? "−" : ""}
                          {qtyFmt(Math.abs(t.qty))}
                        </p>
                        <p className="text-xs text-ink-muted">{fmtMoney(Math.abs(t.value), "TRY")}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card
            title="Kullanıldığı reçeteler"
            icon={ListTree}
            description="1 adet ürün için gereken miktar"
            padded={false}
            footer={
              bomRows.length > 0 ? "“Stok yeter” yalnız bu malzemeye göredir; diğer malzemeler için simülasyonu kullanın." : undefined
            }
          >
            {bom.error || variants.error ? (
              <ErrorState message={(bom.error ?? variants.error)!} compact />
            ) : bomRows.length === 0 ? (
              <EmptyState title="Reçetede kullanılmıyor" icon={ListTree} compact>
                Bu malzeme henüz hiçbir ürün reçetesinde (BOM) yer almıyor.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {bomRows.map((b) => {
                  const v = variantInfo.get(b.variant_id);
                  const coverable = Math.floor(Number(material.qty) / Number(b.qty_per_unit));
                  return (
                    <li key={b.id} className="px-4 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {v ? (
                            <Link href={`/urunler/${v.product_id}/varyant/${v.id}`} className="link block truncate">
                              {v.display_name}
                            </Link>
                          ) : (
                            <span className="text-ink-muted">Varyant</span>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {v ? <span className="code text-ink-muted">{v.variant_code}</span> : null}
                            {v && !v.is_active ? <Badge>Pasif</Badge> : null}
                          </div>
                        </div>
                        <div className="shrink-0 text-right tabular-nums">
                          <p className="text-[13px] font-semibold text-ink">{qtyFmt(Number(b.qty_per_unit))}</p>
                          <p className="text-xs text-ink-muted">/ adet</p>
                        </div>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-3 text-xs">
                        <span className={coverable < 1 ? "font-medium text-chart-red" : "text-ink-muted"}>
                          {coverable < 1 ? "Stok 1 adete yetmiyor" : `Stok ${fmtInt(coverable)} adete yeter`}
                        </span>
                        {v ? (
                          <Link
                            href={`/simulasyon?varyant=${v.id}&adet=1`}
                            className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline"
                          >
                            <Calculator className="size-3.5" aria-hidden />
                            Simülasyon
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Malzeme bilgileri" icon={Info} className="md:col-span-2 xl:col-span-1">
            <dl className="grid grid-cols-1 gap-x-8 text-[13px] md:grid-cols-2 xl:grid-cols-1">
              {(
                [
                  [
                    "Kod",
                    <span key="c" className="code">
                      {material.code}
                    </span>,
                  ],
                  ["Tür", material.kind === "component" ? "Komponent" : "Hammadde"],
                  ["Birim türü", UNIT_KIND_LABEL[material.unit_kind]],
                  ["Temel birim (stok)", material.base_unit],
                  [
                    "Gösterim / giriş birimi",
                    `${unit}${unit !== material.base_unit ? ` (1 ${unit} = ${fmtNum(f, 6)} ${material.base_unit})` : ""}`,
                  ],
                  ["Durum", material.is_active ? "Aktif" : "Pasif"],
                  ["Aktif reçete", `${fmtInt(material.active_bom_count)} varyant`],
                  ["Oluşturulma", fmtDate(material.created_at)],
                ] as [string, ReactNode][]
              ).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 border-b border-dashed border-line py-2">
                  <dt className="shrink-0 text-ink-muted">{k}</dt>
                  <dd className="min-w-0 text-right font-medium text-ink tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>

      <Card
        title="Hareket geçmişi"
        icon={History}
        description="Alış, üretim tüketimi, parti iptali iadesi ve fire kayıtları · varsayılan sıralama en yeni önce"
        padded={false}
      >
        <ListToolbar
          basePath={base}
          values={values}
          total={movements.error || movements.outOfRange ? null : movements.count}
          noun="hareket"
          preserveKeys={["seyir"]}
          search={{ placeholder: "Tedarikçi veya not ara…" }}
          filters={[
            {
              key: "tur",
              label: "Hareket türü",
              options: MOVEMENT_ORDER.map((t) => ({
                value: MOVEMENT_META[t].key,
                label: MOVEMENT_META[t].label,
              })),
            },
          ]}
          dateRange={{ label: "Tarih" }}
        />
        {batches.error ? (
          <p role="status" className="border-b border-line bg-chart-amber/10 px-4 py-2 text-xs text-ink-soft">
            Parti numaraları yüklenemedi ({batches.error}); parti bağlantıları kısa kimlikle gösteriliyor.
          </p>
        ) : null}
        {movements.error ? (
          <ErrorState message={movements.error} />
        ) : movements.outOfRange ? (
          <EmptyState
            title="Bu sayfada hareket yok"
            icon={History}
            action={
              <ButtonLink href={hrefWith(base, values, { sayfa: null })} variant="secondary" size="sm">
                İlk sayfaya dön
              </ButtonLink>
            }
          >
            Sayfa numarası hareket sayısını aşıyor.
          </EmptyState>
        ) : movementRows.length === 0 ? (
          <EmptyState
            title={movementFiltered ? "Filtrelere uyan hareket yok" : "Henüz hareket yok"}
            icon={History}
            action={
              movementFiltered ? (
                <ButtonLink href={base} variant="secondary" size="sm">
                  Filtreleri temizle
                </ButtonLink>
              ) : null
            }
          >
            {movementFiltered
              ? "Filtreleri değiştirin veya temizleyin."
              : isAdmin
                ? "İlk alışı “Stok girişi” ile kaydedin."
                : "Bu malzemede kayıtlı hareket yok."}
          </EmptyState>
        ) : (
          <>
            {/* Mobil ve tablet: kart listesi + sıralama bağlantıları */}
            <div className="xl:hidden">
              <div className="flex items-center gap-2 overflow-x-auto border-b border-line px-4 py-2.5 [scrollbar-width:none]">
                <span className="shrink-0 text-xs text-ink-muted">Sırala</span>
                <LinkSegmented
                  active={lp.sort ?? "movement_date"}
                  items={MOBILE_SORTS.map((o) => ({
                    key: o.key,
                    label: o.label,
                    href: hrefWith(base, values, {
                      sirala: o.key,
                      yon: o.dir,
                      sayfa: null,
                    }),
                  }))}
                />
              </div>
              <ul className="divide-y divide-line">
                {movementRows.map((m) => {
                  const q = Number(m.qty);
                  const purchase = m.movement_type === "purchase" && m.currency;
                  return (
                    <li key={m.id} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <MovementBadge type={m.movement_type} />
                          <span className="text-xs text-ink-muted">{fmtDate(m.movement_date)}</span>
                          {m.corrected_at ? <span className="text-xs text-ink-muted">· düzenlendi</span> : null}
                        </div>
                        <p className="shrink-0 font-semibold text-ink tabular-nums">
                          {q > 0 ? "+" : "−"}
                          {fmtNum(Math.abs(q) / f, 3)} {unit}
                        </p>
                      </div>
                      <div className="mt-1 flex items-baseline justify-between gap-3 text-xs text-ink-muted tabular-nums">
                        <span className="min-w-0">
                          Birim maliyet {fmtUnitMoney(Number(m.unit_cost_try) * f, "TRY")} / {unit} (
                          {fmtUnitMoney(Number(m.unit_cost_usd) * f, "USD")})
                        </span>
                        <span className="shrink-0 font-medium text-ink-soft">
                          {Number(m.value_try) > 0 ? "+" : ""}
                          {fmtMoney(m.value_try, "TRY")}
                        </span>
                      </div>
                      {purchase ? (
                        <p className="mt-0.5 text-xs text-ink-muted tabular-nums">
                          {fmtNum(m.entry_qty, 4)} {m.entry_unit} × {fmtUnitMoney(m.unit_price, m.currency!)} ={" "}
                          <span className="font-medium text-ink-soft">{fmtMoney(m.total_amount, m.currency!)}</span>
                          {m.vat_amount != null ? ` + KDV ${fmtMoney(m.vat_amount, m.currency!)}` : ""}
                          {m.fx_rate ? ` · kur ${fmtRate(m.fx_rate)}` : ""}
                        </p>
                      ) : null}
                      {m.batch_id || m.supplier || m.note ? (
                        <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
                          {m.batch_id ? (
                            <Link className="link inline-flex items-center gap-0.5" href={`/uretim/${m.batch_id}`}>
                              {batchLabel(m.batch_id)}
                              <ChevronRight className="size-3" aria-hidden />
                            </Link>
                          ) : null}
                          {m.supplier ? <span className="text-ink-soft">{m.supplier}</span> : null}
                          {m.note ? <span className="min-w-0 break-words">{m.note}</span> : null}
                        </p>
                      ) : null}
                      {correctionState(m) ? <div className="mt-1.5">{correctionCell(m, false)}</div> : null}
                    </li>
                  );
                })}
              </ul>
            </div>
            <TableWrap className="hidden xl:block">
              <table className="table-base">
                <thead>
                  <tr>
                    <SortTh label="Tarih" column="movement_date" {...sortProps} />
                    <th>Hareket</th>
                    <SortTh label={`Miktar (${unit})`} column="qty" align="right" {...sortProps} />
                    <th className="num">Birim fiyat</th>
                    <th className={`num ${WIDE_CELL}`}>Tutar</th>
                    <th className={`num ${WIDE_CELL}`} title="USD/TRY işlem kuru">
                      Kur
                    </th>
                    <th className="num" title="Hareketin birim maliyeti (gösterim birimi başına)">
                      Birim maliyet
                    </th>
                    <SortTh label="Değer (TL)" column="value_try" align="right" {...sortProps} />
                    <th>Açıklama</th>
                    {correctionReady ? (
                      <th className="w-px">
                        <span className="sr-only">İşlem</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {movementRows.map((m) => {
                    const q = Number(m.qty);
                    const purchase = m.movement_type === "purchase";
                    return (
                      <tr key={m.id}>
                        <td className="whitespace-nowrap" title={`Kayıt: ${fmtDateTime(m.created_at)}`}>
                          {fmtDate(m.movement_date)}
                          {m.corrected_at ? (
                            <div className="text-xs text-ink-muted" title={`Düzenlendi: ${fmtDateTime(m.corrected_at)}`}>
                              düzenlendi
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <MovementBadge type={m.movement_type} />
                        </td>
                        <td className="num">
                          <span className="font-medium text-ink">
                            {q > 0 ? "+" : "−"}
                            {fmtNum(Math.abs(q) / f, 3)} {unit}
                          </span>
                          {m.entry_unit && m.entry_unit !== unit ? (
                            <div className="text-xs text-ink-muted">
                              girilen {fmtNum(m.entry_qty, 4)} {m.entry_unit}
                            </div>
                          ) : null}
                        </td>
                        <td className="num">
                          {purchase && m.currency ? (
                            <>
                              {fmtUnitMoney(m.unit_price, m.currency)} <span className="text-xs text-ink-muted">/ {m.entry_unit}</span>
                              <div className={`text-xs text-ink-muted ${NARROW_ONLY}`}>= {fmtMoney(m.total_amount, m.currency)}</div>
                              {m.vat_amount != null ? (
                                <div className={`text-xs text-ink-muted ${NARROW_ONLY}`}>+ KDV {fmtMoney(m.vat_amount, m.currency)}</div>
                              ) : null}
                              {m.fx_rate ? <div className={`text-xs text-ink-muted ${NARROW_ONLY}`}>kur {fmtRate(m.fx_rate)}</div> : null}
                            </>
                          ) : (
                            <span className="text-ink-muted">—</span>
                          )}
                        </td>
                        <td className={`num ${WIDE_CELL}`}>
                          {purchase && m.currency ? (
                            <>
                              {fmtMoney(m.total_amount, m.currency)}
                              {m.vat_amount != null ? <div className="text-xs text-ink-muted">+ KDV {fmtMoney(m.vat_amount, m.currency)}</div> : null}
                            </>
                          ) : (
                            <span className="text-ink-muted">—</span>
                          )}
                        </td>
                        <td className={`num ${WIDE_CELL}`}>{m.fx_rate ? fmtRate(m.fx_rate) : <span className="text-ink-muted">—</span>}</td>
                        <td className="num">
                          {fmtUnitMoney(Number(m.unit_cost_try) * f, "TRY")} <span className="text-xs text-ink-muted">/ {unit}</span>
                          <div className="text-xs text-ink-muted">
                            {fmtUnitMoney(Number(m.unit_cost_usd) * f, "USD")} / {unit}
                          </div>
                        </td>
                        <td className="num font-medium text-ink">
                          {Number(m.value_try) > 0 ? "+" : ""}
                          {fmtMoney(m.value_try, "TRY")}
                        </td>
                        <td className="max-w-[11rem] text-xs min-[1400px]:max-w-[16rem]">
                          {m.batch_id ? (
                            <Link className="link inline-flex items-center gap-0.5" href={`/uretim/${m.batch_id}`}>
                              {batchLabel(m.batch_id)}
                              <ChevronRight className="size-3" aria-hidden />
                            </Link>
                          ) : null}
                          {m.supplier ? (
                            <div className="truncate text-ink-soft" title={m.supplier}>
                              {m.supplier}
                            </div>
                          ) : null}
                          {m.note ? (
                            <div className="truncate text-ink-muted" title={m.note}>
                              {m.note}
                            </div>
                          ) : null}
                          {!m.batch_id && !m.supplier && !m.note ? <span className="text-ink-muted">—</span> : null}
                        </td>
                        {correctionReady ? <td className="text-right whitespace-nowrap">{correctionCell(m, true)}</td> : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          </>
        )}
        {movements.count ? (
          <Pagination basePath={base} values={values} page={lp.page} pageSize={lp.pageSize} total={movements.count} noun="hareket" />
        ) : null}
      </Card>
    </>
  );
}

type FlowGrain = "gun" | "hafta" | "ay" | "yil";
const FLOW_GRAINS: FlowGrain[] = ["gun", "hafta", "ay", "yil"];
const FLOW_GRAIN: Record<FlowGrain, { label: string; range: string; end: string }> = {
  gun: { label: "Gün", range: "Son 30 gün", end: "Gün sonu stok" },
  hafta: { label: "Hafta", range: "Son 12 hafta", end: "Hafta sonu stok" },
  ay: { label: "Ay", range: "Son 12 ay", end: "Ay sonu stok" },
  yil: { label: "Yıl", range: "Son 5 yıl", end: "Yıl sonu stok" },
};
const TR_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function flowGrain(v: string | undefined): FlowGrain {
  return v === "gun" || v === "hafta" || v === "yil" ? v : "ay";
}

/** Seçilen dönem için kova başlangıçları (YYYY-AA-GG) ve eksen/tooltip etiketleri; son kova bugünü içerir. */
function flowBuckets(grain: FlowGrain, today: string): Pick<StockFlowPoint, "key" | "label" | "title">[] {
  const dm = (iso: string) => `${Number(iso.slice(8, 10))} ${TR_MONTHS[Number(iso.slice(5, 7)) - 1]}`;
  if (grain === "gun") {
    return Array.from({ length: 30 }, (_, i) => {
      const d = addDays(today, i - 29);
      return { key: d, label: dm(d), title: fmtDate(d) };
    });
  }
  if (grain === "hafta") {
    const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // pazartesi = 0
    const monday = addDays(today, -weekday);
    return Array.from({ length: 12 }, (_, i) => {
      const d = addDays(monday, (i - 11) * 7);
      return { key: d, label: dm(d), title: `${fmtDate(d)} – ${fmtDate(addDays(d, 6))} haftası` };
    });
  }
  if (grain === "yil") {
    const y = Number(today.slice(0, 4));
    return Array.from({ length: 5 }, (_, i) => {
      const year = y - 4 + i;
      return { key: `${year}-01-01`, label: String(year), title: String(year) };
    });
  }
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  return Array.from({ length: 12 }, (_, i) => {
    const idx = y * 12 + (m - 1) - 11 + i;
    const key = `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}-01`;
    return { key, label: fmtMonth(key), title: fmtMonth(key) };
  });
}
