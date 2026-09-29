import {
  AlertOctagon,
  ArrowLeftRight,
  ArrowRight,
  Calculator,
  CheckCircle2,
  ClipboardList,
  Clock,
  Coins,
  Layers,
  PieChart,
  Play,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { fxSourceLabel } from "@/components/FxBadge";
import { Alert, Badge, ButtonLink, Card, EmptyState, ErrorState, PageHeader, TableWrap, cx } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { suggestFx, type FxSuggestion } from "@/lib/fx/service";
import { fmtDate, fmtInt, fmtMinutes, fmtMoney, fmtNum, fmtQty, fmtRate, fmtUnitMoney, todayTr } from "@/lib/format";
import { first, type SearchParams } from "@/lib/list-params";
import { isUuid } from "@/lib/parse";
import { load } from "@/lib/query";
import type { Simulation, SimulationLine } from "@/lib/types";
import { BottleneckChart, CostShareDonut } from "./_components/SimulationCharts";
import { SimulationPicker, type PickerVariant } from "./Picker";
import { StartProductionForm } from "./StartForm";

export const metadata: Metadata = { title: "Üretim Simülasyonu" };

const MAX_QTY = 1_000_000;

interface RecipeRow {
  variant_id: string;
  bom_line_count: number;
  cost_complete: boolean;
  est_unit_cost_try: number | null;
  est_unit_cost_usd: number | null;
}

export default async function SimulationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ctx = await requireMember();
  const isAdmin = ctx.role === "admin";
  const rawVariant = first(sp.varyant);
  const variantId = isUuid(rawVariant) ? rawVariant : null;
  const rawQty = first(sp.adet);
  const parsedQty = Math.floor(Number(rawQty));
  const qty = Number.isFinite(parsedQty) && parsedQty >= 1 ? Math.min(MAX_QTY, parsedQty) : 1;
  // URL'deki adet değiştirildiyse (üst sınır veya geçersiz değer) sessizce değil, açıkça bildirilir.
  const qtyNote =
    rawQty === ""
      ? null
      : Number.isFinite(parsedQty) && parsedQty > MAX_QTY
        ? `İstenen adet (${fmtInt(parsedQty)}) üst sınırı aşıyor; hesap en fazla ${fmtInt(MAX_QTY)} adet için yapıldı.`
        : !Number.isFinite(parsedQty) || parsedQty < 1
          ? `Adresteki adet (“${rawQty.slice(0, 20)}”) geçersiz; hesap 1 adet için yapıldı.`
          : null;
  const today = todayTr();

  const [variantsRes, recipeRes, simRes, fxRes] = await Promise.all([
    load(
      ctx.supabase
        .from("v_variants")
        .select("id, product_id, product_name, variant_name, is_active")
        .order("product_name")
        .order("variant_name")
        .returns<Omit<PickerVariant, "bom_lines">[]>(),
    ),
    load(
      ctx.supabase
        .from("v_variant_recipe_cost")
        .select("variant_id, bom_line_count, cost_complete, est_unit_cost_try, est_unit_cost_usd")
        .returns<RecipeRow[]>(),
    ),
    variantId ? load<Simulation>(ctx.supabase.rpc("simulate_production", { p_variant_id: variantId, p_quantity: qty })) : null,
    suggestFx(ctx, today).then(
      (s): { fx: FxSuggestion | null; error: string | null } => ({ fx: s, error: null }),
      (e: unknown) => ({ fx: null, error: e instanceof Error ? e.message : String(e) }),
    ),
  ]);

  const recipeByVariant = new Map((recipeRes.data ?? []).map((r) => [r.variant_id, r]));
  const variants: PickerVariant[] = (variantsRes.data ?? []).map((v) => ({
    ...v,
    bom_lines: recipeRes.error ? null : (recipeByVariant.get(v.id)?.bom_line_count ?? 0),
  }));
  const selected = variants.find((v) => v.id === variantId) ?? null;
  const sim = simRes?.data ?? null;

  return (
    <>
      <PageHeader
        title="Üretim simülasyonu"
        description="Simülasyon stok düşürmez. Seçilen adet için gereken, mevcut ve eksik malzemeyi, stokla en fazla kaç adet yapılabileceğini, tahmini maliyeti ve süreyi gösterir. Stok yeterliyse üretimi buradan başlatabilirsiniz."
        actions={
          <ButtonLink href="/uretim" variant="secondary">
            <Layers aria-hidden />
            Üretim partileri
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:grid-rows-[auto_auto_1fr_auto]">
        {/* 1 · Seçim formu */}
        <Card
          title="Ürün, varyant ve adet"
          description="Seçimi değiştirip “Hesapla”ya basın; sonuç bağlantı olarak paylaşılabilir."
          icon={SlidersHorizontal}
          className="xl:col-start-1 xl:row-start-1"
        >
          {variantsRes.error ? (
            <ErrorState message={variantsRes.error} compact title="Ürünler yüklenemedi" />
          ) : variants.length === 0 ? (
            <EmptyState
              title="Önce ürün ve reçete tanımlayın"
              compact
              action={
                <ButtonLink href="/urunler" size="sm">
                  Ürünlere git
                </ButtonLink>
              }
            />
          ) : (
            <SimulationPicker
              key={`${variantId ?? ""}-${qty}`}
              variants={variants}
              initialVariant={variantId}
              initialQty={qty}
              maxQty={MAX_QTY}
            />
          )}
          {qtyNote ? (
            <Alert tone="warning" className="mt-3">
              {qtyNote}
            </Alert>
          ) : null}
          {selected && !selected.is_active ? (
            <Alert tone="warning" className="mt-3">
              Bu varyant veya ürünü pasif; simülasyon yapılabilir ama üretim başlatılamaz.
            </Alert>
          ) : null}
        </Card>

        {/* 2 · Hesap özeti (masaüstünde sağ sütun). Seçim yokken boş özet yalnız masaüstünde görünür;
            mobil/tablette "Reçetesi tanımlı varyantlar" seçimin hemen altına gelir. */}
        <div className={cx("min-w-0 xl:col-start-2 xl:row-span-3 xl:row-start-1", !variantId && "hidden xl:block")}>
          {!variantId ? (
            <Card title="Hesap özeti" icon={ClipboardList}>
              <EmptyState title="Henüz hesap yok" icon={Calculator} compact>
                Ürün, varyant ve adet seçip “Hesapla”ya basın. Üretilebilecek en yüksek adet, maliyet ve süre burada görünür.
              </EmptyState>
            </Card>
          ) : simRes?.error ? (
            <Card title="Hesap özeti" icon={ClipboardList}>
              <ErrorState message={simRes.error} compact title="Simülasyon hesaplanamadı" />
            </Card>
          ) : sim ? (
            <SummaryCard sim={sim} fx={fxRes.fx} fxError={fxRes.error} productId={selected?.product_id ?? null} isAdmin={isAdmin} />
          ) : null}
        </div>

        {/* 3 · Üretimi başlat (reçetesiz varyantta özet kartı nedenini yazar) */}
        {sim && sim.has_bom ? (
          <Card title="Üretimi başlat" icon={Play} className="xl:col-start-1 xl:row-start-2">
            {!isAdmin ? (
              <Alert tone="info" title="Yalnız görüntüleme">
                Üretim başlatmak için yönetici yetkisi gerekir.
              </Alert>
            ) : (
              <StartProductionForm
                variantId={sim.variant.id}
                quantity={sim.quantity}
                today={today}
                blockedReason={blockedReason(sim)}
                initialFx={fxRes.fx?.is_valid ? fxRes.fx : null}
              />
            )}
          </Card>
        ) : null}

        {/* 4 · Malzeme tablosu */}
        {sim ? (
          <MaterialsCard sim={sim} productId={selected?.product_id ?? null} isAdmin={isAdmin} />
        ) : !variantId ? (
          <RecipeListCard variants={variants} recipes={recipeRes.data} error={recipeRes.error} />
        ) : null}

        {/* 5 · Grafikler (tam genişlik) */}
        {sim && sim.has_bom && sim.lines.length > 0 ? (
          <div className="grid min-w-0 gap-4 xl:col-span-2 xl:row-start-4 xl:grid-cols-2">
            <Card
              title="Darboğaz analizi"
              description="Her malzemenin mevcut stoğuyla en fazla kaç adet üretilebileceği"
              icon={AlertOctagon}
            >
              <BottleneckChart
                requested={sim.quantity}
                rows={sim.lines.map((l) => ({
                  key: l.material_id,
                  label: l.name,
                  maxUnits: Number(l.max_units),
                  available: fmtQty(l.available, l.display_factor, l.display_unit),
                  perUnit: fmtQty(l.qty_per_unit, l.display_factor, l.display_unit, 4),
                }))}
              />
            </Card>
            <Card title="Tahmini maliyet dağılımı" description="Malzemelere göre · TL (kayıt değeri), USD bilgi" icon={PieChart}>
              {sim.total_cost_try && Number(sim.total_cost_try) > 0 ? (
                <CostShareDonut
                  total={Number(sim.total_cost_try)}
                  rows={sim.lines.map((l) => ({
                    name: l.name,
                    valueTry: Number(l.line_cost_try ?? 0),
                    valueUsd: Number(l.line_cost_usd ?? 0),
                  }))}
                />
              ) : (
                <EmptyState title="Maliyet hesaplanamadı" compact>
                  Malzemelerin alış kaydı olmadığı için tahmini maliyet yok.
                </EmptyState>
              )}
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}

/** Başlatma engeli: neden başlatılamadığı açıkça yazılır. */
function blockedReason(sim: Simulation): string | null {
  if (!sim.has_bom) return "Bu varyantın reçetesi yok.";
  if (!sim.variant.is_active) return "Varyant veya ürün pasif olduğu için üretim başlatılamaz.";
  if (!sim.all_available) {
    const short = sim.lines.filter((l) => Number(l.shortage) > 0);
    const list = short
      .slice(0, 3)
      .map((l) => `${l.name} (${fmtQty(l.shortage, l.display_factor, l.display_unit)} eksik)`)
      .join(", ");
    return `Yetersiz hammadde: ${list}${short.length > 3 ? ` ve ${short.length - 3} malzeme daha` : ""}. Bu stokla en fazla ${fmtInt(sim.max_producible)} adet üretilebilir.`;
  }
  if (!sim.can_start) return "Üretim şu an başlatılamaz.";
  return null;
}

function limitingLine(sim: Simulation): SimulationLine | null {
  if (!sim.lines.length) return null;
  return [...sim.lines].sort((a, b) => Number(a.max_units) - Number(b.max_units) || a.name.localeCompare(b.name, "tr"))[0];
}

function SummaryCard({
  sim,
  fx,
  fxError,
  productId,
  isAdmin,
}: {
  sim: Simulation;
  fx: FxSuggestion | null;
  fxError: string | null;
  productId: string | null;
  isAdmin: boolean;
}) {
  const shortCount = sim.lines.filter((l) => Number(l.shortage) > 0).length;
  const limit = limitingLine(sim);
  const max = Number(sim.max_producible);
  const totalTry = sim.total_cost_try === null ? null : Number(sim.total_cost_try);
  const totalUsd = sim.total_cost_usd === null ? null : Number(sim.total_cost_usd);
  const impliedRate = totalTry !== null && totalUsd ? totalTry / totalUsd : null;
  // Süre verisi yoksa (0 veya boş) tahmin uydurulmaz: "Süre tanımlı değil".
  const hasMinutes = Number(sim.unit_production_minutes) > 0;
  const variantHref = productId ? `/urunler/${productId}/varyant/${sim.variant.id}` : null;

  return (
    <Card
      title="Hesap özeti"
      description={`${sim.variant.display_name} · ${fmtInt(sim.quantity)} adet`}
      icon={ClipboardList}
      footer="Tahmin, malzemelerin güncel hareketli ağırlıklı ortalama maliyetiyle yapılır (stok yoksa son alış fiyatı). Üretim başlatıldığında o andaki birim maliyetler ve işlem kuru partiye sabitlenir."
    >
      {!sim.has_bom ? (
        <Alert tone="warning" title="Reçete tanımlı değil">
          Bu varyant için reçete (BOM) yok; malzeme ihtiyacı ve maliyet hesaplanamaz, üretim başlatılamaz.
          {variantHref ? (
            <>
              {" "}
              {/* Yazma çağrısı yalnız yöneticiye; görüntüleyici varyant sayfasına nötr bağlantı görür. */}
              <Link className="link" href={variantHref}>
                {isAdmin ? "Reçeteyi tanımla" : "Varyantı görüntüle"}
              </Link>
            </>
          ) : null}
        </Alert>
      ) : sim.all_available ? (
        <Alert tone="success" title="Stok yeterli">
          {fmtInt(sim.quantity)} adet için reçetedeki tüm malzemeler stokta.
        </Alert>
      ) : (
        <Alert tone="error" title="Yetersiz hammadde">
          {fmtInt(shortCount)} malzemede eksik var. Bu stokla en fazla {fmtInt(max)} adet üretilebilir.
        </Alert>
      )}

      {sim.has_bom ? (
        <div className="mt-3 rounded-md border border-line bg-canvas/60 px-3 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-xs font-medium text-ink-muted">Maksimum üretilebilir</span>
            <span className="text-xl font-semibold text-ink tabular-nums">{`${fmtInt(max)} adet`}</span>
          </div>
          {limit ? (
            <p className="mt-1 text-xs text-ink-muted">
              Sınırlayan malzeme: <span className="font-medium text-ink-soft">{limit.name}</span> · mevcut{" "}
              {fmtQty(limit.available, limit.display_factor, limit.display_unit)}, 1 adet için{" "}
              {fmtQty(limit.qty_per_unit, limit.display_factor, limit.display_unit, 4)}
            </p>
          ) : null}
          {max > 0 && max !== sim.quantity ? (
            <Link
              href={`/simulasyon?varyant=${sim.variant.id}&adet=${max}`}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
            >
              {fmtInt(max)} adetle yeniden hesapla
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
      ) : null}

      {sim.has_bom ? (
        <>
          <SummarySection icon={Coins} title="Tahmini maliyet">
            <Row label="Toplam (TL, kayıt değeri)" value={fmtMoney(sim.total_cost_try, "TRY")} strong />
            <Row label="Toplam (USD)" value={fmtMoney(sim.total_cost_usd, "USD")} />
            <Row label="Birim maliyet (TL)" value={fmtUnitMoney(sim.unit_cost_try, "TRY")} strong />
            <Row label="Birim maliyet (USD)" value={fmtUnitMoney(sim.unit_cost_usd, "USD")} />
            <Row
              label="Tanımlı satış fiyatı"
              value={sim.variant.sale_price !== null ? `${fmtMoney(sim.variant.sale_price, sim.variant.currency)} / adet` : "Tanımlı değil"}
            />
          </SummarySection>
          {!sim.cost_complete ? (
            <Alert tone="warning" className="mt-2">
              Bazı malzemelerin hiç alış kaydı yok; maliyet eksik hesaplandı.
            </Alert>
          ) : null}
        </>
      ) : null}

      <SummarySection icon={Clock} title="Süre">
        {hasMinutes ? (
          <>
            <Row label="Birim üretim süresi" value={fmtMinutes(sim.unit_production_minutes)} />
            <Row
              label="Tahmini üretim süresi"
              value={fmtMinutes(sim.estimated_minutes)}
              hint={`${fmtInt(sim.quantity)} × ${fmtMinutes(sim.unit_production_minutes)}`}
              strong
            />
          </>
        ) : (
          <Row
            label="Tahmini üretim süresi"
            value={<span className="font-medium text-ink-muted">Süre tanımlı değil</span>}
            hint={
              <>
                Ürün veya varyant için birim üretim süresi girilmemiş; süre tahmini yapılmaz.
                {isAdmin && variantHref ? (
                  <>
                    {" "}
                    <Link className="link" href={variantHref}>
                      Süreyi tanımla
                    </Link>
                  </>
                ) : null}
              </>
            }
          />
        )}
      </SummarySection>

      <SummarySection icon={ArrowLeftRight} title="Kur">
        {impliedRate !== null ? (
          <Row label="Maliyetteki ortalama kur" value={fmtRate(impliedRate)} hint="Malzeme alışlarının kendi günündeki kurlarından" />
        ) : null}
        {fx ? (
          <Row
            label="İşlem kuru (bugün)"
            value={fmtRate(fx.rate)}
            hint={
              <>
                {fxSourceLabel(fx.source, fx.rate_type)} · kur tarihi {fmtDate(fx.rate_date)}
                {!fx.is_valid ? (
                  <span className="mt-0.5 flex items-start gap-1 font-medium text-ink-soft">
                    <TriangleAlert className="mt-px size-3 shrink-0 text-chart-amber" aria-hidden />
                    Kur eski; başlatırken güncel kur istenir.
                  </span>
                ) : null}
              </>
            }
          />
        ) : (
          <Row label="İşlem kuru (bugün)" value="—" hint={fxError ? `Kur okunamadı: ${fxError}` : "Bugün için kayıtlı kur yok."} />
        )}
      </SummarySection>
    </Card>
  );
}

function SummarySection({ icon: Icon, title, children }: { icon: typeof Coins; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">
        <Icon className="size-3.5" aria-hidden />
        {title}
      </h3>
      <dl className="text-[13px]">{children}</dl>
    </section>
  );
}

function Row({ label, value, hint, strong = false }: { label: string; value: React.ReactNode; hint?: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-dashed border-line py-1.5 last:border-b-0">
      <dt className="min-w-0 text-ink-muted">
        {label}
        {hint ? <span className="block text-[11.5px] text-ink-muted/90">{hint}</span> : null}
      </dt>
      <dd className={cx("shrink-0 text-right tabular-nums", strong ? "font-semibold text-ink" : "font-medium text-ink-soft")}>{value}</dd>
    </div>
  );
}

function MaterialsCard({ sim, productId, isAdmin }: { sim: Simulation; productId: string | null; isAdmin: boolean }) {
  const shortCount = sim.lines.filter((l) => Number(l.shortage) > 0).length;
  const okCount = sim.lines.length - shortCount;
  const totalTry = Number(sim.total_cost_try ?? 0);
  return (
    <Card
      title="Malzeme ihtiyacı"
      description={`${fmtInt(sim.lines.length)} kalem · ${fmtInt(sim.quantity)} adet için gereken / mevcut / eksik`}
      icon={Layers}
      padded={false}
      className={cx("xl:col-start-1 xl:self-start", sim.has_bom ? "xl:row-start-3" : "xl:row-start-2")}
      actions={
        sim.lines.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="green" icon={CheckCircle2}>
              {fmtInt(okCount)} yeterli
            </Badge>
            {shortCount > 0 ? (
              <Badge tone="red" icon={AlertOctagon}>
                {fmtInt(shortCount)} eksik
              </Badge>
            ) : null}
          </div>
        ) : null
      }
    >
      {sim.lines.length === 0 ? (
        <EmptyState
          title="Reçete boş"
          compact
          action={
            productId ? (
              <ButtonLink href={`/urunler/${productId}/varyant/${sim.variant.id}`} size="sm" variant="secondary">
                {isAdmin ? "Reçeteyi tanımla" : "Varyantı görüntüle"}
              </ButtonLink>
            ) : undefined
          }
        >
          Bu varyantın reçetesinde malzeme yok.{isAdmin ? "" : " Reçeteyi yönetici tanımlar."}
        </EmptyState>
      ) : (
        <TableWrap>
          <table className="table-base table-compact">
            <thead>
              <tr>
                <th>Malzeme</th>
                <th className="num">Gerekli</th>
                <th className="num">Mevcut</th>
                <th className="num">Eksik / durum</th>
                <th className="num" title="Gösterim birimi başına; TL (kayıt değeri), USD bilgi">
                  Birim maliyet
                </th>
                <th className="num" title="TL (kayıt değeri); USD bilgi ve maliyet payı">
                  Tahmini tutar
                </th>
              </tr>
            </thead>
            <tbody>
              {sim.lines.map((l) => {
                const short = Number(l.shortage) > 0;
                const share = totalTry > 0 && l.line_cost_try !== null ? (Number(l.line_cost_try) / totalTry) * 100 : null;
                const factor = Number(l.display_factor);
                return (
                  <tr key={l.material_id} className={short ? "[&>td]:bg-chart-red/5" : undefined}>
                    <td className="min-w-32">
                      <Link href={`/hammadde/${l.material_id}`} className="link">
                        {l.name}
                      </Link>
                      <div className="code">{l.code}</div>
                      {/* Dar ekranda durum sütunu kaydırma dışında kalır; durum adın altında da görünür. */}
                      <div className="mt-1 sm:hidden">
                        <LineStatus short={short} />
                      </div>
                    </td>
                    <td className="num">
                      {fmtQty(l.required, l.display_factor, l.display_unit)}
                      <div className="text-xs text-ink-muted" title="1 adet için gereken × adet">
                        {fmtQty(l.qty_per_unit, l.display_factor, l.display_unit, 4)} × {fmtInt(sim.quantity)}
                      </div>
                    </td>
                    <td className="num">{fmtQty(l.available, l.display_factor, l.display_unit)}</td>
                    <td className="num">
                      {short ? (
                        <Badge tone="red" icon={AlertOctagon}>
                          {fmtQty(l.shortage, l.display_factor, l.display_unit)} eksik
                        </Badge>
                      ) : (
                        <Badge tone="green" icon={CheckCircle2}>
                          Yeterli
                        </Badge>
                      )}
                      <div className="mt-0.5 text-xs text-ink-muted">en fazla {fmtInt(l.max_units)} adet</div>
                    </td>
                    <td className="num">
                      {l.unit_cost_try !== null ? (
                        <>
                          {fmtMoney(Number(l.unit_cost_try) * factor, "TRY", 4)}
                          <span className="text-xs text-ink-muted"> / {l.display_unit}</span>
                          <div className="text-xs text-ink-muted">
                            {fmtMoney(Number(l.unit_cost_usd) * factor, "USD", 4)} / {l.display_unit}
                          </div>
                        </>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                      {l.cost_basis === "last_purchase" ? <div className="text-xs text-ink-muted">son alış fiyatı</div> : null}
                      {l.cost_basis === "none" ? (
                        <div className="mt-0.5">
                          <Badge tone="amber" icon={TriangleAlert}>
                            maliyet yok
                          </Badge>
                        </div>
                      ) : null}
                    </td>
                    <td className="num">
                      {fmtMoney(l.line_cost_try, "TRY")}
                      <div className="text-xs text-ink-muted">
                        {fmtMoney(l.line_cost_usd, "USD")}
                        {share !== null ? ` · %${fmtNum(share, 1, 1)}` : ""}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}>Toplam tahmini malzeme maliyeti</td>
                <td className="num">
                  {fmtMoney(sim.total_cost_try, "TRY")}
                  <div className="text-xs font-medium text-ink-muted">{fmtMoney(sim.total_cost_usd, "USD")}</div>
                </td>
              </tr>
            </tfoot>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}

function LineStatus({ short }: { short: boolean }) {
  return short ? (
    <Badge tone="red" icon={AlertOctagon}>
      Eksik
    </Badge>
  ) : (
    <Badge tone="green" icon={CheckCircle2}>
      Yeterli
    </Badge>
  );
}

function RecipeListCard({ variants, recipes, error }: { variants: PickerVariant[]; recipes: RecipeRow[] | null; error: string | null }) {
  const byId = new Map(variants.map((v) => [v.id, v]));
  const rows = (recipes ?? [])
    .filter((r) => r.bom_line_count > 0 && byId.has(r.variant_id))
    .map((r) => ({ ...r, v: byId.get(r.variant_id)! }))
    .sort((a, b) => a.v.product_name.localeCompare(b.v.product_name, "tr") || a.v.variant_name.localeCompare(b.v.variant_name, "tr"));
  return (
    <Card
      title="Reçetesi tanımlı varyantlar"
      description="Hızlı başlangıç: bir varyantı seçip 1 adet için hesaplayın, ardından adedi değiştirin."
      icon={ClipboardList}
      padded={false}
      className="xl:col-start-1 xl:row-start-2 xl:row-span-2 xl:self-start"
    >
      {error ? (
        <ErrorState message={error} compact title="Reçeteler yüklenemedi" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Reçetesi olan varyant yok"
          compact
          action={
            <ButtonLink href="/urunler" size="sm" variant="secondary">
              Ürünler ve BOM
            </ButtonLink>
          }
        >
          Simülasyon için önce bir varyanta reçete (BOM) tanımlayın.
        </EmptyState>
      ) : (
        <TableWrap>
          <table className="table-base">
            <thead>
              <tr>
                <th>Ürün / varyant</th>
                <th className="num">Reçete</th>
                <th className="num hidden sm:table-cell" title="Reçetenin 1 adet için güncel tahmini malzeme maliyeti">
                  Tahmini maliyet / adet
                </th>
                <th>Durum</th>
                <th className="relative hidden w-px sm:table-cell">
                  <span className="sr-only">İşlem</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.variant_id}>
                  <td className="min-w-40">
                    {/* Ad, simülasyon bağlantısıdır: dar ekranda sağdaki düğme kaydırma dışında kalsa da işlem ilk sütundan yapılır. */}
                    <Link href={`/simulasyon?varyant=${r.variant_id}&adet=1`} className="link">
                      {r.v.product_name}
                    </Link>
                    <div className="text-xs text-ink-muted">{r.v.variant_name}</div>
                    {/* Dar ekranda maliyet sütunu gizlenir; tahmini maliyet ad altında görünür. */}
                    <div className="mt-1 text-xs text-ink-soft tabular-nums sm:hidden">
                      {fmtMoney(r.est_unit_cost_try, "TRY")} · {fmtMoney(r.est_unit_cost_usd, "USD")} / adet
                      {!r.cost_complete ? " · eksik maliyet" : ""}
                    </div>
                  </td>
                  <td className="num">{fmtInt(r.bom_line_count)} kalem</td>
                  <td
                    className="num hidden sm:table-cell"
                    title={`${fmtUnitMoney(r.est_unit_cost_try, "TRY")} · ${fmtUnitMoney(r.est_unit_cost_usd, "USD")}`}
                  >
                    {fmtMoney(r.est_unit_cost_try, "TRY")}
                    <div className="text-xs text-ink-muted">
                      {fmtMoney(r.est_unit_cost_usd, "USD")}
                      {!r.cost_complete ? " · eksik maliyet" : ""}
                    </div>
                  </td>
                  <td>
                    {r.v.is_active ? (
                      <Badge tone="green" icon={CheckCircle2}>
                        Aktif
                      </Badge>
                    ) : (
                      <Badge tone="gray">Pasif</Badge>
                    )}
                  </td>
                  <td className="hidden text-right whitespace-nowrap sm:table-cell">
                    <ButtonLink href={`/simulasyon?varyant=${r.variant_id}&adet=1`} size="sm" variant="soft">
                      <Calculator aria-hidden />
                      Simüle et
                    </ButtonLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}
