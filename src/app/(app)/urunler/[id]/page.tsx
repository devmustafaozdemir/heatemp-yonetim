import { Calculator, Plus } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { StockStatusBadge } from "@/components/StockStatus";
import { Alert, Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { Drawer } from "@/components/ui/dialog";
import { LinkTabs } from "@/components/ui/list";
import { getAuthContext, requireMember } from "@/lib/auth";
import { fmtDate, fmtInt, fmtMinutes100, fmtMoney } from "@/lib/format";
import { first, type SearchParams } from "@/lib/list-params";
import { isUuid } from "@/lib/parse";
import { load, must } from "@/lib/query";
import type { Product, VariantView } from "@/lib/types";
import { KpiStrip, ProductThumb, ShelfSplit, fmtCostRange } from "../_components/bits";
import { TabLabel } from "../_components/TabLabel";
import type { ProductListRow, RecipeCostRow } from "../_components/types";
import { DeleteButton } from "@/components/DeleteButton";
import { createVariant, deleteProduct } from "../actions";
import { VariantFields } from "../VariantFields";
import { BomTab } from "./BomTab";
import { CostTab } from "./CostTab";
import { GeneralTab } from "./GeneralTab";
import { StockTab } from "./StockTab";
import { VariantsTab } from "./VariantsTab";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx || !isUuid(id)) return { title: "Ürün" };
  const { data } = await ctx.supabase.from("products").select("name").eq("id", id).maybeSingle<{ name: string }>();
  return { title: data?.name ?? "Ürün" };
}

/** short: dar ekranda (640 px altı) gösterilen kısa ad; beş sekme 390 px'e sığar. */
const TABS = [
  { key: "genel", label: "Genel bilgiler", short: "Genel" },
  { key: "varyantlar", label: "Varyantlar", short: "Varyantlar" },
  { key: "bom", label: "BOM / reçete", short: "BOM" },
  { key: "maliyet", label: "Maliyet ve üretim süresi", short: "Maliyet" },
  { key: "stok", label: "Stok ve hareketler", short: "Stok" },
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

  const [product, variants, summary, recipes] = await Promise.all([
    must(ctx.supabase.from("products").select("*").eq("id", id).maybeSingle<Product>(), "Ürün"),
    must(ctx.supabase.from("v_variants").select("*").eq("product_id", id).order("variant_name").returns<VariantView[]>(), "Varyantlar"),
    load(ctx.supabase.from("v_product_list").select("*").eq("id", id).maybeSingle<ProductListRow>()),
    load(
      ctx.supabase
        .from("v_variant_recipe_cost")
        .select("variant_id, bom_line_count")
        .eq("product_id", id)
        .gt("bom_line_count", 0)
        .returns<Pick<RecipeCostRow, "variant_id" | "bom_line_count">[]>(),
    ),
  ]);
  if (!product) notFound();
  const vs = variants ?? [];
  const s = summary.data;
  // Simülasyon yalnız reçetesi olan varyantla anlamlıdır: önce reçeteli aktif varyant, yoksa
  // reçeteli herhangi bir varyant. Hiçbirinin reçetesi yoksa (veya bilgi alınamadıysa) düğme gösterilmez.
  const withBom = new Set((recipes.data ?? []).map((r) => r.variant_id));
  const simVariant = vs.find((v) => v.is_active && withBom.has(v.id)) ?? vs.find((v) => withBom.has(v.id));
  const base = `/urunler/${id}`;

  return (
    <>
      <PageHeader
        title={<span>{product.name}</span>}
        crumbs={[{ label: product.code }]}
        meta={
          <>
            <span className="code rounded bg-canvas px-1.5 py-0.5 text-ink-soft" title="Ürün kodu">
              {product.code}
            </span>
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
              <ButtonLink
                href={`/simulasyon?varyant=${simVariant.id}&adet=1`}
                variant="secondary"
                title={`${simVariant.variant_name} (${simVariant.variant_code}) reçetesiyle`}
              >
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
            {isAdmin ? (
              <DeleteButton action={deleteProduct} fields={{ id: product.id }} title={`${product.name} silinsin mi?`} variant="secondary">
                Ürün, tüm varyantları ve reçeteleriyle kalıcı olarak silinir. Üretim, stok, teslimat, satış veya teklif kaydı olan ürün
                silinemez; bunun yerine pasif yapın.
              </DeleteButton>
            ) : null}
          </>
        }
      />

      <Card padded={false} className="mb-4">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5">
          {/* Görsel yoksa mobilde yer tutucu gösterilmez (ürün kodu başlıkta). */}
          <div className={product.image_path ? "shrink-0" : "hidden shrink-0 sm:block"}>
            <ProductThumb path={product.image_path} size="xl" />
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
                  sub: <ShelfSplit heatemp={s.heatemp_qty} mekonsis={s.mekonsis_qty} />,
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
                  label: "Üretim süresi (100 adet)",
                  value: fmtMinutes100(product.unit_production_minutes),
                  sub: s.minutes_override_count > 0 ? `${fmtInt(s.minutes_override_count)} varyantta özel süre` : "1 adet için",
                },
              ]}
            />
          ) : null}
        </div>
        <div className="border-t border-line sm:px-2">
          <LinkTabs
            active={tab}
            tabs={TABS.map((t) => ({
              key: t.key,
              label: <TabLabel label={t.label} short={t.short} count={t.key === "varyantlar" ? vs.length : undefined} active={t.key === tab} />,
              href: t.key === "genel" ? base : `${base}?sekme=${t.key}`,
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
