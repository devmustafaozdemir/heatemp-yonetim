import { AlertCircle, Calculator } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StockStatusBadge } from "@/components/StockStatus";
import { Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { LinkTabs } from "@/components/ui/list";
import { getAuthContext, requireMember } from "@/lib/auth";
import { toUserMessage } from "@/lib/errors";
import { fmtDate, fmtInt, fmtMinutes, fmtMoney, fmtUnitMoney } from "@/lib/format";
import { first, type SearchParams } from "@/lib/list-params";
import { isUuid } from "@/lib/parse";
import { load, must } from "@/lib/query";
import type { Product, Simulation, VariantOverview, VariantView, ProductVariant } from "@/lib/types";
import { KpiStrip, ProductThumb, ShelfSplit } from "../../../_components/bits";
import { TabLabel } from "../../../_components/TabLabel";
import { VariantBomTab } from "./BomTab";
import { VariantCostTab } from "./CostTab";
import { VariantGeneralTab } from "./GeneralTab";
import { VariantStockTab } from "./StockTab";
import type { VariantPageData } from "./types";

export async function generateMetadata({ params }: { params: Promise<{ id: string; variantId: string }> }): Promise<Metadata> {
  const { variantId } = await params;
  const ctx = await getAuthContext();
  if (!ctx || !isUuid(variantId)) return { title: "Varyant" };
  const { data } = await ctx.supabase.from("v_variants").select("display_name").eq("id", variantId).maybeSingle<{ display_name: string }>();
  return { title: data?.display_name ?? "Varyant" };
}

/** short: dar ekranda (640 px altı) gösterilen kısa ad. */
const TABS = [
  { key: "genel", label: "Genel", short: "Genel" },
  { key: "bom", label: "BOM / reçete", short: "BOM" },
  { key: "maliyet", label: "Maliyet", short: "Maliyet" },
  { key: "stok", label: "Stok ve hareketler", short: "Stok" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
/** Varyant sayfası reçete düzenleme içindir: sekme verilmezse BOM / reçete açılır. */
const DEFAULT_TAB: TabKey = "bom";

export default async function VariantPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; variantId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id, variantId } = await params;
  const sp = await searchParams;
  if (!isUuid(id) || !isUuid(variantId)) notFound();
  const ctx = await requireMember();
  const isAdmin = ctx.role === "admin";
  const requested = first(sp.sekme);
  const tab: TabKey = TABS.some((t) => t.key === requested) ? (requested as TabKey) : DEFAULT_TAB;

  const [variant, effective, product, overview, simRes] = await Promise.all([
    must(ctx.supabase.from("product_variants").select("*").eq("id", variantId).eq("product_id", id).maybeSingle<ProductVariant>(), "Varyant"),
    must(ctx.supabase.from("v_variants").select("*").eq("id", variantId).maybeSingle<VariantView>(), "Varyant"),
    must(ctx.supabase.from("products").select("*").eq("id", id).maybeSingle<Product>(), "Ürün"),
    load(ctx.supabase.from("v_variant_overview").select("*").eq("variant_id", variantId).maybeSingle<VariantOverview>()),
    ctx.supabase.rpc("simulate_production", { p_variant_id: variantId, p_quantity: 1 }),
  ]);
  if (!variant || !effective || !product) notFound();
  const sim = simRes.error ? null : (simRes.data as Simulation);
  const data: VariantPageData = {
    product,
    variant,
    effective,
    overview: overview.data,
    overviewError: overview.error,
    sim,
    simError: simRes.error ? toUserMessage(simRes.error) : null,
  };
  const o = overview.data;
  const base = `/urunler/${id}/varyant/${variantId}`;

  return (
    <>
      <PageHeader
        title={
          <span>
            {effective.product_name} <span className="font-normal text-ink-muted">—</span> {effective.variant_name}
          </span>
        }
        crumbs={[
          { label: effective.product_code, href: `/urunler/${id}` },
          { label: effective.variant_name },
        ]}
        meta={
          <>
            <span className="code rounded bg-canvas px-1.5 py-0.5 text-ink-soft" title="Varyant kodu">
              {effective.variant_code}
            </span>
            {effective.is_active ? (
              <Badge tone="green">Aktif</Badge>
            ) : (
              <Badge>{effective.variant_is_active ? "Ürün pasif" : "Pasif"}</Badge>
            )}
            {o ? (
              <StockStatusBadge row={o} />
            ) : data.overviewError ? (
              <Badge tone="red" icon={AlertCircle} title={data.overviewError}>
                Stok durumu yüklenemedi
              </Badge>
            ) : null}
          </>
        }
        actions={
          // Reçetesiz varyantta simülasyon hesaplanamaz; düğme yalnız reçete varken (veya
          // reçete bilgisi alınamadığında) gösterilir.
          sim?.has_bom !== false ? (
            <ButtonLink href={`/simulasyon?varyant=${variantId}&adet=1`} variant="secondary">
              <Calculator aria-hidden />
              Üretim simülasyonu
            </ButtonLink>
          ) : null
        }
      />

      <Card padded={false} className="mb-4">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5">
          {/* Görsel yoksa mobilde yer tutucu gösterilmez (varyant kodu başlıkta). */}
          <div className={product.image_path ? "shrink-0" : "hidden shrink-0 sm:block"}>
            <ProductThumb path={product.image_path} size="xl" />
          </div>
          <KpiStrip
            items={[
              {
                label: "Toplam stok",
                value: o ? `${fmtInt(o.total_remaining)} adet` : "—",
                sub: o ? <ShelfSplit heatemp={o.heatemp_qty} mekonsis={o.mekonsis_qty} /> : data.overviewError ? "Stok özeti yüklenemedi" : "Stok kaydı yok",
              },
              {
                label: "Stok eşikleri",
                value: `${fmtInt(effective.critical_stock)} / ${fmtInt(effective.min_stock)} / ${fmtInt(effective.target_stock)}`,
                sub: `Kritik / min / hedef · ${effective.thresholds_overridden ? "varyanta özel" : "üründen"}`,
              },
              {
                label: "Tanımlı satış fiyatı",
                value: fmtMoney(effective.sale_price, effective.currency),
                sub: effective.price_overridden ? "Varyanta özel" : "Ürün varsayılanı",
              },
              {
                label: "Tahmini reçete maliyeti",
                value: sim?.has_bom ? fmtUnitMoney(sim.unit_cost_usd, "USD") : "—",
                sub: sim?.has_bom ? fmtUnitMoney(sim.unit_cost_try, "TRY") : data.simError ? "Hesaplanamadı" : "Reçete tanımlı değil",
              },
              {
                label: "Gerçekleşmiş parti maliyeti",
                value: o?.last_batch_no ? fmtUnitMoney(o.last_unit_cost_usd, "USD") : "—",
                // Hata ≠ boş: özet yüklenemediyse "üretim yok" denmez.
                sub: o?.last_batch_no
                  ? `${o.last_batch_no} · ${fmtDate(o.last_completed_at)}`
                  : data.overviewError
                    ? "Maliyet özeti yüklenemedi"
                    : "Tamamlanmış üretim yok",
              },
              {
                label: "Birim üretim süresi",
                value: fmtMinutes(effective.unit_production_minutes),
                sub: effective.minutes_overridden ? "Varyanta özel" : "Ürün varsayılanı",
              },
            ]}
          />
        </div>
        <div className="border-t border-line sm:px-2">
          <LinkTabs
            active={tab}
            tabs={TABS.map((t) => ({
              key: t.key,
              label: <TabLabel label={t.label} short={t.short} count={t.key === "bom" && sim ? sim.lines.length : undefined} active={t.key === tab} />,
              href: t.key === DEFAULT_TAB ? base : `${base}?sekme=${t.key}`,
            }))}
          />
        </div>
      </Card>

      {tab === "genel" ? (
        <VariantGeneralTab ctx={ctx} data={data} isAdmin={isAdmin} />
      ) : tab === "bom" ? (
        <VariantBomTab ctx={ctx} data={data} isAdmin={isAdmin} />
      ) : tab === "maliyet" ? (
        <VariantCostTab ctx={ctx} data={data} sp={sp} />
      ) : (
        <VariantStockTab ctx={ctx} data={data} sp={sp} />
      )}
    </>
  );
}
