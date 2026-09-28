import { AlertOctagon, AlertTriangle, Layers, ListTree, ListX, Package, Plus, Warehouse } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { StockStatusBadge } from "@/components/StockStatus";
import { Badge, Card, EmptyState, ErrorState, PageHeader, ProgressBar, StatCard, TableWrap, buttonClass } from "@/components/ui";
import { Drawer } from "@/components/ui/dialog";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { Pagination, SortTh } from "@/components/ui/list";
import { requireMember } from "@/lib/auth";
import { fmtInt, fmtMinutes, fmtMoney } from "@/lib/format";
import { parseListParams, searchPattern, type SearchParams } from "@/lib/list-params";
import { load } from "@/lib/query";
import { ProductThumb, StatusMeter, fmtCostRange } from "./_components/bits";
import { StockByProductChart, type StockBarRow } from "./_components/StockByProductChart";
import { redirectIfPageOutOfRange } from "./_components/paging";
import type { ProductListRow } from "./_components/types";
import { createProduct } from "./actions";
import { ProductFields } from "./ProductFields";

export const metadata: Metadata = { title: "Ürünler ve BOM" };

const BASE = "/urunler";
const SORTABLE = ["code", "name", "variant_count", "default_sale_price", "unit_production_minutes", "total_remaining", "worst_severity"];
const STOCK_FILTER: Record<string, ProductListRow["worst_stock_status"]> = {
  kritik: "critical",
  "min-alti": "low",
  "hedef-alti": "below_target",
  yeterli: "ok",
};

type StatRow = Pick<
  ProductListRow,
  | "id"
  | "code"
  | "name"
  | "is_active"
  | "variant_count"
  | "active_variant_count"
  | "critical_variant_count"
  | "low_variant_count"
  | "below_target_variant_count"
  | "ok_variant_count"
  | "no_bom_variant_count"
  | "total_remaining"
  | "heatemp_qty"
  | "mekonsis_qty"
  | "last_cost_usd_max"
>;

function statusCount(r: ProductListRow) {
  switch (r.worst_stock_status) {
    case "critical":
      return r.critical_variant_count;
    case "low":
      return r.low_variant_count;
    case "below_target":
      return r.below_target_variant_count;
    case "ok":
      return r.ok_variant_count;
    default:
      return 0;
  }
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireMember();
  const isAdmin = ctx.role === "admin";
  const lp = parseListParams(await searchParams, { sortable: SORTABLE, defaultSort: "name", defaultDir: "asc" });
  const v = lp.values;

  let query = ctx.supabase.from("v_product_list").select("*", { count: "exact" });
  const pattern = searchPattern(lp.q);
  if (pattern) query = query.or(`code.ilike.${pattern},name.ilike.${pattern},variant_codes.ilike.${pattern},description.ilike.${pattern}`);
  if (v.durum === "aktif") query = query.eq("is_active", true);
  else if (v.durum === "pasif") query = query.eq("is_active", false);
  const stock = v.stok ? STOCK_FILTER[v.stok] : undefined;
  if (stock) query = query.eq("worst_stock_status", stock);
  if (v.recete === "eksik") query = query.gt("no_bom_variant_count", 0);
  else if (v.recete === "tam") query = query.eq("no_bom_variant_count", 0);

  const [res, stats] = await Promise.all([
    load(
      query
        .order(lp.sort ?? "name", { ascending: lp.dir === "asc", nullsFirst: false })
        .order("name", { ascending: true })
        .range(lp.from, lp.to)
        .returns<ProductListRow[]>(),
    ),
    load(
      ctx.supabase
        .from("v_product_list")
        .select(
          "id, code, name, is_active, variant_count, active_variant_count, critical_variant_count, low_variant_count, below_target_variant_count, ok_variant_count, no_bom_variant_count, total_remaining, heatemp_qty, mekonsis_qty, last_cost_usd_max",
        )
        .returns<StatRow[]>(),
    ),
  ]);

  redirectIfPageOutOfRange(res.error, lp, BASE);

  // Özet: aktif ürünlerin aktif varyantları (pasif ürünün varyantları pasif sayılır).
  const all = stats.data ?? [];
  const active = all.filter((p) => p.is_active);
  const sum = (rows: StatRow[], k: keyof StatRow) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  const variantTotal = sum(all, "variant_count");
  const activeVariants = sum(active, "active_variant_count");
  const counts = {
    critical: sum(active, "critical_variant_count"),
    low: sum(active, "low_variant_count"),
    below_target: sum(active, "below_target_variant_count"),
    ok: sum(active, "ok_variant_count"),
  };
  const noBom = sum(active, "no_bom_variant_count");
  const withBatchCost = active.filter((p) => p.last_cost_usd_max !== null).length;
  const stockRows: StockBarRow[] = [...all]
    .filter((p) => p.total_remaining > 0)
    .sort((a, b) => b.total_remaining - a.total_remaining)
    .slice(0, 8)
    .map((p) => ({ key: p.id, label: p.name, code: p.code, heatemp: p.heatemp_qty, mekonsis: p.mekonsis_qty }));
  const stockTotal = sum(all, "total_remaining");

  const rows = res.data ?? [];
  const sortProps = { sort: lp.sort, dir: lp.dir, basePath: BASE, values: v };
  const filtered = Object.keys(v).some((k) => !["sayfa", "adet", "sirala", "yon"].includes(k));

  return (
    <>
      <PageHeader
        title="Ürünler ve BOM"
        description="Ürün ve varyantlar; tanımlı satış fiyatı, birim üretim süresi, stok eşikleri, reçete (1 adet) ve maliyetler."
        actions={
          isAdmin ? (
            <Drawer
              trigger={
                <>
                  <Plus aria-hidden />
                  Yeni ürün
                </>
              }
              title="Yeni ürün"
              description="Ürün, ürün koduyla “Standart” adlı bir varyantla oluşturulur; diğer varyantları ürün sayfasından ekleyebilirsiniz."
              size="md"
            >
              <ActionForm action={createProduct} resetOnSuccess>
                <ProductFields />
                <div className="mt-5 flex justify-end border-t border-line pt-4">
                  <SubmitButton>Ürünü oluştur</SubmitButton>
                </div>
              </ActionForm>
            </Drawer>
          ) : null
        }
      />

      {stats.error ? (
        <Card className="mb-4">
          <ErrorState message={stats.error} compact title="Özet yüklenemedi" />
        </Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Ürünler"
              value={fmtInt(all.length)}
              icon={Package}
              tone="brand"
              description={`${fmtInt(active.length)} aktif · ${fmtInt(all.length - active.length)} pasif`}
            />
            <StatCard
              label="Aktif varyant"
              value={fmtInt(activeVariants)}
              unit={`/ ${fmtInt(variantTotal)}`}
              icon={Layers}
              tone="blue"
              description="Aktif ürünlerin aktif varyantları"
            />
            <StatCard
              label="Kritik stok"
              scope="Güncel stok"
              value={fmtInt(counts.critical)}
              unit="varyant"
              icon={AlertOctagon}
              tone="red"
              description={`Minimum altı ${fmtInt(counts.low)} · Hedef altı ${fmtInt(counts.below_target)}`}
              href="/urunler?stok=kritik&durum=aktif"
            />
            <StatCard
              label="Reçetesiz varyant"
              value={fmtInt(noBom)}
              unit="varyant"
              icon={ListX}
              tone="amber"
              description="Tahmini maliyet ve simülasyon için reçete gerekir"
              href="/urunler?recete=eksik&durum=aktif"
            />
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <Card title="Stok ve reçete durumu" description="Aktif ürünlerin aktif varyantları · güncel stok (Heatemp + Mekonsis)">
              <StatusMeter counts={counts} />
              <div className="mt-5 space-y-3 border-t border-line pt-4">
                <div>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="text-ink-soft">Reçetesi tanımlı varyant</span>
                    <span className="font-semibold text-ink tabular-nums">
                      {fmtInt(activeVariants - noBom)} / {fmtInt(activeVariants)}
                    </span>
                  </div>
                  <ProgressBar value={activeVariants - noBom} max={activeVariants} tone="teal" label="Reçetesi tanımlı aktif varyant oranı" />
                </div>
                <div>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="text-ink-soft">Gerçekleşmiş parti maliyeti olan ürün</span>
                    <span className="font-semibold text-ink tabular-nums">
                      {fmtInt(withBatchCost)} / {fmtInt(active.length)}
                    </span>
                  </div>
                  <ProgressBar value={withBatchCost} max={active.length} tone="blue" label="Tamamlanmış üretim partisi olan aktif ürün oranı" />
                </div>
              </div>
            </Card>
            <Card
              title="Ürün bazında mamul stok"
              description={`En yüksek stoklu ${fmtInt(stockRows.length)} ürün · toplam ${fmtInt(stockTotal)} adet`}
            >
              <StockByProductChart data={stockRows} />
            </Card>
          </div>
        </>
      )}

      <Card padded={false}>
        <ListToolbar
          basePath={BASE}
          values={v}
          total={res.count}
          noun="ürün"
          search={{ placeholder: "Kod, ad veya varyant kodu ara…" }}
          filters={[
            {
              key: "durum",
              label: "Durum",
              options: [
                { value: "aktif", label: "Aktif" },
                { value: "pasif", label: "Pasif" },
              ],
            },
            {
              key: "stok",
              label: "Stok durumu",
              options: [
                { value: "kritik", label: "Kritik" },
                { value: "min-alti", label: "Minimum altı" },
                { value: "hedef-alti", label: "Hedef altı" },
                { value: "yeterli", label: "Yeterli" },
              ],
            },
            {
              key: "recete",
              label: "Reçete",
              options: [
                { value: "eksik", label: "Reçetesiz varyantı olan" },
                { value: "tam", label: "Tüm varyantların reçetesi var" },
              ],
            },
          ]}
        />
        {res.error ? (
          <ErrorState message={res.error} />
        ) : rows.length === 0 ? (
          <EmptyState title={filtered ? "Filtreye uyan ürün yok" : "Henüz ürün yok"}>
            {filtered ? "Arama veya filtreleri değiştirin." : isAdmin ? "“Yeni ürün” düğmesiyle ilk ürünü ekleyin." : "Yönetici ürün eklediğinde burada listelenir."}
          </EmptyState>
        ) : (
          <>
            {/* Geniş ekran: tablo */}
            <TableWrap className="relative hidden xl:block">
              <table className="table-base">
                <thead>
                  <tr>
                    <SortTh label="Ürün" column="name" {...sortProps} />
                    <SortTh label="Varyant" column="variant_count" {...sortProps} />
                    <th className="num" title="Son gerçekleşmiş parti birim maliyeti ve güncel ortalama malzeme maliyetiyle tahmini reçete maliyeti (1 adet)">
                      Maliyet (USD)
                    </th>
                    <SortTh label="Satış fiyatı" column="default_sale_price" align="right" title="Tanımlı varsayılan satış fiyatı" {...sortProps} />
                    <SortTh label="Birim süre" column="unit_production_minutes" align="right" title="1 adet için üretim süresi" {...sortProps} />
                    <SortTh label="Stok" column="total_remaining" align="right" title="Heatemp + Mekonsis rafı (adet)" {...sortProps} />
                    <SortTh label="Stok durumu" column="worst_severity" title="En kötü durumdaki aktif varyant" {...sortProps} />
                    <th aria-label="İşlemler" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td className="min-w-56">
                        <div className="flex items-center gap-3">
                          <ProductThumb path={p.image_path} size="md" />
                          <div className="min-w-0">
                            <Link href={`/urunler/${p.id}`} className="link">
                              {p.name}
                            </Link>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                              <span className="code text-ink-muted">{p.code}</span>
                              {!p.is_active ? <Badge>Pasif</Badge> : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="w-44 max-w-44 min-w-36">
                        <div className="font-semibold text-ink tabular-nums">{fmtInt(p.variant_count)}</div>
                        <div className="line-clamp-2 text-xs text-ink-muted" title={p.variant_codes ?? undefined}>
                          {p.variant_codes}
                        </div>
                        {p.no_bom_variant_count > 0 ? (
                          <div className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-700">
                            <AlertTriangle className="size-3.5" aria-hidden />
                            {fmtInt(p.no_bom_variant_count)} reçetesiz
                          </div>
                        ) : null}
                      </td>
                      <td className="num">
                        <dl className="ml-auto grid w-max grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-right">
                          <dt className="text-[11px] text-ink-muted">Son parti</dt>
                          <dd className="font-medium text-ink">{fmtCostRange(p.last_cost_usd_min, p.last_cost_usd_max, "USD")}</dd>
                          <dt className="text-[11px] text-ink-muted">Tahmini reçete</dt>
                          <dd>{fmtCostRange(p.est_cost_usd_min, p.est_cost_usd_max, "USD")}</dd>
                        </dl>
                      </td>
                      <td className="num">
                        {fmtMoney(p.default_sale_price, p.default_currency)}
                        {p.price_override_count > 0 ? (
                          <div className="text-xs text-ink-muted">{fmtInt(p.price_override_count)} varyantta özel</div>
                        ) : null}
                      </td>
                      <td className="num">
                        {fmtMinutes(p.unit_production_minutes)}
                        {p.minutes_override_count > 0 ? (
                          <div className="text-xs text-ink-muted">{fmtInt(p.minutes_override_count)} varyantta özel</div>
                        ) : null}
                      </td>
                      <td className="num">
                        <span className="font-semibold text-ink">{fmtInt(p.total_remaining)}</span>
                        <div className="text-[11px] leading-4 text-ink-muted">Heatemp {fmtInt(p.heatemp_qty)}</div>
                        <div className="text-[11px] leading-4 text-ink-muted">Mekonsis {fmtInt(p.mekonsis_qty)}</div>
                      </td>
                      <td className="whitespace-nowrap">
                        {p.worst_stock_status ? (
                          <>
                            <StockStatusBadge
                              row={{
                                stock_status: p.worst_stock_status,
                                total_remaining: p.worst_total_remaining ?? 0,
                                critical_stock: p.worst_critical_stock ?? 0,
                                min_stock: p.worst_min_stock ?? 0,
                                target_stock: p.worst_target_stock ?? 0,
                              }}
                            />
                            {p.active_variant_count > 1 ? (
                              <div className="mt-0.5 text-xs text-ink-muted">
                                {fmtInt(statusCount(p))}/{fmtInt(p.active_variant_count)} varyant
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-xs text-ink-muted">Aktif varyant yok</span>
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <RowActions id={p.id} name={p.name} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>

            {/* Tablet ve mobil: kart listesi */}
            <ul className="-mb-px grid grid-cols-1 sm:grid-cols-2 xl:hidden">
              {rows.map((p) => (
                <li key={p.id} className="min-w-0 border-b border-line px-4 py-3.5 sm:odd:border-r">
                  <div className="flex items-start gap-3">
                    <ProductThumb path={p.image_path} size="md" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/urunler/${p.id}`} className="link break-words">
                        {p.name}
                      </Link>
                      <div className="code mt-0.5 text-ink-muted">{p.code}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {p.worst_stock_status ? (
                          <StockStatusBadge
                            row={{
                              stock_status: p.worst_stock_status,
                              total_remaining: p.worst_total_remaining ?? 0,
                              critical_stock: p.worst_critical_stock ?? 0,
                              min_stock: p.worst_min_stock ?? 0,
                              target_stock: p.worst_target_stock ?? 0,
                            }}
                          />
                        ) : null}
                        {p.is_active ? <Badge tone="green">Aktif</Badge> : <Badge>Pasif</Badge>}
                        {p.no_bom_variant_count > 0 ? (
                          <Badge tone="amber" icon={AlertTriangle}>
                            {fmtInt(p.no_bom_variant_count)} reçetesiz
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="-mt-1 -mr-2 shrink-0">
                      <RowActions id={p.id} name={p.name} />
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2.5 text-[13px]">
                    <div className="min-w-0">
                      <dt className="text-xs text-ink-muted">Stok</dt>
                      <dd className="font-semibold text-ink tabular-nums">{fmtInt(p.total_remaining)} adet</dd>
                      <dd className="text-[11px] text-ink-muted tabular-nums">
                        <abbr title="Heatemp rafı" className="no-underline">H</abbr> {fmtInt(p.heatemp_qty)} · <abbr title="Mekonsis rafı" className="no-underline">M</abbr> {fmtInt(p.mekonsis_qty)}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-ink-muted">Satış fiyatı</dt>
                      <dd className="tabular-nums">{fmtMoney(p.default_sale_price, p.default_currency)}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-ink-muted">Birim süre</dt>
                      <dd className="tabular-nums">{fmtMinutes(p.unit_production_minutes)}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-ink-muted">Varyant</dt>
                      <dd className="tabular-nums">{fmtInt(p.variant_count)}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-ink-muted">Son parti</dt>
                      <dd className="tabular-nums">{fmtCostRange(p.last_cost_usd_min, p.last_cost_usd_max, "USD")}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-ink-muted">Tahmini reçete</dt>
                      <dd className="tabular-nums">{fmtCostRange(p.est_cost_usd_min, p.est_cost_usd_max, "USD")}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
        {res.count ? <Pagination basePath={BASE} values={v} page={lp.page} pageSize={lp.pageSize} total={res.count} noun="ürün" /> : null}
      </Card>
    </>
  );
}

/** Satır işlemleri: ilgili sekmelere kısayollar. */
function RowActions({ id, name }: { id: string; name: string }) {
  const icon = "size-8 px-0";
  return (
    <div className="inline-flex items-center gap-0.5">
      <Link href={`/urunler/${id}?sekme=bom`} className={buttonClass("ghost", "sm") + ` ${icon}`} title="BOM / reçete" aria-label={`${name}: BOM / reçete`}>
        <ListTree aria-hidden />
      </Link>
      <Link href={`/urunler/${id}?sekme=stok`} className={buttonClass("ghost", "sm") + ` ${icon}`} title="Stok ve hareketler" aria-label={`${name}: stok ve hareketler`}>
        <Warehouse aria-hidden />
      </Link>
    </div>
  );
}
