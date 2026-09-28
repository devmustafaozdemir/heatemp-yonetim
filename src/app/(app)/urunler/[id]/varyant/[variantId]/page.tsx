import { Calculator } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StockStatusBadge } from "@/components/StockStatus";
import { Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { LinkTabs } from "@/components/ui/list";
import { requireMember } from "@/lib/auth";
import { toUserMessage } from "@/lib/errors";
import { fmtDate, fmtInt, fmtMinutes, fmtMoney, fmtUnitMoney } from "@/lib/format";
import { first, type SearchParams } from "@/lib/list-params";
import { isUuid } from "@/lib/parse";
import { load, must } from "@/lib/query";
import type { Product, Simulation, VariantOverview, VariantView, ProductVariant } from "@/lib/types";
import { KpiStrip, ProductThumb } from "../../../_components/bits";
import { VariantBomTab } from "./BomTab";
import { VariantCostTab } from "./CostTab";
import { VariantGeneralTab } from "./GeneralTab";
import { VariantStockTab } from "./StockTab";
import type { VariantPageData } from "./types";

export const metadata: Metadata = { title: "Varyant ve reçete" };

const TABS = [
  { key: "genel", label: "Genel" },
  { key: "bom", label: "BOM / reçete" },
  { key: "maliyet", label: "Maliyet" },
  { key: "stok", label: "Stok ve hareketler" },
] as const;
type TabKey = (typeof TABS)[number]["key"];


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
  const tab: TabKey = TABS.some((t) => t.key === requested) ? (requested as TabKey) : "genel";

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
            {effective.is_active ? (
              <Badge tone="green">Aktif</Badge>
            ) : (
              <Badge>{effective.variant_is_active ? "Ürün pasif" : "Pasif"}</Badge>
            )}
            {o ? <StockStatusBadge row={o} /> : null}
          </>
        }
        actions={
          <ButtonLink href={`/simulasyon?varyant=${variantId}&adet=1`} variant="secondary">
            <Calculator aria-hidden />
            Üretim simülasyonu
          </ButtonLink>
        }
      />

      <Card padded={false} className="mb-4">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5">
          <div className="flex items-center gap-3 sm:block">
            <ProductThumb path={product.image_path} size="xl" />
            <div className="sm:hidden">
              <div className="code text-ink-muted">{effective.variant_code}</div>
            </div>
          </div>
          <KpiStrip
            items={[
              {
                label: "Toplam stok",
                value: o ? `${fmtInt(o.total_remaining)} adet` : "—",
                sub: o ? `Heatemp ${fmtInt(o.heatemp_qty)} · Mekonsis ${fmtInt(o.mekonsis_qty)}` : "Stok özeti yüklenemedi",
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
                sub: o?.last_batch_no ? `${o.last_batch_no} · ${fmtDate(o.last_completed_at)}` : "Tamamlanmış üretim yok",
              },
              {
                label: "Birim üretim süresi",
                value: fmtMinutes(effective.unit_production_minutes),
                sub: effective.minutes_overridden ? "Varyanta özel" : "Ürün varsayılanı",
              },
            ]}
          />
        </div>
        <div className="border-t border-line px-2">
          <LinkTabs
            active={tab}
            tabs={TABS.map((t) => ({
              key: t.key,
              label: t.label,
              href: t.key === "genel" ? base : `${base}?sekme=${t.key}`,
              count: t.key === "bom" && sim ? sim.lines.length : undefined,
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
