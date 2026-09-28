import { AlertOctagon, ArrowDownToLine, Boxes, ChevronRight, PackageX, Plus, ShieldCheck, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
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
import type { Unit } from "@/lib/types";
import { KindBadge, MaterialStateBadge } from "./_components/bits";
import { MonthlyFlowChart, type MonthlyFlowPoint } from "./_components/MonthlyFlowChart";
import { TopValueChart, type TopValueRow } from "./_components/TopValueChart";
import { toOption, type MaterialListRow, type MonthlyFlowRow } from "./_components/types";
import { createMaterial } from "./actions";
import { MaterialFields } from "./MaterialForm";
import { ReceiveForm } from "./ReceiveForm";

export const metadata: Metadata = { title: "Hammadde" };

const BASE = "/hammadde";
const SORTABLE = [
  "code",
  "name",
  "kind",
  "state_rank",
  "qty_display",
  "avg_cost_try_display",
  "value_try",
  "active_bom_count",
  "last_purchase_on",
];
const KIND_FILTER: Record<string, "raw" | "component"> = { hammadde: "raw", komponent: "component", raw: "raw", component: "component" };
const MOBILE_SORTS = [
  { key: "name", label: "Ad", dir: "asc" },
  { key: "value_try", label: "Değer", dir: "desc" },
  { key: "state_rank", label: "Durum", dir: "asc" },
  { key: "last_purchase_on", label: "Son alış", dir: "desc" },
] as const;
/** Liste durumu sayılmayan, yalnız pencere açmak için kullanılan anahtarlar */
const ACTION_KEYS = ["islem", "malzeme"];

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireMember();
  const isAdmin = ctx.role === "admin";
  const lp = parseListParams(await searchParams, { sortable: SORTABLE, defaultSort: "name", defaultDir: "asc" });
  const values = Object.fromEntries(Object.entries(lp.values).filter(([k]) => !ACTION_KEYS.includes(k)));
  const today = todayTr();
  const monthFrom = `${addDays(`${today.slice(0, 7)}-15`, -335).slice(0, 7)}-01`;

  // Tablo: sunucu tarafı arama, filtre, sıralama ve sayfalama
  let query = ctx.supabase.from("v_material_list").select("*", { count: "exact" });
  const pattern = searchPattern(lp.q);
  if (pattern) query = query.or(`code.ilike.${pattern},name.ilike.${pattern},notes.ilike.${pattern}`);
  const kind = KIND_FILTER[values.tur];
  if (kind) query = query.eq("kind", kind);
  if (values.stok === "stokta") query = query.gt("qty", 0);
  else if (values.stok === "tukendi") query = query.lte("qty", 0);
  else if (values.stok === "kritik") query = query.in("stock_state", ["out_used", "short"]);
  if (values.durum === "aktif") query = query.eq("is_active", true);
  else if (values.durum === "pasif") query = query.eq("is_active", false);

  const [res, all, flows, units] = await Promise.all([
    load(
      query
        .order(lp.sort ?? "name", { ascending: lp.dir === "asc", nullsFirst: false })
        .order("name", { ascending: true })
        .order("code", { ascending: true })
        .range(lp.from, lp.to)
        .returns<MaterialListRow[]>(),
    ),
    // Özet kartları ve grafikler: filtreden bağımsız, tüm malzemeler (güncel stok)
    load(ctx.supabase.from("v_material_list").select("*", { count: "exact" }).order("name").returns<MaterialListRow[]>()),
    load<MonthlyFlowRow[]>(ctx.supabase.rpc("material_monthly_flows", { p_from: monthFrom })),
    load(ctx.supabase.from("units").select("*").order("sort_order").returns<Unit[]>()),
  ]);

  const materials = all.data ?? [];
  const truncated = all.count !== null && all.count > materials.length;
  const active = materials.filter((m) => m.is_active);
  const totalTry = materials.reduce((s, m) => s + Number(m.value_try), 0);
  const totalUsd = materials.reduce((s, m) => s + Number(m.value_usd), 0);
  const rawValue = materials.filter((m) => m.kind === "raw").reduce((s, m) => s + Number(m.value_try), 0);
  const rawCount = active.filter((m) => m.kind === "raw").length;
  const compCount = active.filter((m) => m.kind === "component").length;
  const outCount = active.filter((m) => Number(m.qty) <= 0).length;
  const critical = materials
    .filter((m) => m.stock_state === "out_used" || m.stock_state === "short")
    .sort((a, b) => a.state_rank - b.state_rank || a.name.localeCompare(b.name, "tr"));
  const usedInRecipes = materials.filter((m) => m.active_bom_count > 0).length;

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
  const receiveOptions = active.map(toOption);
  const rows = res.data ?? [];
  const sortProps = { sort: lp.sort, dir: lp.dir, basePath: BASE, values };
  const filtered = Object.keys(values).some((k) => !["sayfa", "adet", "sirala", "yon"].includes(k));

  return (
    <>
      <PageHeader
        title="Hammadde ve komponentler"
        description="Rafta bulunan, henüz ürüne monte edilmemiş tüm malzemeler gerçek miktar ve maliyet değeriyle izlenir. Değerleme hareketli ağırlıklı ortalamadır; her alış kendi günündeki kurla TL ve USD olarak sabitlenir."
        actions={
          isAdmin ? (
            <>
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
                  <ReceiveForm materials={receiveOptions} initialMaterialId={lp.values.malzeme} units={allUnits} today={today} />
                )}
              </Drawer>
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
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Stok değeri"
              scope="Güncel stok"
              value={fmtMoney(totalTry, "TRY")}
              icon={Wallet}
              tone="blue"
              description={`USD karşılığı ${fmtMoney(totalUsd, "USD")} · alış kurlarıyla (bilgi)`}
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
              scope="Güncel stok"
              value={fmtInt(outCount)}
              unit="malzeme"
              icon={PackageX}
              tone="amber"
              description="Aktif malzemelerden miktarı 0 olanlar"
              href="/hammadde?stok=tukendi&durum=aktif"
            />
            <StatCard
              label="Kritik malzeme"
              scope="Güncel stok"
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
            <Card title="Aylık malzeme hareketi" description="Son 12 ay · tüm malzemeler · TL (işlem günü değeri)" padded={false}>
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
                        { label: "Üretime çıkan (net)", value: fmtMoney(flowTotals.consume, "TRY") },
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
              title="Dikkat gerektirenler"
              description={`Aktif reçetelerde kullanılan ${fmtInt(usedInRecipes)} malzemeden`}
              padded={false}
              className="md:col-span-2 xl:col-span-1"
              actions={
                critical.length > 0 ? (
                  <Link href="/hammadde?stok=kritik" className="link text-xs">
                    Tümü
                  </Link>
                ) : null
              }
            >
              {critical.length === 0 ? (
                <EmptyState title="Kritik malzeme yok" icon={ShieldCheck} compact>
                  Aktif reçetelerde kullanılan tüm malzemelerin stoğu en az 1 adetlik üretime yetiyor.
                </EmptyState>
              ) : (
                <ul className="divide-y divide-line">
                  {critical.slice(0, 6).map((m) => (
                    <li key={m.id}>
                      <Link href={`/hammadde/${m.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-canvas/60">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-ink">{m.name}</span>
                          <span className="code text-ink-muted">{m.code}</span>
                          <span className="ml-2 text-xs text-ink-muted">{fmtInt(m.active_bom_count)} aktif reçete</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <MaterialStateBadge state={m.stock_state} />
                          <span className="mt-0.5 block text-xs text-ink-muted tabular-nums">
                            {fmtNum(m.qty_display, 3)} {m.display_unit}
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t border-line px-4 py-2.5 text-xs text-ink-muted">
                <span className="font-medium text-ink-soft">Kritik:</span> aktif reçetede kullanılıp stoğu biten ya da bir aktif reçetenin 1
                adetlik ihtiyacını karşılamayan malzeme. Malzemelerde minimum stok eşiği tanımlı değildir.
              </div>
            </Card>
          </div>
        </>
      )}

      <Card padded={false}>
        <ListToolbar
          basePath={BASE}
          values={values}
          total={res.error ? null : res.count}
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
            {/* Dar ekran: kart listesi + sıralama bağlantıları */}
            <div className="sm:hidden">
              <div className="flex items-center gap-2 overflow-x-auto border-b border-line px-4 py-2.5 [scrollbar-width:none]">
                <span className="shrink-0 text-xs text-ink-muted">Sırala</span>
                <LinkSegmented
                  active={lp.sort ?? "name"}
                  items={MOBILE_SORTS.map((o) => ({
                    key: o.key,
                    label: o.label,
                    href: hrefWith(BASE, values, { sirala: o.key, yon: o.dir, sayfa: null }),
                  }))}
                />
              </div>
              <ul className="divide-y divide-line">
                {rows.map((m) => (
                  <li key={m.id}>
                    <Link href={`/hammadde/${m.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-canvas/60">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-medium text-brand-600">{m.name}</span>
                          {!m.is_active ? <Badge>Pasif</Badge> : null}
                        </span>
                        <span className="code block text-ink-muted">{m.code}</span>
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          <KindBadge kind={m.kind} />
                          <MaterialStateBadge state={m.stock_state} />
                        </span>
                      </span>
                      <span className="shrink-0 text-right tabular-nums">
                        <span className="block font-semibold text-ink">
                          {fmtNum(m.qty_display, 3)} {m.display_unit}
                        </span>
                        <span className="block text-xs text-ink-soft">{fmtMoney(m.value_try, "TRY")}</span>
                        <span className="block text-xs text-ink-muted">
                          {m.avg_cost_try_display !== null
                            ? `${fmtUnitMoney(m.avg_cost_try_display, "TRY")} / ${m.display_unit}`
                            : "Ort. maliyet yok"}
                        </span>
                      </span>
                      <ChevronRight className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <TableWrap className="hidden sm:block">
              <table className="table-base">
                <thead>
                  <tr>
                    <SortTh label="Malzeme" column="name" {...sortProps} title="Ada göre sırala (kod altta)" />
                    <SortTh label="Tür" column="kind" {...sortProps} />
                    <SortTh label="Durum" column="state_rank" {...sortProps} title="Kritik olanlar önce (artan)" />
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
                    />
                    <SortTh label="Son alış" column="last_purchase_on" align="right" {...sortProps} />
                    <th className="text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => {
                    const option = toOption(m);
                    const kindUnits = allUnits.filter((u) => u.kind === m.unit_kind);
                    return (
                      <tr key={m.id} className={!m.is_active ? "text-ink-muted" : undefined}>
                        <td className="max-w-[18rem] min-w-[12rem]">
                          <div className="flex items-center gap-1.5">
                            <Link href={`/hammadde/${m.id}`} className="link truncate">
                              {m.name}
                            </Link>
                            {!m.is_active ? <Badge>Pasif</Badge> : null}
                          </div>
                          <div className="flex min-w-0 items-baseline gap-1.5 text-xs text-ink-muted">
                            <span className="code text-ink-muted">{m.code}</span>
                            {m.notes ? (
                              <span className="truncate" title={m.notes}>
                                · {m.notes}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <KindBadge kind={m.kind} />
                        </td>
                        <td>
                          <MaterialStateBadge state={m.stock_state} />
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
                              {fmtUnitMoney(m.avg_cost_try_display, "TRY")}{" "}
                              <span className="text-xs text-ink-muted">/ {m.display_unit}</span>
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
                        <td className="num">
                          {m.active_bom_count > 0 ? fmtInt(m.active_bom_count) : <span className="text-ink-muted">—</span>}
                        </td>
                        <td className="num">
                          {m.last_purchase_on ? fmtDate(m.last_purchase_on) : <span className="text-ink-muted">Alış yok</span>}
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-1">
                            {isAdmin && m.is_active && kindUnits.length > 0 ? (
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
                                <ReceiveForm material={option} units={kindUnits} today={today} />
                              </Drawer>
                            ) : null}
                            <ButtonLink href={`/hammadde/${m.id}`} variant="ghost" size="sm" aria-label={`Detay: ${m.code}`}>
                              Detay
                              <ChevronRight aria-hidden />
                            </ButtonLink>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
