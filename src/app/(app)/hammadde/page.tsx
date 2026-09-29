import { AlertOctagon, ArrowDownToLine, Boxes, ChevronRight, Handshake, ListTree, PackageX, Plus, ShieldCheck, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, ButtonLink, Card, EmptyState, ErrorState, MetricRow, PageHeader, StatCard, TableWrap } from "@/components/ui";
import { Drawer } from "@/components/ui/dialog";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { LinkSegmented, Pagination, SortTh } from "@/components/ui/list";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtInt, fmtMoney, fmtNum, fmtUnitMoney, todayTr } from "@/lib/format";
import { hrefWith, parseListParams, searchPattern, type SearchParams } from "@/lib/list-params";
import { addDays, buckets } from "@/lib/period";
import { load } from "@/lib/query";
import type { SupplierListRow, SupplierOption, Unit } from "@/lib/types";
import { KindBadge, ListValue, MaterialStateBadge } from "./_components/bits";
import { ClearParamsOnClose } from "./_components/ClearParamsOnClose";
import { MonthlyFlowChart, type MonthlyFlowPoint } from "./_components/MonthlyFlowChart";
import { lastPageOf, loadPage } from "./_components/paging";
import { TopValueChart, type TopValueRow } from "./_components/TopValueChart";
import { toOption, type MaterialListRow, type MonthlyFlowRow } from "./_components/types";
import { createMaterial } from "./actions";
import { MaterialFields } from "./MaterialForm";
import { DeleteButton } from "@/components/DeleteButton";
import { deleteMaterial } from "./actions";
import { DELETE_MATERIAL_TEXT } from "./_components/bits";
import { ReceiveForm } from "./ReceiveForm";
import { SupplierSpendChart } from "./_components/SupplierSpendChart";

export const metadata: Metadata = { title: "Hammadde" };

const BASE = "/hammadde";
/**
 * "risk" sanal sıralama anahtarıdır: azalan (ilk tıklama) en kritik malzemeleri öne alır
 * (state_rank artan, ardından en düşük stok kapsamı).
 */
const SORTABLE = [
  "code",
  "name",
  "kind",
  "risk",
  "qty_display",
  "avg_cost_try_display",
  "value_try",
  "active_bom_count",
  "last_purchase_on",
];
const KIND_FILTER: Record<string, "raw" | "component"> = { hammadde: "raw", komponent: "component", raw: "raw", component: "component" };
const MOBILE_SORTS = [
  { key: "name", label: "Ad", dir: "asc" },
  { key: "risk", label: "Durum", dir: "desc" },
  { key: "value_try", label: "Değer", dir: "desc" },
  { key: "last_purchase_on", label: "Son alış", dir: "desc" },
] as const;
/** Liste durumu sayılmayan, yalnız pencere açmak için kullanılan anahtarlar */
const ACTION_KEYS = ["islem", "malzeme"];
/** Bu genişliğin altında (xl ile 1400 px arası) Tür ve Reçete sütunları Malzeme / Durum hücresine katlanır. */
const WIDE_CELL = "hidden min-[1400px]:table-cell";
const NARROW_ONLY = "min-[1400px]:hidden";

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireMember();
  const isAdmin = ctx.role === "admin";
  const lp = parseListParams(await searchParams, { sortable: SORTABLE, defaultSort: "name", defaultDir: "asc" });
  const values = Object.fromEntries(Object.entries(lp.values).filter(([k]) => !ACTION_KEYS.includes(k)));
  const today = todayTr();
  const monthFrom = `${addDays(`${today.slice(0, 7)}-15`, -335).slice(0, 7)}-01`;

  // Tablo: sunucu tarafı arama, filtre, sıralama ve sayfalama
  const pattern = searchPattern(lp.q);
  const kind = KIND_FILTER[values.tur];
  const filteredQuery = (columns: string, head = false) => {
    let q = ctx.supabase.from("v_material_list").select(columns, { count: "exact", head });
    if (pattern) q = q.or(`code.ilike.${pattern},name.ilike.${pattern},notes.ilike.${pattern}`);
    if (kind) q = q.eq("kind", kind);
    if (values.stok === "stokta") q = q.gt("qty", 0);
    else if (values.stok === "tukendi") q = q.lte("qty", 0);
    else if (values.stok === "kritik") q = q.in("stock_state", ["out_used", "short"]);
    if (values.durum === "aktif") q = q.eq("is_active", true);
    else if (values.durum === "pasif") q = q.eq("is_active", false);
    return q;
  };
  const sortKey = lp.sort ?? "name";
  let tableQuery = filteredQuery("*");
  if (sortKey === "risk") {
    const riskFirst = lp.dir === "desc";
    tableQuery = tableQuery
      .order("state_rank", { ascending: riskFirst })
      .order("min_units_coverable", { ascending: riskFirst, nullsFirst: !riskFirst });
  } else {
    tableQuery = tableQuery.order(sortKey, { ascending: lp.dir === "asc", nullsFirst: false });
  }

  const [res, all, flows, units, supplierRes, vatRes] = await Promise.all([
    loadPage(tableQuery.order("name", { ascending: true }).order("code", { ascending: true }).range(lp.from, lp.to).returns<MaterialListRow[]>()),
    // Özet kartları ve grafikler: filtreden bağımsız, tüm malzemeler (güncel stok)
    load(ctx.supabase.from("v_material_list").select("*", { count: "exact" }).order("name").returns<MaterialListRow[]>()),
    load<MonthlyFlowRow[]>(ctx.supabase.rpc("material_monthly_flows", { p_from: monthFrom })),
    load(ctx.supabase.from("units").select("*").order("sort_order").returns<Unit[]>()),
    // Tedarikçi seçimi ve "tedarikçilere ödenen tutar" grafiği aynı görünümden
    load(ctx.supabase.from("v_supplier_list").select("*").order("total_try", { ascending: false }).returns<SupplierListRow[]>()),
    load(ctx.supabase.from("raw_materials").select("id, vat_rate").returns<{ id: string; vat_rate: number }[]>()),
  ]);
  const vatRates = new Map((vatRes.data ?? []).map((r) => [r.id, Number(r.vat_rate)]));
  const withVat = (m: MaterialListRow) => ({ ...toOption(m), vat_rate: vatRates.get(m.id) ?? 20 });
  const supplierRows = supplierRes.data ?? [];
  const suppliers: SupplierOption[] = supplierRows
    .map((x) => ({ id: x.id, name: x.name, is_active: x.is_active }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const supplierSpend = supplierRows
    .map((x) => ({
      key: x.id,
      label: x.name,
      value: Number(x.total_try) + Number(x.vat_try ?? 0),
      vat: Number(x.vat_try ?? 0),
      usd: Number(x.total_usd),
      count: Number(x.purchase_count),
    }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const supplierTotalTry = supplierRows.reduce((sum, x) => sum + Number(x.total_try) + Number(x.vat_try ?? 0), 0);
  const supplierVatTry = supplierRows.reduce((sum, x) => sum + Number(x.vat_try ?? 0), 0);

  // Eski / paylaşılmış bağlantıda sayfa numarası sonuç sayısını aşıyorsa son geçerli sayfaya git.
  if (res.outOfRange) {
    const c = await load(filteredQuery("id", true));
    if (!c.error && c.count !== null) {
      const last = lastPageOf(c.count, lp.pageSize);
      redirect(hrefWith(BASE, lp.values, { sayfa: last > 1 ? last : null }));
    }
  }

  const materials = all.data ?? [];
  const truncated = all.count !== null && all.count > materials.length;
  const active = materials.filter((m) => m.is_active);
  const totalTry = materials.reduce((s, m) => s + Number(m.value_try), 0);
  const totalUsd = materials.reduce((s, m) => s + Number(m.value_usd), 0);
  const rawValue = materials.filter((m) => m.kind === "raw").reduce((s, m) => s + Number(m.value_try), 0);
  const rawCount = active.filter((m) => m.kind === "raw").length;
  const compCount = active.filter((m) => m.kind === "component").length;
  const outCount = active.filter((m) => Number(m.qty) <= 0).length;
  const critical = materials.filter((m) => m.stock_state === "out_used" || m.stock_state === "short");
  // Aktif reçetede kullanılan malzemeler: stoğun kaç adete yettiğine göre (en az kapsayan önce).
  const coverage = (m: MaterialListRow) => (m.min_units_coverable === null ? Number.POSITIVE_INFINITY : Number(m.min_units_coverable));
  const recipeMaterials = materials
    .filter((m) => m.active_bom_count > 0)
    .sort((a, b) => coverage(a) - coverage(b) || a.state_rank - b.state_rank || a.name.localeCompare(b.name, "tr"));

  const topValue: TopValueRow[] = materials
    .filter((m) => Number(m.value_try) > 0)
    .sort((a, b) => Number(b.value_try) - Number(a.value_try))
    .slice(0, 8)
    .map((m) => ({
      key: m.id,
      name: m.name,
      code: m.code,
      value: Number(m.value_try),
      valueUsd: Number(m.value_usd),
      qty: `${fmtNum(m.qty_display, 3)} ${m.display_unit}`,
      kind: m.kind,
    }));

  const months = buckets(monthFrom, today, "aylik");
  const flowPoints: MonthlyFlowPoint[] = months.map((month) => {
    const rows = (flows.data ?? []).filter((r) => r.month_start.slice(0, 7) === month);
    const v = (t: MonthlyFlowRow["movement_type"]) =>
      rows.filter((r) => r.movement_type === t).reduce((s, r) => s + Number(r.value_try), 0);
    return {
      month,
      purchase: v("purchase"),
      consume: -(v("production_consume") + v("production_return")),
      writeOff: -v("write_off"),
    };
  });
  const flowTotals = flowPoints.reduce(
    (a, p) => ({ purchase: a.purchase + p.purchase, consume: a.consume + p.consume, writeOff: a.writeOff + p.writeOff }),
    { purchase: 0, consume: 0, writeOff: 0 },
  );

  const allUnits = units.data ?? [];
  const receiveOptions = active.map(withVat);
  const rows = res.data ?? [];
  const sortProps = { sort: lp.sort, dir: lp.dir, basePath: BASE, values };
  const filtered = Object.keys(values).some((k) => !["sayfa", "adet", "sirala", "yon"].includes(k));
  const rowAction = (m: MaterialListRow) =>
    isAdmin ? (
      <span className="inline-flex items-center gap-0.5">
        {m.is_active ? (
          <RowReceiveDrawer m={m} vatRate={vatRates.get(m.id) ?? 20} units={allUnits} unitsError={units.error} suppliers={suppliers} today={today} />
        ) : null}
        <DeleteButton action={deleteMaterial} fields={{ id: m.id }} title={`${m.name} silinsin mi?`} label={`${m.code} sil`} compact>
          {DELETE_MATERIAL_TEXT}
        </DeleteButton>
      </span>
    ) : null;

  const attentionTitle = critical.length > 0 ? "Dikkat gerektirenler" : "Reçete stok kapsamı";
  const attentionDescription =
    recipeMaterials.length === 0
      ? "Aktif reçetelerde kullanılan malzeme yok."
      : critical.length > 0
        ? `Aktif reçetelerde kullanılan ${fmtInt(recipeMaterials.length)} malzemeden ${fmtInt(critical.length)} tanesi kritik durumda.`
        : `Aktif reçetelerde kullanılan ${fmtInt(recipeMaterials.length)} malzeme, stoğun kaç adet üretime yettiğine göre sıralandı.`;

  return (
    <>
      <PageHeader
        title="Hammadde ve komponentler"
        description="Rafta bulunan, henüz ürüne monte edilmemiş tüm malzemeler gerçek miktar ve maliyet değeriyle izlenir. Değerleme hareketli ağırlıklı ortalamadır; her alış kendi günündeki kurla TL ve USD olarak sabitlenir."
        actions={
          isAdmin ? (
            <>
              <ClearParamsOnClose keys={ACTION_KEYS}>
                <Drawer
                  trigger={
                    <>
                      <ArrowDownToLine aria-hidden />
                      Stok girişi
                    </>
                  }
                  triggerVariant="secondary"
                  title="Stok girişi (hammadde alışı)"
                  description="Seçilen malzemeye alış kaydı eklenir; stok ve ağırlıklı ortalama maliyet güncellenir."
                  size="lg"
                  defaultOpen={lp.values.islem === "giris"}
                >
                  {units.error ? (
                    <ErrorState message={units.error} compact title="Birimler yüklenemedi" />
                  ) : all.error ? (
                    <ErrorState message={all.error} compact title="Malzemeler yüklenemedi" />
                  ) : receiveOptions.length === 0 ? (
                    <EmptyState title="Aktif malzeme yok" icon={Boxes} compact>
                      Önce “Yeni malzeme” ile bir malzeme tanımlayın.
                    </EmptyState>
                  ) : (
                    <ReceiveForm materials={receiveOptions} initialMaterialId={lp.values.malzeme} units={allUnits} suppliers={suppliers} today={today} />
                  )}
                </Drawer>
              </ClearParamsOnClose>
              <Drawer
                trigger={
                  <>
                    <Plus aria-hidden />
                    Yeni malzeme
                  </>
                }
                title="Yeni malzeme"
                description="Malzeme oluşturulduktan sonra detay sayfasında ilk alışı (stok girişini) kaydedebilirsiniz."
                size="md"
              >
                {units.error ? (
                  <ErrorState message={units.error} compact title="Birimler yüklenemedi" />
                ) : (
                  <ActionForm action={createMaterial} resetOnSuccess>
                    <MaterialFields units={allUnits} />
                    <div className="mt-5 flex justify-end border-t border-line pt-4">
                      <SubmitButton>Malzemeyi oluştur</SubmitButton>
                    </div>
                  </ActionForm>
                )}
              </Drawer>
            </>
          ) : null
        }
      />

      {all.error ? (
        <Card className="mb-4">
          <ErrorState message={all.error} compact title="Stok özeti yüklenemedi" />
        </Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard
              label="Stok değeri"
              value={fmtMoney(totalTry, "TRY")}
              icon={Wallet}
              tone="blue"
              description={`Güncel stok · USD karşılığı ${fmtMoney(totalUsd, "USD")} (alış kurlarıyla, bilgi)`}
            />
            <StatCard
              label="Malzeme"
              value={fmtInt(active.length)}
              unit="aktif"
              icon={Boxes}
              tone="brand"
              description={`${fmtInt(rawCount)} hammadde · ${fmtInt(compCount)} komponent${materials.length > active.length ? ` · ${fmtInt(materials.length - active.length)} pasif` : ""}`}
            />
            <StatCard
              label="Stoğu biten"
              value={fmtInt(outCount)}
              unit="malzeme"
              icon={PackageX}
              tone="amber"
              description="Aktif malzemelerden güncel miktarı 0 olanlar"
              href="/hammadde?stok=tukendi&durum=aktif"
            />
            <StatCard
              label="Kritik"
              value={fmtInt(critical.length)}
              unit="malzeme"
              icon={AlertOctagon}
              tone="red"
              description="Aktif reçetede kullanılıp stoğu biten veya 1 adete yetmeyen"
              href="/hammadde?stok=kritik"
            />
          </div>
          {truncated ? (
            <p className="-mt-2 mb-4 text-xs text-ink-muted">
              Özet ilk {fmtInt(materials.length)} malzemeye göre hesaplandı (toplam {fmtInt(all.count)}).
            </p>
          ) : null}

          <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.85fr)]">
            <Card
              title="Aylık malzeme hareketi"
              description="Son 12 ay · tüm malzemeler · TL (işlem günü değeri)"
              padded={false}
              className="md:col-span-2 xl:col-span-1"
            >
              {flows.error ? (
                <ErrorState message={flows.error} compact />
              ) : (
                <>
                  <div className="p-4 pb-3">
                    <MonthlyFlowChart data={flowPoints} />
                  </div>
                  <div className="border-t border-line">
                    <MetricRow
                      items={[
                        { label: "Alış", value: fmtMoney(flowTotals.purchase, "TRY") },
                        { label: "Tüketim", value: fmtMoney(flowTotals.consume, "TRY") },
                        { label: "Fire / sayım", value: fmtMoney(flowTotals.writeOff, "TRY") },
                      ]}
                    />
                  </div>
                </>
              )}
            </Card>

            <Card title="En değerli malzemeler" description="Stok değerine göre ilk 8 · güncel stok" padded={false}>
              <div className="p-4 pb-3">
                <TopValueChart data={topValue} total={totalTry} />
              </div>
              <div className="border-t border-line">
                <MetricRow
                  items={[
                    { label: "Hammadde", value: fmtMoney(rawValue, "TRY") },
                    { label: "Komponent", value: fmtMoney(totalTry - rawValue, "TRY") },
                  ]}
                />
              </div>
            </Card>

            <Card
              title={attentionTitle}
              description={attentionDescription}
              padded={false}
              actions={
                critical.length > 0 ? (
                  <Link href="/hammadde?stok=kritik" className="link text-xs">
                    Tümü
                  </Link>
                ) : recipeMaterials.length > 6 ? (
                  <Link href="/hammadde?sirala=risk&yon=desc" className="link text-xs">
                    Tümü
                  </Link>
                ) : null
              }
            >
              {recipeMaterials.length === 0 ? (
                <EmptyState title="Reçetede kullanılan malzeme yok" icon={ListTree} compact>
                  Malzemeler bir aktif ürün reçetesine (BOM) eklendiğinde stok kapsamı burada izlenir.
                </EmptyState>
              ) : (
                <>
                  {critical.length === 0 ? (
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-4 py-2 text-xs text-ink-muted">
                      <Badge tone="green" icon={ShieldCheck}>
                        Kritik malzeme yok
                      </Badge>
                      Her reçete malzemesi en az 1 adete yetiyor.
                    </p>
                  ) : null}
                  <ul className="divide-y divide-line">
                    {recipeMaterials.slice(0, 6).map((m) => {
                      const isCritical = m.stock_state === "out_used" || m.stock_state === "short";
                      return (
                        <li key={m.id}>
                          <Link href={`/hammadde/${m.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-canvas/60">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-ink" title={m.name}>
                                {m.name}
                              </span>
                              <span className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-muted">
                                <span className="code text-ink-muted">{m.code}</span>
                                <span className="whitespace-nowrap tabular-nums">
                                  Stok {fmtNum(m.qty_display, 3)} {m.display_unit}
                                </span>
                                <span className="whitespace-nowrap">{fmtInt(m.active_bom_count)} reçete</span>
                              </span>
                            </span>
                            {isCritical ? (
                              <span className="shrink-0">
                                <MaterialStateBadge state={m.stock_state} />
                              </span>
                            ) : (
                              <span
                                className="shrink-0 text-right"
                                title="Mevcut stok, bu malzemeyi en çok kullanan aktif reçetede (yalnız bu malzemeye göre) kaç adete yeter"
                              >
                                <span className="block text-[13px] font-semibold text-ink tabular-nums">
                                  {m.min_units_coverable !== null ? `${fmtInt(m.min_units_coverable)} adet` : "—"}
                                </span>
                                <span className="block text-xs text-ink-muted">üretime yeter</span>
                              </span>
                            )}
                            <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              <div className="border-t border-line px-4 py-2.5 text-xs text-ink-muted">
                <span className="font-medium text-ink-soft">Kritik:</span> aktif reçetede kullanılıp stoğu biten ya da 1 adetlik ihtiyacı
                karşılamayan malzeme. <span className="font-medium text-ink-soft">Kapsam:</span> stoğun, malzemeyi en çok kullanan reçetede kaç
                adete yettiği. Malzemelerde minimum stok eşiği yoktur.
              </div>
            </Card>
          </div>

          <Card
            className="mb-4"
            title="Tedarikçilere ödenen tutar"
            icon={Handshake}
            description="Tüm zamanlar · hammadde alışları · KDV dahil TL (alış günü kuruyla) · ilk 10 tedarikçi"
            actions={
              <Link href="/tedarikciler" className="link text-xs">
                Tedarikçiler
              </Link>
            }
            padded={false}
          >
            {supplierRes.error ? (
              <ErrorState message={supplierRes.error} compact />
            ) : (
              <>
                <div className="p-4 pb-3">
                  <SupplierSpendChart data={supplierSpend} />
                </div>
                <div className="border-t border-line">
                  <MetricRow
                    items={[
                      { label: "Toplam ödenen (KDV dahil)", value: fmtMoney(supplierTotalTry, "TRY") },
                      { label: "KDV", value: fmtMoney(supplierVatTry, "TRY") },
                      { label: "Alış yapılan", value: fmtInt(supplierRows.filter((x) => Number(x.purchase_count) > 0).length) },
                    ]}
                  />
                </div>
              </>
            )}
          </Card>
        </>
      )}

      <Card padded={false}>
        <ListToolbar
          basePath={BASE}
          values={values}
          total={res.error || res.outOfRange ? null : res.count}
          noun="malzeme"
          search={{ placeholder: "Kod, ad veya not ara…" }}
          filters={[
            {
              key: "tur",
              label: "Tür",
              options: [
                { value: "hammadde", label: "Hammadde" },
                { value: "komponent", label: "Komponent" },
              ],
            },
            {
              key: "stok",
              label: "Stok durumu",
              options: [
                { value: "stokta", label: "Stokta" },
                { value: "tukendi", label: "Tükendi" },
                { value: "kritik", label: "Kritik (reçete riski)" },
              ],
            },
            {
              key: "durum",
              label: "Aktiflik",
              options: [
                { value: "aktif", label: "Aktif" },
                { value: "pasif", label: "Pasif" },
              ],
            },
          ]}
        />
        {res.error ? (
          <ErrorState message={res.error} />
        ) : res.outOfRange ? (
          <EmptyState
            title="Bu sayfada malzeme yok"
            icon={Boxes}
            action={
              <ButtonLink href={hrefWith(BASE, values, { sayfa: null })} variant="secondary" size="sm">
                İlk sayfaya dön
              </ButtonLink>
            }
          >
            Sayfa numarası sonuç sayısını aşıyor.
          </EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState
            title={filtered ? "Filtrelere uyan malzeme yok" : "Henüz malzeme yok"}
            icon={Boxes}
            action={
              filtered ? (
                <ButtonLink href={BASE} variant="secondary" size="sm">
                  Filtreleri temizle
                </ButtonLink>
              ) : null
            }
          >
            {filtered
              ? "Aramayı veya filtreleri değiştirin."
              : "“Yeni malzeme” ile malzeme tanımlayın; ardından stok girişiyle alış kaydedin."}
          </EmptyState>
        ) : (
          <>
            {/* Mobil ve tablet: kart listesi + sıralama bağlantıları (tablo yatay kaydırma gerektirmesin) */}
            <div className="xl:hidden">
              <div className="flex items-center gap-2 overflow-x-auto border-b border-line px-4 py-2.5 [scrollbar-width:none]">
                <span className="shrink-0 text-xs text-ink-muted">Sırala</span>
                <LinkSegmented
                  active={sortKey}
                  items={MOBILE_SORTS.map((o) => ({
                    key: o.key,
                    label: o.label,
                    href: hrefWith(BASE, values, { sirala: o.key, yon: o.dir, sayfa: null }),
                  }))}
                />
              </div>
              <ul className="divide-y divide-line">
                {rows.map((m) => (
                  <li key={m.id} className={m.is_active ? "px-4 py-3" : "px-4 py-3 text-ink-muted"}>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <Link href={`/hammadde/${m.id}`} className="link truncate" title={m.name}>
                            {m.name}
                          </Link>
                          {!m.is_active ? <Badge>Pasif</Badge> : null}
                        </div>
                        <p className="flex min-w-0 items-baseline gap-1.5 text-xs text-ink-muted">
                          <span className="code text-ink-muted">{m.code}</span>
                          {m.notes ? (
                            <span className="truncate" title={m.notes}>
                              · {m.notes}
                            </span>
                          ) : null}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <KindBadge kind={m.kind} />
                          <MaterialStateBadge state={m.stock_state} />
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {rowAction(m)}
                        <ButtonLink href={`/hammadde/${m.id}`} variant="ghost" size="sm" aria-label={`Detay: ${m.code}`}>
                          <span className="hidden sm:inline">Detay</span>
                          <ChevronRight aria-hidden />
                        </ButtonLink>
                      </div>
                    </div>
                    <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-md bg-canvas/70 px-3 py-2.5 sm:grid-cols-4">
                      <ListValue
                        label="Miktar"
                        value={`${fmtNum(m.qty_display, 3)} ${m.display_unit}`}
                        hint={m.display_unit !== m.base_unit ? `${fmtNum(m.qty, 3)} ${m.base_unit}` : undefined}
                      />
                      <ListValue
                        label={`Ort. maliyet / ${m.display_unit}`}
                        value={m.avg_cost_try_display !== null ? fmtUnitMoney(m.avg_cost_try_display, "TRY") : "—"}
                        hint={m.avg_cost_usd_display !== null ? fmtUnitMoney(m.avg_cost_usd_display, "USD") : "Stok yok"}
                      />
                      <ListValue label="Stok değeri" value={fmtMoney(m.value_try, "TRY")} hint={fmtMoney(m.value_usd, "USD")} />
                      <ListValue
                        label="Son alış"
                        value={m.last_purchase_on ? fmtDate(m.last_purchase_on) : "Alış yok"}
                        hint={m.active_bom_count > 0 ? `${fmtInt(m.active_bom_count)} aktif reçete` : "Reçetede yok"}
                      />
                    </dl>
                  </li>
                ))}
              </ul>
            </div>

            {/* Geniş ekran: tablo. 1280–1400 px arasında Tür ve Reçete sütunları katlanır. */}
            <TableWrap className="hidden xl:block">
              <table className="table-base">
                <thead>
                  <tr>
                    <SortTh label="Malzeme" column="name" {...sortProps} title="Ada göre sırala (kod altta)" />
                    <SortTh label="Tür" column="kind" {...sortProps} className={WIDE_CELL} />
                    <SortTh label="Durum" column="risk" {...sortProps} title="İlk tıklama: kritik olanlar önce" />
                    <SortTh label="Miktar" column="qty_display" align="right" {...sortProps} />
                    <SortTh
                      label="Ort. birim maliyet"
                      column="avg_cost_try_display"
                      align="right"
                      {...sortProps}
                      title="Hareketli ağırlıklı ortalama, gösterim birimi başına"
                    />
                    <SortTh label="Stok değeri" column="value_try" align="right" {...sortProps} />
                    <SortTh
                      label="Reçete"
                      column="active_bom_count"
                      align="right"
                      {...sortProps}
                      title="Kullanıldığı aktif reçete sayısı"
                      className={WIDE_CELL}
                    />
                    <SortTh label="Son alış" column="last_purchase_on" align="right" {...sortProps} />
                    <th className="text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id} className={!m.is_active ? "text-ink-muted" : undefined}>
                      <td className="max-w-[18rem] min-w-[12rem]">
                        <div className="flex items-center gap-1.5">
                          <Link href={`/hammadde/${m.id}`} className="link truncate" title={m.name}>
                            {m.name}
                          </Link>
                          {!m.is_active ? <Badge>Pasif</Badge> : null}
                        </div>
                        <div className="flex min-w-0 items-baseline gap-1.5 text-xs text-ink-muted">
                          <span className="code text-ink-muted">{m.code}</span>
                          <span className={`shrink-0 ${NARROW_ONLY}`}>· {m.kind === "component" ? "Komponent" : "Hammadde"}</span>
                          {m.notes ? (
                            <span className="truncate" title={m.notes}>
                              · {m.notes}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className={WIDE_CELL}>
                        <KindBadge kind={m.kind} />
                      </td>
                      <td>
                        <MaterialStateBadge state={m.stock_state} />
                        {m.active_bom_count > 0 ? (
                          <div className={`mt-0.5 text-xs text-ink-muted ${NARROW_ONLY}`}>{fmtInt(m.active_bom_count)} aktif reçete</div>
                        ) : null}
                      </td>
                      <td className="num">
                        <span className="font-medium text-ink">
                          {fmtNum(m.qty_display, 3)} {m.display_unit}
                        </span>
                        {m.display_unit !== m.base_unit ? (
                          <div className="text-xs text-ink-muted">
                            {fmtNum(m.qty, 3)} {m.base_unit}
                          </div>
                        ) : null}
                      </td>
                      <td className="num">
                        {m.avg_cost_try_display !== null ? (
                          <>
                            {fmtUnitMoney(m.avg_cost_try_display, "TRY")} <span className="text-xs text-ink-muted">/ {m.display_unit}</span>
                            <div className="text-xs text-ink-muted">
                              {fmtUnitMoney(m.avg_cost_usd_display, "USD")} / {m.display_unit}
                            </div>
                          </>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="num">
                        <span className="font-medium text-ink">{fmtMoney(m.value_try, "TRY")}</span>
                        <div className="text-xs text-ink-muted">{fmtMoney(m.value_usd, "USD")}</div>
                      </td>
                      <td className={`num ${WIDE_CELL}`}>
                        {m.active_bom_count > 0 ? fmtInt(m.active_bom_count) : <span className="text-ink-muted">—</span>}
                      </td>
                      <td className="num">
                        {m.last_purchase_on ? fmtDate(m.last_purchase_on) : <span className="text-ink-muted">Alış yok</span>}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          {rowAction(m)}
                          <ButtonLink href={`/hammadde/${m.id}`} variant="ghost" size="sm" aria-label={`Detay: ${m.code}`}>
                            Detay
                            <ChevronRight aria-hidden />
                          </ButtonLink>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </>
        )}
        {res.count ? (
          <Pagination basePath={BASE} values={values} page={lp.page} pageSize={lp.pageSize} total={res.count} noun="malzeme" />
        ) : null}
      </Card>
    </>
  );
}

/** Satır işlemi: malzemeye sabitli stok girişi penceresi. Birimler yüklenemezse pencere içinde hata gösterilir. */
function RowReceiveDrawer({
  m,
  vatRate,
  units,
  unitsError,
  suppliers,
  today,
}: {
  m: MaterialListRow;
  vatRate: number;
  units: Unit[];
  unitsError: string | null;
  suppliers: SupplierOption[];
  today: string;
}) {
  const kindUnits = units.filter((u) => u.kind === m.unit_kind);
  return (
    <Drawer
      trigger={
        <>
          <ArrowDownToLine aria-hidden />
          Giriş
        </>
      }
      triggerLabel={`Giriş: ${m.code} stok girişi`}
      triggerVariant="ghost"
      triggerSize="sm"
      title={`Stok girişi · ${m.name}`}
      description={`${m.code} · mevcut ${fmtNum(m.qty_display, 3)} ${m.display_unit}`}
      size="lg"
    >
      {unitsError ? (
        <ErrorState message={unitsError} compact title="Birimler yüklenemedi" />
      ) : kindUnits.length === 0 ? (
        <EmptyState title="Uygun birim bulunamadı" icon={Boxes} compact>
          Bu malzemenin birim türünde tanımlı birim yok; alış kaydedilemez.
        </EmptyState>
      ) : (
        <ReceiveForm material={{ ...toOption(m), vat_rate: vatRate }} units={kindUnits} suppliers={suppliers} today={today} />
      )}
    </Drawer>
  );
}
