import { Ban, BarChart3, CheckCircle2, Clock, Coins, Factory, Hourglass, Layers, PackageOpen, Plus, TriangleAlert, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  MetricRow,
  PageHeader,
  ProgressBar,
  StatCard,
  TableWrap,
  cx,
} from "@/components/ui";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { LinkSegmented, LinkTabs, Pagination, SortTh } from "@/components/ui/list";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtInt, fmtMinutes, fmtMoney, fmtUnitMoney, pctChange, todayTr } from "@/lib/format";
import { hrefWith, isoDateOrNull, parseListParams, searchPattern, type SearchParams } from "@/lib/list-params";
import { isUuid } from "@/lib/parse";
import { addDays, buckets } from "@/lib/period";
import { load } from "@/lib/query";
import type { BatchView } from "@/lib/types";
import { MonthlyProductionChart } from "./_components/ProductionCharts";
import type {
  BatchListRow,
  BatchSummary,
  MonthlyProductionPoint,
  ProductionByVariantRow,
  ProductionMonthRow,
} from "./_components/types";
import { BatchStatusBadge, CostChange } from "./StatusBadge";

export const metadata: Metadata = { title: "Üretim Partileri" };

const BASE = "/uretim";
const SORTABLE = ["batch_no", "product_name", "quantity", "started_at", "unit_cost_try", "total_cost_try", "heatemp_remaining"];
const STATUS_KEYS = ["in_production", "completed", "cancelled", "opening"] as const;
type StatusKey = (typeof STATUS_KEYS)[number];
/** Açılış partisinde "başlama" = stok (açılış) tarihi; liste bu sütunla filtrelenir ve sıralanır. */
const DATE_COLUMN = "list_started_at";
const WIP_LIMIT = 3;

type WipRow = Pick<
  BatchView,
  "id" | "batch_no" | "display_name" | "quantity" | "started_at" | "estimated_minutes" | "elapsed_minutes" | "total_cost_try"
>;

export default async function BatchesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireMember();
  const isAdmin = ctx.role === "admin";
  const lp = parseListParams(await searchParams, { sortable: SORTABLE, defaultSort: "started_at" });
  const values = lp.values;
  const durum = (STATUS_KEYS as readonly string[]).includes(values.durum ?? "") ? (values.durum as StatusKey) : null;
  const today = todayTr();
  const monthFrom = `${addDays(`${today.slice(0, 7)}-15`, -335).slice(0, 7)}-01`;
  const thisMonth = today.slice(0, 7);
  const prevMonthEnd = addDays(`${thisMonth}-01`, -1);
  const prevMonth = prevMonthEnd.slice(0, 7);
  // "Bu ay tamamlanan" karşılaştırması: geçen ayın AYNI günleriyle (1 … bugünün günü; kısa ayda ay sonu).
  const prevSameFrom = `${prevMonth}-01`;
  const prevSameTo = `${prevMonth}-${String(Math.min(Number(today.slice(8, 10)), Number(prevMonthEnd.slice(8, 10)))).padStart(2, "0")}`;

  // Liste: sunucu tarafı arama, filtre, sıralama ve sayfalama
  const pattern = searchPattern(lp.q);
  const from = isoDateOrNull(values.bas);
  const to = isoDateOrNull(values.bit);
  const filtered = (head = false) => {
    let q = ctx.supabase.from("v_batch_list").select("*", { count: "exact", head });
    if (pattern) {
      q = q.or(`batch_no.ilike.${pattern},display_name.ilike.${pattern},product_code.ilike.${pattern},variant_code.ilike.${pattern}`);
    }
    if (durum === "in_production") q = q.eq("status", "in_production");
    else if (durum === "completed") q = q.eq("status", "completed").eq("kind", "production");
    else if (durum === "cancelled") q = q.eq("status", "cancelled");
    else if (durum === "opening") q = q.eq("kind", "opening");
    if (isUuid(values.urun)) q = q.eq("product_id", values.urun);
    // Türkiye saati (UTC+3) gün sınırları; açılış partilerinde stok (açılış) tarihi
    if (from) q = q.gte(DATE_COLUMN, `${from}T00:00:00+03:00`);
    if (to) q = q.lt(DATE_COLUMN, `${addDays(to, 1)}T00:00:00+03:00`);
    return q;
  };

  const sortColumn = !lp.sort || lp.sort === "started_at" ? DATE_COLUMN : lp.sort;
  const [res, summaryRes, monthlyRes, byVariantRes, productsRes, prevSameRes, wipRes] = await Promise.all([
    load(
      filtered()
        .order(sortColumn, { ascending: lp.dir === "asc", nullsFirst: false })
        .order("batch_no", { ascending: false })
        .range(lp.from, lp.to)
        .returns<BatchListRow[]>(),
    ),
    load(ctx.supabase.from("v_batch_summary").select("*").single<BatchSummary>()),
    load<ProductionMonthRow[]>(ctx.supabase.rpc("production_monthly", { p_from: monthFrom })),
    load<ProductionByVariantRow[]>(ctx.supabase.rpc("production_by_variant", { p_from: monthFrom, p_to: today })),
    load(ctx.supabase.from("products").select("id, name").order("name").returns<{ id: string; name: string }[]>()),
    load<ProductionByVariantRow[]>(ctx.supabase.rpc("production_by_variant", { p_from: prevSameFrom, p_to: prevSameTo })),
    load(
      ctx.supabase
        .from("v_batches")
        .select("id, batch_no, display_name, quantity, started_at, estimated_minutes, elapsed_minutes, total_cost_try")
        .eq("status", "in_production")
        .order("started_at")
        .limit(WIP_LIMIT)
        .returns<WipRow[]>(),
    ),
  ]);

  // Sayfa numarası sonuç sayısını aşıyorsa (ör. filtre değişti) son sayfaya yönlendir.
  if (res.error && lp.page > 1) {
    const c = await load(filtered(true));
    if (!c.error && c.count !== null) {
      const last = Math.max(1, Math.ceil(c.count / lp.pageSize));
      if (last < lp.page) redirect(hrefWith(BASE, values, { sayfa: last === 1 ? null : last }));
    }
  }

  const summary = summaryRes.data;
  const months = monthlyRes.data ?? [];
  const monthRow = (m: string) => months.find((r) => r.month_start.slice(0, 7) === m);
  const cur = monthRow(thisMonth);
  // Geçen ayın aynı günlerinde tamamlanan adet (hata varsa karşılaştırma gösterilmez, 0 sayılmaz)
  const prevSameQty = prevSameRes.error ? null : (prevSameRes.data ?? []).reduce((a, r) => a + Number(r.quantity), 0);
  const prevSameLabel = `${fmtDate(prevSameFrom).slice(0, 2)}–${fmtDate(prevSameTo).slice(0, 5)}`;
  const points: MonthlyProductionPoint[] = buckets(monthFrom, today, "aylik").map((month) => {
    const r = monthRow(month);
    return {
      month,
      startedQty: Number(r?.started_qty ?? 0),
      startedBatches: Number(r?.started_batches ?? 0),
      completedQty: Number(r?.completed_qty ?? 0),
      completedBatches: Number(r?.completed_batches ?? 0),
      costTry: Number(r?.completed_cost_try ?? 0),
      costUsd: Number(r?.completed_cost_usd ?? 0),
      cancelledBatches: Number(r?.cancelled_batches ?? 0),
    };
  });
  const year = months.reduce(
    (a, r) => ({
      started: a.started + Number(r.started_batches),
      qty: a.qty + Number(r.completed_qty),
      batches: a.batches + Number(r.completed_batches),
      costTry: a.costTry + Number(r.completed_cost_try),
      costUsd: a.costUsd + Number(r.completed_cost_usd),
      est: a.est + Number(r.completed_estimated_minutes),
      act: a.act + Number(r.completed_actual_minutes),
      cancelled: a.cancelled + Number(r.cancelled_batches),
    }),
    { started: 0, qty: 0, batches: 0, costTry: 0, costUsd: 0, est: 0, act: 0, cancelled: 0 },
  );

  const rows = res.data ?? [];
  const sortProps = { sort: lp.sort, dir: lp.dir, basePath: BASE, values };
  const otherFilters = ["q", "urun", "bas", "bit"].some((k) => values[k]);
  const counts: Record<string, number | null> = summary
    ? {
        "": summary.all_batches,
        in_production: summary.in_production_batches,
        completed: summary.completed_batches,
        cancelled: summary.cancelled_batches,
        opening: summary.opening_batches,
      }
    : {};
  const tabs = [
    { key: "", label: "Tümü" },
    { key: "in_production", label: "Üretimde" },
    { key: "completed", label: "Tamamlandı" },
    { key: "cancelled", label: "İptal" },
    { key: "opening", label: "Açılış stoğu" },
  ].map((t) => ({
    ...t,
    href: hrefWith(BASE, values, { durum: t.key || null, sayfa: null }),
    count: otherFilters ? null : (counts[t.key] ?? null),
  }));

  return (
    <>
      <PageHeader
        title="Üretim partileri"
        description="Her üretim bir partidir. Başlatınca malzeme tüketilir ve maliyet partiye sabitlenir; tamamlayınca mamul Heatemp rafına girer. Açılış stoğu partileri üretim sayılmaz."
        actions={
          isAdmin ? (
            <ButtonLink href="/simulasyon">
              <Plus aria-hidden />
              Yeni üretim
            </ButtonLink>
          ) : (
            <ButtonLink href="/simulasyon" variant="secondary">
              Simülasyon
            </ButtonLink>
          )
        }
      />

      {/* Her kart kendi kaynağının hatasını gösterir: biri hata verirse diğerleri yine görünür. */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {summary ? (
          <StatCard
            label="Üretimde"
            scope="Güncel"
            value={fmtInt(summary.in_production_batches)}
            unit="parti"
            icon={Hourglass}
            tone="amber"
            href="/uretim?durum=in_production"
            description={
              summary.in_production_batches > 0
                ? `${fmtInt(summary.in_production_qty)} adet · bağlı malzeme ${fmtMoney(summary.wip_value_try, "TRY")}`
                : "Devam eden üretim yok"
            }
          />
        ) : (
          <StatError label="Üretimde" message={summaryRes.error ?? "Özet okunamadı."} />
        )}
        {monthlyRes.error ? (
          <StatError label="Bu ay tamamlanan" message={monthlyRes.error} />
        ) : (
          <StatCard
            label="Bu ay tamamlanan"
            scope="Bu ay"
            value={fmtInt(cur?.completed_qty ?? 0)}
            unit="adet"
            icon={CheckCircle2}
            tone="teal"
            delta={
              prevSameQty
                ? { pct: pctChange(cur?.completed_qty ?? 0, prevSameQty), label: `geçen ayın aynı günlerine göre (${prevSameLabel})` }
                : undefined
            }
            description={
              <>
                {fmtInt(cur?.completed_batches ?? 0)} parti · maliyet {fmtMoney(cur?.completed_cost_try ?? 0, "TRY")}
                {prevSameQty === null ? (
                  <span className="block">Geçen ay karşılaştırması okunamadı</span>
                ) : prevSameQty === 0 ? (
                  <span className="block">Geçen ayın aynı günlerinde ({prevSameLabel}) tamamlanan yok</span>
                ) : null}
              </>
            }
          />
        )}
        {monthlyRes.error ? (
          <StatError label="Ort. birim maliyet" message={monthlyRes.error} />
        ) : (
          <StatCard
            label="Ort. birim maliyet"
            scope="Son 12 ay"
            value={year.qty > 0 ? fmtMoney(year.costTry / year.qty, "TRY") : "—"}
            icon={Coins}
            tone="blue"
            description={
              year.qty > 0
                ? `${fmtMoney(year.costUsd / year.qty, "USD")} · ${fmtInt(year.qty)} adet üzerinden ağırlıklı`
                : "Son 12 ayda tamamlanan üretim yok"
            }
          />
        )}
        {summary ? (
          <StatCard
            label="Açılış stoğu"
            scope="Sistem öncesi"
            value={fmtInt(summary.opening_qty)}
            unit="adet"
            icon={PackageOpen}
            tone="violet"
            href="/uretim?durum=opening"
            description={`${fmtInt(summary.opening_batches)} parti · açılış değeri ${fmtMoney(summary.opening_value_try, "TRY")} · üretim sayılmaz`}
          />
        ) : (
          <StatError label="Açılış stoğu" message={summaryRes.error ?? "Özet okunamadı."} />
        )}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Card title="Aylık üretim" description="Son 12 ay · yalnız üretim partileri (açılış stoğu hariç)" icon={BarChart3} padded={false}>
          {monthlyRes.error ? (
            <ErrorState message={monthlyRes.error} compact />
          ) : (
            <div className="flex h-full flex-col">
              <div className="p-4">
                <MonthlyProductionChart data={points} />
              </div>
              {/* Sağ sütun daha uzunsa özet satırı kartın dibine yaslanır. */}
              <div className="mt-auto border-t border-line">
                <MetricRow
                  items={[
                    {
                      label: "Başlatılan",
                      value: `${fmtInt(year.started)} parti`,
                      hint: year.cancelled ? `${fmtInt(year.cancelled)} iptal` : "iptal yok",
                    },
                    { label: "Tamamlanan", value: `${fmtInt(year.qty)} adet`, hint: `${fmtInt(year.batches)} parti` },
                    { label: "Üretim maliyeti", value: fmtMoney(year.costTry, "TRY"), hint: fmtMoney(year.costUsd, "USD") },
                    {
                      label: "Süre (gerçek / tahmini)",
                      value: year.batches > 0 ? fmtMinutes(year.act) : "—",
                      hint:
                        year.batches === 0
                          ? "tamamlanan parti yok"
                          : year.est > 0
                            ? `tahmini ${fmtMinutes(year.est)}`
                            : "tahmini süre tanımlı değil",
                    },
                  ]}
                />
              </div>
            </div>
          )}
        </Card>
        {/* Sağ sütun: masaüstünde "Aylık üretim" kartı yüksekliğine uzar; boşluk son kartın içinde kalır. */}
        <div className="grid min-w-0 content-start gap-4 md:grid-cols-2 xl:flex xl:flex-col">
          <Card title="En çok üretilen" description="Son 12 ay · tamamlanan üretim partileri" icon={Trophy} padded={false}>
            {byVariantRes.error ? <ErrorState message={byVariantRes.error} compact /> : <TopProducedList rows={byVariantRes.data ?? []} />}
          </Card>
          <Card title="Parti durumları" description="Tüm partiler · sayı" icon={Layers}>
            {summaryRes.error ? (
              <ErrorState message={summaryRes.error} compact />
            ) : summary ? (
              <StatusDistribution summary={summary} />
            ) : null}
          </Card>
          <Card
            title="Üretimdeki partiler"
            description="Devam eden partiler · en eski önce"
            icon={Hourglass}
            padded={false}
            className="md:col-span-2 xl:flex-1"
          >
            {wipRes.error ? (
              <ErrorState message={wipRes.error} compact />
            ) : (
              <WipList rows={wipRes.data ?? []} total={summary?.in_production_batches ?? null} isAdmin={isAdmin} />
            )}
          </Card>
        </div>
      </div>

      <Card padded={false}>
        {/* Masaüstü/tablet: sekmeler. Mobilde 5 sekme sığmadığı için satırlara kırılan segment düğmeleri. */}
        <div className="hidden px-2 sm:block">
          <LinkTabs tabs={tabs} active={durum ?? ""} />
        </div>
        <nav aria-label="Durum filtresi" className="border-b border-line px-3 py-2.5 sm:hidden">
          <LinkSegmented
            active={durum ?? ""}
            items={tabs.map((t) => ({
              key: t.key,
              href: t.href,
              label: (
                <>
                  {t.label}
                  {t.count !== null ? <span className="ml-1 text-ink-muted tabular-nums">{fmtInt(t.count)}</span> : null}
                </>
              ),
            }))}
          />
        </nav>
        <ListToolbar
          basePath={BASE}
          values={values}
          total={res.error ? null : res.count}
          noun="parti"
          search={{ placeholder: "Parti no, ürün veya kod ara…" }}
          filters={
            productsRes.data
              ? [
                  {
                    key: "urun",
                    label: "Ürün",
                    allLabel: "Ürün: tümü",
                    options: productsRes.data.map((p) => ({ value: p.id, label: p.name })),
                  },
                ]
              : []
          }
          dateRange={{ label: "Başlama / açılış" }}
        >
          {productsRes.error ? (
            <span className="flex items-center gap-1 text-xs text-ink-soft" role="status" title={productsRes.error}>
              <TriangleAlert className="size-3.5 shrink-0 text-chart-amber" aria-hidden />
              Ürün filtresi yüklenemedi
            </span>
          ) : null}
        </ListToolbar>
        {durum === "opening" ? (
          <div className="border-b border-line px-4 py-3">
            <Alert tone="info">
              Açılış stoğu partileri sistem öncesi mevcut mamuldür; hammadde tüketmez, süre ve maliyet karşılaştırmasına girmez, üretilen
              adet ve üretim harcamasına dahil edilmez.
            </Alert>
          </div>
        ) : null}
        {res.error ? (
          <ErrorState message={res.error} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={
              Object.keys(values).some((k) => !["sayfa", "adet", "sirala", "yon"].includes(k))
                ? "Filtreye uyan parti yok"
                : "Henüz parti yok"
            }
            icon={Factory}
            action={
              isAdmin ? (
                <ButtonLink href="/simulasyon" size="sm" variant="secondary">
                  Simülasyondan üretim başlat
                </ButtonLink>
              ) : undefined
            }
          >
            Üretim, simülasyon ekranından başlatılır.
          </EmptyState>
        ) : (
          <TableWrap>
            <table className="table-base table-compact">
              <thead>
                <tr>
                  <SortTh label="Parti / durum" column="batch_no" {...sortProps} />
                  <SortTh label="Ürün / varyant" column="product_name" {...sortProps} />
                  <SortTh label="Adet" column="quantity" align="right" {...sortProps} />
                  <SortTh
                    label="Başlama / bitiş"
                    column="started_at"
                    {...sortProps}
                    title="Başlama ve bitiş (veya iptal) zamanı; açılış stoğunda stok (açılış) tarihi"
                  />
                  <th className="num" title="Tahmini süre / gerçekleşen (veya geçen) süre">
                    Süre
                  </th>
                  <SortTh
                    label={<span className="w-min text-right whitespace-normal">Birim maliyet</span>}
                    column="unit_cost_try"
                    align="right"
                    {...sortProps}
                    title="TL (kayıt değeri); USD bilgi"
                  />
                  <SortTh
                    label={<span className="w-min text-right whitespace-normal">Toplam maliyet</span>}
                    column="total_cost_try"
                    align="right"
                    {...sortProps}
                    title="TL (kayıt değeri); USD bilgi"
                  />
                  <SortTh
                    label={<span className="w-min text-right whitespace-normal">Heatemp&apos;te kalan</span>}
                    column="heatemp_remaining"
                    align="right"
                    {...sortProps}
                    title="Heatemp rafında kalan adet"
                  />
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <BatchRow key={b.id} b={b} />
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        {res.count ? (
          <Pagination basePath={BASE} values={values} page={lp.page} pageSize={lp.pageSize} total={res.count} noun="parti" />
        ) : null}
      </Card>
    </>
  );
}

function BatchRow({ b }: { b: BatchListRow }) {
  const opening = b.kind === "opening";
  return (
    <tr>
      <td className="whitespace-nowrap">
        <Link href={`/uretim/${b.id}`} className="link font-mono text-xs">
          {b.batch_no}
        </Link>
        <div className="mt-1">
          <BatchStatusBadge status={b.status} kind={b.kind} />
        </div>
      </td>
      <td className="min-w-36 sm:min-w-48">
        <div className="font-medium text-ink">{b.product_name}</div>
        <div className="text-xs text-ink-muted" title={`Varyant kodu: ${b.variant_code}`}>
          {b.variant_name}
        </div>
        {/* Dar ekranda maliyet sütunları kaydırma dışında kalır; toplam maliyet ürün adının altında da görünür. */}
        <div className="mt-1 text-xs whitespace-nowrap text-ink-soft tabular-nums sm:hidden">Toplam {fmtMoney(b.total_cost_try, "TRY")}</div>
      </td>
      <td className="num font-medium">{fmtInt(b.quantity)}</td>
      <td className="text-xs whitespace-nowrap tabular-nums">
        {opening ? (
          <>
            <div className="text-ink-soft">Açılış {fmtDate(b.opening_date)}</div>
            <div className="text-ink-muted" title="Açılış kaydının sisteme girildiği zaman">
              Kayıt {fmtDateTime(b.started_at)}
            </div>
          </>
        ) : (
          <>
            <div className="text-ink-soft">{fmtDateTime(b.started_at)}</div>
            <div className="text-ink-muted">
              {b.status === "completed"
                ? `Bitiş ${fmtDateTime(b.completed_at)}`
                : b.status === "cancelled"
                  ? `İptal ${fmtDateTime(b.cancelled_at)}`
                  : "Devam ediyor"}
            </div>
          </>
        )}
      </td>
      <td className="num text-xs">
        {opening ? (
          <span className="text-ink-muted">Üretim sayılmaz</span>
        ) : (
          <>
            <div className="text-ink-soft">
              {Number(b.estimated_minutes) > 0 ? (
                <>
                  {fmtMinutes(b.estimated_minutes)} <span className="text-ink-muted">tahmini</span>
                </>
              ) : (
                <span className="text-ink-muted">Süre tanımlı değil</span>
              )}
            </div>
            <div className="text-ink-muted">
              {b.status === "completed"
                ? `${fmtMinutes(b.actual_minutes)} gerçek`
                : b.status === "in_production"
                  ? `${fmtMinutes(b.elapsed_minutes)} geçti`
                  : "—"}
            </div>
          </>
        )}
      </td>
      <td className="num relative" title={`${fmtUnitMoney(b.unit_cost_try, "TRY")} · ${fmtUnitMoney(b.unit_cost_usd, "USD")}`}>
        {fmtMoney(b.unit_cost_try, "TRY")}
        <div className="flex items-center justify-end gap-1.5 text-xs text-ink-muted">
          {fmtMoney(b.unit_cost_usd, "USD")}
          {!opening && b.status === "completed" && b.unit_cost_usd_change_pct !== null ? (
            <CostChange pct={b.unit_cost_usd_change_pct} prev={b.prev_batch_no} />
          ) : null}
        </div>
      </td>
      <td className="num">
        {fmtMoney(b.total_cost_try, "TRY")}
        <div className="text-xs text-ink-muted">{fmtMoney(b.total_cost_usd, "USD")}</div>
      </td>
      <td className="num">{b.heatemp_remaining !== null ? fmtInt(b.heatemp_remaining) : <span className="text-ink-muted">—</span>}</td>
    </tr>
  );
}

function TopProducedList({ rows }: { rows: ProductionByVariantRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState title="Tamamlanan üretim yok" icon={Factory} compact>
        Son 12 ayda tamamlanan üretim partisi yok. Açılış stoğu üretim sayılmaz.
      </EmptyState>
    );
  }
  const top = rows.slice(0, 6);
  const max = Math.max(...top.map((r) => Number(r.quantity)));
  return (
    <ol className="divide-y divide-line">
      {top.map((r, i) => (
        <li key={r.variant_id} className="flex items-start gap-3 px-4 py-2.5">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded bg-canvas text-xs font-semibold text-ink-muted tabular-nums">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/urunler/${r.product_id}/varyant/${r.variant_id}`} className="link min-w-0 text-[13px] break-words">
                {r.display_name}
              </Link>
              <span className="shrink-0 text-[13px] font-semibold text-ink tabular-nums">{fmtInt(r.quantity)} adet</span>
            </div>
            <div className="mt-1.5">
              <ProgressBar value={Number(r.quantity)} max={max} tone="teal" label={`${r.display_name}: ${fmtInt(r.quantity)} adet`} />
            </div>
            <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-ink-muted tabular-nums">
              <span>{fmtInt(r.batches)} parti</span>
              <span>
                {fmtMoney(r.cost_try, "TRY")} · {fmtMoney(r.cost_usd, "USD")}
              </span>
            </div>
          </div>
        </li>
      ))}
      {rows.length > top.length ? (
        <li className="px-4 py-2 text-xs text-ink-muted">ve {fmtInt(rows.length - top.length)} varyant daha</li>
      ) : null}
    </ol>
  );
}

function WipList({ rows, total, isAdmin }: { rows: WipRow[]; total: number | null; isAdmin: boolean }) {
  if (rows.length === 0) {
    // Kısa boş durum: sağ sütunda yer kaplamaz; kart kalan yüksekliği doldurur.
    return (
      <div className="flex h-full flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
        <p className="text-[13px] text-ink-muted">Devam eden üretim yok. Üretim, simülasyon ekranından başlatılır.</p>
        {isAdmin ? (
          <ButtonLink href="/simulasyon" size="sm" variant="secondary">
            <Plus aria-hidden />
            Yeni üretim
          </ButtonLink>
        ) : null}
      </div>
    );
  }
  const more = total !== null ? total - rows.length : 0;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => {
        const est = Number(r.estimated_minutes);
        const over = est > 0 && Number(r.elapsed_minutes) > est;
        return (
          <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <Link href={`/uretim/${r.id}`} className="link font-mono text-xs">
                {r.batch_no}
              </Link>
              <div className="text-[13px] break-words text-ink-soft">
                {r.display_name} <span className="text-xs whitespace-nowrap text-ink-muted tabular-nums">· {fmtInt(r.quantity)} adet</span>
              </div>
            </div>
            <div className="shrink-0 text-right text-xs tabular-nums">
              <div className="font-medium text-ink" title={`Başlama ${fmtDateTime(r.started_at)}`}>
                {fmtMinutes(r.elapsed_minutes)} geçti
              </div>
              <div className="mt-0.5">
                {est > 0 ? (
                  over ? (
                    <Badge tone="red" icon={Clock}>
                      Tahmini aştı
                    </Badge>
                  ) : (
                    <span className="text-ink-muted">tahmini {fmtMinutes(est)}</span>
                  )
                ) : (
                  <span className="text-ink-muted">süre tanımlı değil</span>
                )}
              </div>
            </div>
          </li>
        );
      })}
      {more > 0 ? (
        <li className="px-4 py-2 text-xs">
          <Link href="/uretim?durum=in_production" className="link">
            ve {fmtInt(more)} parti daha
          </Link>
        </li>
      ) : null}
    </ul>
  );
}

const STATUS_PARTS = [
  { key: "in_production", label: "Üretimde", icon: Hourglass, bar: "bg-chart-amber", iconColor: "text-chart-amber" },
  { key: "completed", label: "Tamamlandı", icon: CheckCircle2, bar: "bg-chart-teal", iconColor: "text-chart-teal" },
  { key: "cancelled", label: "İptal", icon: Ban, bar: "bg-chart-slate", iconColor: "text-chart-slate" },
  { key: "opening", label: "Açılış stoğu", icon: PackageOpen, bar: "bg-chart-violet", iconColor: "text-chart-violet" },
] as const;

function StatusDistribution({ summary }: { summary: BatchSummary }) {
  const count: Record<(typeof STATUS_PARTS)[number]["key"], number> = {
    in_production: summary.in_production_batches,
    completed: summary.completed_batches,
    cancelled: summary.cancelled_batches,
    opening: summary.opening_batches,
  };
  const total = summary.all_batches;
  if (total === 0) return <EmptyState title="Henüz parti yok" icon={Factory} compact />;
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-canvas" role="img" aria-label="Partilerin durumlara göre dağılımı">
        {STATUS_PARTS.filter((p) => count[p.key] > 0).map((p) => (
          <div key={p.key} className={cx("h-full", p.bar)} style={{ width: `${(count[p.key] / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-2">
        {STATUS_PARTS.map((p) => (
          <li key={p.key}>
            <Link
              href={`/uretim?durum=${p.key}`}
              className="flex items-center justify-between gap-2 rounded-md border border-line px-2.5 py-2 text-xs hover:bg-canvas"
            >
              <span className="flex min-w-0 items-center gap-1.5 font-medium text-ink-soft">
                <p.icon className={cx("size-3.5 shrink-0", p.iconColor)} aria-hidden />
                <span>{p.label}</span>
              </span>
              <span className="font-semibold text-ink tabular-nums">{fmtInt(count[p.key])}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Özet kartı yerine: yalnız bu kartın kaynağı okunamadı (diğer kartlar etkilenmez). */
function StatError({ label, message }: { label: string; message: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</p>
      <ErrorState message={message} compact title="Yüklenemedi" />
    </div>
  );
}
