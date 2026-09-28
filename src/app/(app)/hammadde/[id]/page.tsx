import {
  ArrowDownToLine,
  Boxes,
  CalendarClock,
  Calculator,
  ChevronRight,
  History,
  Info,
  ListTree,
  PackageMinus,
  Pencil,
  Scale,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, ErrorState, IconBox, PageHeader, StatCard, TableWrap } from "@/components/ui";
import { Drawer } from "@/components/ui/dialog";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { Pagination, SortTh } from "@/components/ui/list";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtInt, fmtMoney, fmtNum, fmtQty, fmtRate, fmtUnitMoney, todayTr } from "@/lib/format";
import { isoDateOrNull, parseListParams, searchPattern, type SearchParams } from "@/lib/list-params";
import { isUuid } from "@/lib/parse";
import { addDays, buckets } from "@/lib/period";
import { load, must } from "@/lib/query";
import type { MaterialMovement, Unit, UnitKind } from "@/lib/types";
import { updateMaterial } from "../actions";
import { KindBadge, MOVEMENT_META, MOVEMENT_ORDER, MaterialStateBadge, MovementBadge, movementTypeFromKey } from "../_components/bits";
import { StockFlowChart, type StockFlowPoint } from "../_components/StockFlowChart";
import { toOption, type MaterialListRow, type MonthlyFlowRow } from "../_components/types";
import { WriteOffForm } from "../_components/WriteOffForm";
import { MaterialFields } from "../MaterialForm";
import { ReceiveForm } from "../ReceiveForm";

export const metadata: Metadata = { title: "Malzeme" };

const UNIT_KIND_LABEL: Record<UnitKind, string> = {
  count: "Adet",
  mass: "Ağırlık",
  length: "Uzunluk",
  area: "Alan",
  volume: "Hacim",
};

type LastPurchase = Pick<
  MaterialMovement,
  "movement_date" | "entry_qty" | "entry_unit" | "unit_price" | "currency" | "total_amount" | "supplier"
>;
type BomUse = { id: string; variant_id: string; qty_per_unit: number; entry_qty: number; entry_unit: string };
type VariantInfo = { id: string; display_name: string; product_id: string; variant_code: string; is_active: boolean };

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
  let mq = ctx.supabase.from("material_movements").select("*", { count: "exact" }).eq("material_id", id);
  const type = movementTypeFromKey(values.tur);
  if (type) mq = mq.eq("movement_type", type);
  const from = isoDateOrNull(values.bas);
  const to = isoDateOrNull(values.bit);
  if (from) mq = mq.gte("movement_date", from);
  if (to) mq = mq.lte("movement_date", to);
  const pattern = searchPattern(lp.q);
  if (pattern) mq = mq.or(`supplier.ilike.${pattern},note.ilike.${pattern}`);

  const [units, movements, lastPurchase, flows, bom] = await Promise.all([
    must(ctx.supabase.from("units").select("*").eq("kind", material.unit_kind).order("sort_order").returns<Unit[]>(), "Birimler"),
    load(
      mq
        .order(lp.sort ?? "movement_date", { ascending: lp.dir === "asc" })
        .order("id", { ascending: lp.dir === "asc" })
        .range(lp.from, lp.to)
        .returns<MaterialMovement[]>(),
    ),
    load(
      ctx.supabase
        .from("material_movements")
        .select("movement_date, entry_qty, entry_unit, unit_price, currency, total_amount, supplier")
        .eq("material_id", id)
        .eq("movement_type", "purchase")
        .order("movement_date", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle<LastPurchase>(),
    ),
    load<MonthlyFlowRow[]>(ctx.supabase.rpc("material_monthly_flows", { p_material_id: id })),
    load(
      ctx.supabase
        .from("bom_items")
        .select("id, variant_id, qty_per_unit, entry_qty, entry_unit")
        .eq("material_id", id)
        .returns<BomUse[]>(),
    ),
  ]);

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
      : Promise.resolve({ data: [] as VariantInfo[], error: null, count: null }),
    batchIds.length
      ? load(
          ctx.supabase.from("production_batches").select("id, batch_no").in("id", batchIds).returns<{ id: string; batch_no: string }[]>(),
        )
      : Promise.resolve({ data: [] as { id: string; batch_no: string }[], error: null, count: null }),
  ]);
  const variantInfo = new Map((variants.data ?? []).map((v) => [v.id, v]));
  const batchNo = new Map((batches.data ?? []).map((b) => [b.id, b.batch_no]));

  const f = Number(material.display_factor);
  const option = toOption(material);
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
  const monthFrom = `${addDays(`${today.slice(0, 7)}-15`, -335).slice(0, 7)}-01`;
  const months = buckets(monthFrom, today, "aylik");
  const netByMonth = new Map<string, { inQty: number; outQty: number }>();
  for (const r of flowRows) {
    const m = r.month_start.slice(0, 7);
    const cur = netByMonth.get(m) ?? { inQty: 0, outQty: 0 };
    const q = Number(r.qty);
    if (q >= 0) cur.inQty += q;
    else cur.outQty += -q;
    netByMonth.set(m, cur);
  }
  // Ay sonu bakiyesi: güncel stoktan geriye doğru (sonraki ayların net hareketi düşülerek).
  const flowPoints: StockFlowPoint[] = [];
  let balanceBase = Number(material.qty);
  const laterMonths = [...netByMonth.keys()].filter((m) => m > months[months.length - 1]);
  for (const m of laterMonths) {
    const n = netByMonth.get(m)!;
    balanceBase -= n.inQty - n.outQty;
  }
  for (let i = months.length - 1; i >= 0; i--) {
    const n = netByMonth.get(months[i]) ?? { inQty: 0, outQty: 0 };
    flowPoints.unshift({ month: months[i], inQty: n.inQty / f, outQty: n.outQty / f, balance: Math.max(0, balanceBase) / f });
    balanceBase -= n.inQty - n.outQty;
  }

  const last = lastPurchase.data;
  const sortProps = { sort: lp.sort, dir: lp.dir, basePath: base, values };
  const movementFiltered = Object.keys(values).some((k) => !["sayfa", "adet", "sirala", "yon"].includes(k));

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
                  <MaterialFields units={units} material={material} />
                  <div className="mt-5 flex justify-end border-t border-line pt-4">
                    <SubmitButton>Kaydet</SubmitButton>
                  </div>
                </ActionForm>
              </Drawer>
            </>
          ) : null
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Mevcut miktar"
          scope="Güncel stok"
          value={fmtNum(material.qty_display, 3)}
          unit={unit}
          icon={Boxes}
          tone="brand"
          description={
            unit !== material.base_unit
              ? `Temel birimde ${fmtNum(material.qty, 3)} ${material.base_unit}`
              : `Temel birim: ${material.base_unit}`
          }
        />
        <StatCard
          label="Ort. birim maliyet"
          value={material.avg_cost_try_display !== null ? fmtUnitMoney(material.avg_cost_try_display, "TRY") : "—"}
          unit={material.avg_cost_try_display !== null ? `/ ${unit}` : undefined}
          icon={Scale}
          tone="violet"
          description={
            material.avg_cost_usd_display !== null
              ? `${fmtUnitMoney(material.avg_cost_usd_display, "USD")} / ${unit} · hareketli ağırlıklı ortalama`
              : "Stok yokken ortalama maliyet hesaplanmaz"
          }
        />
        <StatCard
          label="Stok değeri"
          scope="Güncel stok"
          value={fmtMoney(material.value_try, "TRY")}
          icon={Wallet}
          tone="blue"
          description={`USD karşılığı ${fmtMoney(material.value_usd, "USD")} · alış kurlarıyla (bilgi)`}
        />
        <StatCard
          label="Son alış"
          value={lastPurchase.error ? "—" : last ? fmtDate(last.movement_date) : "—"}
          icon={CalendarClock}
          tone="teal"
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
            <Card
              id="stok-girisi"
              title="Stok girişi (alış)"
              icon={ArrowDownToLine}
              description="Her alış ayrı bir maliyet hareketi olarak saklanır ve kendi günündeki kurla sabitlenir."
            >
              <ReceiveForm material={option} units={units} today={today} />
            </Card>
          ) : null}
          <Card title="Stok seyri" icon={History} description={`Son 12 ay · aylık giriş, çıkış ve ay sonu stok (${unit})`}>
            {flows.error ? <ErrorState message={flows.error} compact /> : <StockFlowChart data={flowPoints} unit={unit} />}
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
        description="Alış, üretim tüketimi, parti iptali iadesi ve fire kayıtları · en yeni önce"
        padded={false}
      >
        <ListToolbar
          basePath={base}
          values={values}
          total={movements.error ? null : movements.count}
          noun="hareket"
          search={{ placeholder: "Tedarikçi veya not ara…" }}
          filters={[
            {
              key: "tur",
              label: "Hareket türü",
              options: MOVEMENT_ORDER.map((t) => ({ value: MOVEMENT_META[t].key, label: MOVEMENT_META[t].label })),
            },
          ]}
          dateRange={{ label: "Tarih" }}
        />
        {movements.error ? (
          <ErrorState message={movements.error} />
        ) : movementRows.length === 0 ? (
          <EmptyState title={movementFiltered ? "Filtrelere uyan hareket yok" : "Henüz hareket yok"} icon={History}>
            {movementFiltered
              ? "Filtreleri değiştirin veya temizleyin."
              : isAdmin
                ? "İlk alışı “Stok girişi (alış)” formundan kaydedin."
                : "Bu malzemede kayıtlı hareket yok."}
          </EmptyState>
        ) : (
          <>
            <ul className="divide-y divide-line sm:hidden">
              {movementRows.map((m) => {
                const q = Number(m.qty);
                return (
                  <li key={m.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <MovementBadge type={m.movement_type} />
                        <p className="mt-1 text-xs text-ink-muted">{fmtDate(m.movement_date)}</p>
                      </div>
                      <div className="shrink-0 text-right tabular-nums">
                        <p className="font-semibold text-ink">
                          {q > 0 ? "+" : "−"}
                          {fmtNum(Math.abs(q) / f, 3)} {unit}
                        </p>
                        <p className="text-xs text-ink-soft">
                          {Number(m.value_try) > 0 ? "+" : ""}
                          {fmtMoney(m.value_try, "TRY")}
                        </p>
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-ink-muted">
                      <span className="min-w-0">
                        {m.movement_type === "purchase" && m.currency ? (
                          <>
                            {fmtNum(m.entry_qty, 4)} {m.entry_unit} × {fmtUnitMoney(m.unit_price, m.currency)} · kur {fmtRate(m.fx_rate)}
                          </>
                        ) : m.batch_id ? (
                          <Link className="link" href={`/uretim/${m.batch_id}`}>
                            {batchNo.get(m.batch_id) ?? "Parti"}
                          </Link>
                        ) : (
                          (m.note ?? "—")
                        )}
                      </span>
                      <span className="tabular-nums">Bakiye {qtyFmt(Number(m.balance_qty_after))}</span>
                    </div>
                    {m.supplier || (m.note && (m.movement_type === "purchase" || m.batch_id)) ? (
                      <p className="mt-0.5 truncate text-xs text-ink-muted">{[m.supplier, m.note].filter(Boolean).join(" · ")}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <TableWrap className="hidden sm:block">
              <table className="table-base">
                <thead>
                  <tr>
                    <SortTh label="Tarih" column="movement_date" {...sortProps} />
                    <th>Hareket</th>
                    <SortTh label={`Miktar (${unit})`} column="qty" align="right" {...sortProps} />
                    <th className="num">Birim fiyat</th>
                    <th className="num">Tutar</th>
                    <th className="num" title="USD/TRY işlem kuru">
                      Kur
                    </th>
                    <th className="num" title="Hareketin birim maliyeti (gösterim birimi başına)">
                      Birim maliyet
                    </th>
                    <SortTh label="Değer (TL)" column="value_try" align="right" {...sortProps} />
                    <th className="num">Bakiye</th>
                    <th>Açıklama</th>
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
                            </>
                          ) : (
                            <span className="text-ink-muted">—</span>
                          )}
                        </td>
                        <td className="num">
                          {purchase && m.currency ? fmtMoney(m.total_amount, m.currency) : <span className="text-ink-muted">—</span>}
                        </td>
                        <td className="num">{m.fx_rate ? fmtRate(m.fx_rate) : <span className="text-ink-muted">—</span>}</td>
                        <td className="num">
                          {fmtUnitMoney(Number(m.unit_cost_try) * f, "TRY")}
                          <div className="text-xs text-ink-muted">{fmtUnitMoney(Number(m.unit_cost_usd) * f, "USD")}</div>
                        </td>
                        <td className="num font-medium text-ink">
                          {Number(m.value_try) > 0 ? "+" : ""}
                          {fmtMoney(m.value_try, "TRY")}
                        </td>
                        <td className="num">{qtyFmt(Number(m.balance_qty_after))}</td>
                        <td className="max-w-[16rem] text-xs">
                          {m.batch_id ? (
                            <Link className="link inline-flex items-center gap-0.5" href={`/uretim/${m.batch_id}`}>
                              {batchNo.get(m.batch_id) ?? "Parti"}
                              <ChevronRight className="size-3" aria-hidden />
                            </Link>
                          ) : null}
                          {m.supplier ? <div className="truncate text-ink-soft">{m.supplier}</div> : null}
                          {m.note ? (
                            <div className="truncate text-ink-muted" title={m.note}>
                              {m.note}
                            </div>
                          ) : null}
                          {!m.batch_id && !m.supplier && !m.note ? <span className="text-ink-muted">—</span> : null}
                        </td>
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
