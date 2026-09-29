import { Store } from "lucide-react";
import type { Metadata } from "next";
import { Alert, ButtonLink, PageHeader } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { todayTr } from "@/lib/format";
import { first, type SearchParams } from "@/lib/list-params";
import { load, must } from "@/lib/query";
import type { VariantOverview } from "@/lib/types";
import { SaleForm, type FifoLayer, type SaleVariantOption } from "../SaleForm";

export const metadata: Metadata = { title: "Yeni satış" };

type OverviewRow = Pick<VariantOverview, "variant_id" | "display_name" | "variant_code" | "mekonsis_qty" | "sale_price" | "currency">;

export default async function NewSalePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ctx = await requireMember();
  const header = (
    <PageHeader
      title="Yeni satış"
      description="Mekonsis'in gerçekleştirdiği satışın gerçek adet ve birim fiyatını girin. Satış yalnızca Mekonsis rafındaki stoktan yapılır; satış tutarının tamamı Heatemp geliridir."
    />
  );

  if (ctx.role !== "admin") {
    return (
      <>
        {header}
        <Alert tone="info">Satış girmek için yönetici yetkisi gerekir.</Alert>
      </>
    );
  }

  const [overview, customers, layers] = await Promise.all([
    must(
      ctx.supabase
        .from("v_variant_overview")
        .select("variant_id, display_name, variant_code, mekonsis_qty, sale_price, currency")
        .gt("mekonsis_qty", 0)
        .order("display_name")
        .returns<OverviewRow[]>(),
      "Mekonsis rafı",
    ),
    must(
      ctx.supabase.from("customers").select("id, name").eq("is_active", true).order("name").returns<{ id: string; name: string }[]>(),
      "Müşteriler",
    ),
    load(
      ctx.supabase
        .from("v_sale_fifo_layers")
        .select("variant_id, batch_no, batch_kind, received_on, fifo_seq, qty_remaining, unit_cost_try")
        .order("variant_id")
        .order("received_on")
        .order("fifo_seq")
        .returns<FifoLayer[]>(),
    ),
  ]);

  const options: SaleVariantOption[] = (overview ?? []).map((o) => ({
    variant_id: o.variant_id,
    display_name: o.display_name,
    variant_code: o.variant_code,
    available: o.mekonsis_qty,
    sale_price: o.sale_price === null ? null : Number(o.sale_price),
    currency: o.currency,
  }));
  const layerRows = (layers.data ?? []).map((l) => ({ ...l, qty_remaining: Number(l.qty_remaining), unit_cost_try: Number(l.unit_cost_try) }));
  const musteri = first(sp.musteri);
  const varyant = first(sp.varyant);

  return (
    <>
      {header}
      {options.length === 0 ? (
        <Alert tone="warning" title="Mekonsis rafında satılabilir ürün yok">
          <p>Satış için önce Heatemp rafından Mekonsis&apos;e teslimat yapın.</p>
          <div className="mt-2">
            <ButtonLink href="/rafim?islem=teslimat" size="sm" variant="secondary">
              <Store aria-hidden />
              Teslimat yap
            </ButtonLink>
          </div>
        </Alert>
      ) : (
        <SaleForm
          variants={options}
          layers={layerRows}
          layersError={layers.error}
          customers={customers ?? []}
          today={todayTr()}
          defaultCustomerId={(customers ?? []).some((c) => c.id === musteri) ? musteri : ""}
          defaultVariantId={options.some((o) => o.variant_id === varyant) ? varyant : ""}
        />
      )}
    </>
  );
}
