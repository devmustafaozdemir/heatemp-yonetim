import { Calculator, Plus } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { StockStatusBadge } from "@/components/StockStatus";
import { Alert, Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { Drawer } from "@/components/ui/dialog";
import { LinkTabs } from "@/components/ui/list";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtInt, fmtMinutes, fmtMoney } from "@/lib/format";
import { first, type SearchParams } from "@/lib/list-params";
import { isUuid } from "@/lib/parse";
import { load, must } from "@/lib/query";
import type { Product, VariantView } from "@/lib/types";
import { KpiStrip, ProductThumb, fmtCostRange } from "../_components/bits";
import type { ProductListRow } from "../_components/types";
import { createVariant } from "../actions";
import { VariantFields } from "../VariantFields";
import { BomTab } from "./BomTab";
import { CostTab } from "./CostTab";
import { GeneralTab } from "./GeneralTab";
import { StockTab } from "./StockTab";
import { VariantsTab } from "./VariantsTab";

export const metadata: Metadata = { title: "Ürün" };

const TABS = [
  { key: "genel", label: "Genel bilgiler" },
  { key: "varyantlar", label: "Varyantlar" },
  { key: "bom", label: "BOM / reçete" },
  { key: "maliyet", label: "Maliyet ve üretim süresi" },
  { key: "stok", label: "Stok ve hareketler" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const ctx = await requireMember();
  const isAdmin = ctx.role === "admin";
  const requested = first(sp.sekme);
  const tab: TabKey = TABS.some((t) => t.key === requested) ? (requested as TabKey) : "genel";

  const [product, variants, summary] = await Promise.all([
    must(ctx.supabase.from("products").select("*").eq("id", id).maybeSingle<Product>(), "Ürün"),
    must(ctx.supabase.from("v_variants").select("*").eq("product_id", id).order("variant_name").returns<VariantView[]>(), "Varyantlar"),
    load(ctx.supabase.from("v_product_list").select("*").eq("id", id).maybeSingle<ProductListRow>()),
  ]);
  if (!product) notFound();
  const vs = variants ?? [];
  const s = summary.data;
  const simVariant = vs.find((v) => v.is_active) ?? vs[0];
  const base = `/urunler/${id}`;

  return (
    <>
      <PageHeader
        title={<span>{product.name}</span>}
        crumbs={[{ label: product.code }]}
        meta={
          <>
            {product.is_active ? <Badge tone="green">Aktif</Badge> : <Badge>Pasif</Badge>}
            {s?.worst_stock_status ? (
              <StockStatusBadge
                row={{
                  stock_status: s.worst_stock_status,
                  total_remaining: s.worst_total_remaining ?? 0,
                  critical_stock: s.worst_critical_stock ?? 0,
                  min_stock: s.worst_min_stock ?? 0,
                  target_stock: s.worst_target_stock ?? 0,
                }}
              />
            ) : null}
          </>
        }
        description={product.description ?? undefined}
        actions={
          <>
            {simVariant ? (
              <ButtonLink href={`/simulasyon?varyant=${simVariant.id}&adet=1`} variant="secondary">
                <Calculator aria-hidden />
                Üretim simülasyonu
              </ButtonLink>
            ) : null}
            {isAdmin ? (
              <Drawer
                trigger={
                  <>
                    <Plus aria-hidden />
                    Yeni varyant
                  </>
                }
                title="Yeni varyant"
                description={`${product.name} için yeni varyant. Boş bırakılan fiyat, süre ve eşikler ürünün varsayılanlarından gelir.`}
                size="md"
              >
                <ActionForm action={createVariant} resetOnSuccess>
                  <input type="hidden" name="product_id" value={product.id} />
                  <VariantFields defaults={product} />
                  <div className="mt-5 flex justify-end border-t border-line pt-4">
                    <SubmitButton>Varyant ekle</SubmitButton>
                  </div>
                </ActionForm>
              </Drawer>
            ) : null}
          </>
        }
      />

      <Card padded={false} className="mb-4">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5">
          <div className="flex items-center gap-3 sm:block">
            <ProductThumb path={product.image_path} size="xl" />
            <div className="sm:hidden">
              <div className="code text-ink-muted">{product.code}</div>
              <div className="text-xs text-ink-muted">{fmtInt(vs.length)} varyant</div>
            </div>
          </div>
          {summary.error ? (
            <Alert tone="error" className="flex-1">
              Özet göstergeler yüklenemedi: {summary.error}
            </Alert>
          ) : s ? (
            <KpiStrip
              items={[
                {
                  label: "Toplam stok",
                  value: `${fmtInt(s.total_remaining)} adet`,
                  sub: `Heatemp ${fmtInt(s.heatemp_qty)} · Mekonsis ${fmtInt(s.mekonsis_qty)}`,
                },
                {
                  label: "Varyant",
                  value: `${fmtInt(s.active_variant_count)} / ${fmtInt(s.variant_count)} aktif`,
                  sub: s.no_bom_variant_count > 0 ? `${fmtInt(s.no_bom_variant_count)} varyantın reçetesi yok` : "Tüm aktif varyantların reçetesi var",
                },
                {
                  label: "Tanımlı satış fiyatı",
                  value: fmtMoney(product.default_sale_price, product.default_currency),
                  sub: s.price_override_count > 0 ? `${fmtInt(s.price_override_count)} varyantta özel fiyat` : "Ürün varsayılanı",
                },
                {
                  label: "Tahmini reçete maliyeti",
                  value: fmtCostRange(s.est_cost_usd_min, s.est_cost_usd_max, "USD"),
                  sub: s.est_cost_usd_max === null ? "Reçete tanımlı değil" : fmtCostRange(s.est_cost_try_min, s.est_cost_try_max, "TRY"),
                },
                {
                  label: "Gerçekleşmiş parti maliyeti",
                  value: fmtCostRange(s.last_cost_usd_min, s.last_cost_usd_max, "USD"),
                  sub: s.last_completed_at ? `Son parti ${fmtDate(s.last_completed_at)}` : "Tamamlanmış üretim yok",
                },
                {
                  label: "Birim üretim süresi",
                  value: fmtMinutes(product.unit_production_minutes),
                  sub: s.minutes_override_count > 0 ? `${fmtInt(s.minutes_override_count)} varyantta özel süre` : "1 adet için",
                },
              ]}
            />
          ) : null}
        </div>
        <div className="border-t border-line px-2">
          <LinkTabs
            active={tab}
            tabs={TABS.map((t) => ({
              key: t.key,
              label: t.label,
              href: t.key === "genel" ? base : `${base}?sekme=${t.key}`,
              count: t.key === "varyantlar" ? vs.length : undefined,
            }))}
          />
        </div>
      </Card>

      {tab === "genel" ? (
        <GeneralTab ctx={ctx} product={product} variants={vs} isAdmin={isAdmin} />
      ) : tab === "varyantlar" ? (
        <VariantsTab ctx={ctx} product={product} variants={vs} />
      ) : tab === "bom" ? (
        <BomTab ctx={ctx} product={product} variants={vs} isAdmin={isAdmin} />
      ) : tab === "maliyet" ? (
        <CostTab ctx={ctx} product={product} variants={vs} sp={sp} />
      ) : (
        <StockTab ctx={ctx} product={product} variants={vs} sp={sp} />
      )}
    </>
  );
}
