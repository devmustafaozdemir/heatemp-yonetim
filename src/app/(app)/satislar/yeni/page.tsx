import type { Metadata } from "next";
import { Alert, Card, PageHeader } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { todayTr } from "@/lib/format";
import type { VariantOverview } from "@/lib/types";
import { SaleForm, type SaleVariantOption } from "../SaleForm";

export const metadata: Metadata = { title: "Yeni satış" };

export default async function NewSalePage() {
  const ctx = await requireMember();
  const [{ data: overview }, { data: customers }] = await Promise.all([
    ctx.supabase
      .from("v_variant_overview")
      .select("variant_id, display_name, mekonsis_qty, sale_price, currency")
      .gt("mekonsis_qty", 0)
      .order("display_name")
      .returns<Pick<VariantOverview, "variant_id" | "display_name" | "mekonsis_qty" | "sale_price" | "currency">[]>(),
    ctx.supabase.from("customers").select("id, name").eq("is_active", true).order("name"),
  ]);
  const options: SaleVariantOption[] = (overview ?? []).map((o) => ({
    variant_id: o.variant_id,
    display_name: o.display_name,
    available: o.mekonsis_qty,
    sale_price: o.sale_price,
    currency: o.currency,
  }));

  return (
    <>
      <PageHeader
        back={{ href: "/satislar", label: "Satışlar" }}
        title="Yeni Mekonsis satışı"
        description="Mekonsis'in gerçekleştirdiği satışın gerçek adet ve birim fiyatını girin. Satış yalnızca Mekonsis rafındaki stoktan yapılabilir; satış fiyatının tamamı Heatemp geliridir."
      />
      {ctx.role !== "admin" ? (
        <Alert tone="info">Satış girmek için yönetici yetkisi gerekir.</Alert>
      ) : options.length === 0 ? (
        <Alert tone="warning">Mekonsis rafında satılabilir ürün yok. Önce Rafım ekranından teslimat yapın.</Alert>
      ) : (
        <Card>
          <SaleForm variants={options} customers={customers ?? []} today={todayTr()} />
        </Card>
      )}
    </>
  );
}
