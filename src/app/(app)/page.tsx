import type { Metadata } from "next";
import Link from "next/link";
import { SalesChart, type SalesPoint } from "@/components/SalesChart";
import { StockStatusBadge } from "@/components/StockStatus";
import { Card, EmptyState, Muted, PageHeader, Stat, TableWrap } from "@/components/ui";
import { CostChange } from "@/app/(app)/uretim/StatusBadge";
import { requireMember } from "@/lib/auth";
import { fmtInt, fmtMoney, fmtUnitMoney, todayTr } from "@/lib/format";
import type { FinancialSummary, SalesPeriodRow, VariantOverview } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };

function shiftDate(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthKey(iso: string, offset: number) {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return d.toISOString().slice(0, 7);
}

export default async function DashboardPage() {
  const ctx = await requireMember();
  const today = todayTr();
  const from30 = shiftDate(today, -29);
  const from12 = `${monthKey(today, -11)}-01`;

  const [{ data: overview, error }, { data: summary }, { data: daily }, { data: monthly }] = await Promise.all([
    ctx.supabase.from("v_variant_overview").select("*").order("product_name").order("variant_name").returns<VariantOverview[]>(),
    ctx.supabase.from("v_financial_summary").select("*").single<FinancialSummary>(),
    ctx.supabase.from("v_sales_daily").select("*").gte("day", from30).returns<SalesPeriodRow[]>(),
    ctx.supabase.from("v_sales_monthly").select("*").gte("month", from12).returns<SalesPeriodRow[]>(),
  ]);
  if (error) throw new Error("Dashboard verileri yüklenemedi.");

  const dailyMap = new Map((daily ?? []).map((d) => [d.day!, d]));
  const dailySeries: SalesPoint[] = Array.from({ length: 30 }, (_, i) => {
    const key = shiftDate(from30, i);
    const d = dailyMap.get(key);
    return { key, quantity: d?.quantity ?? 0, revenue_try: Number(d?.revenue_try ?? 0), gross_profit_try: Number(d?.gross_profit_try ?? 0) };
  });
  const monthlyMap = new Map((monthly ?? []).map((m) => [m.month!.slice(0, 7), m]));
  const monthlySeries: SalesPoint[] = Array.from({ length: 12 }, (_, i) => {
    const key = monthKey(today, i - 11);
    const m = monthlyMap.get(key);
    return { key, quantity: m?.quantity ?? 0, revenue_try: Number(m?.revenue_try ?? 0), gross_profit_try: Number(m?.gross_profit_try ?? 0) };
  });

  // Aktif varyantlar ile geçmişi/stoğu olan pasif varyantlar gösterilir.
  const rows = (overview ?? []).filter((r) => r.is_active || r.produced_qty > 0 || r.total_remaining > 0);
  const s = summary;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Üretim, iki raf ve Mekonsis satışlarının özeti. Rakamlar Kasa ekranıyla aynı satış ve stok kayıtlarından türetilir."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Toplam ciro (TL)" value={fmtMoney(s?.revenue_try, "TRY")} hint={`${fmtInt(s?.sold_qty)} adet satıldı`} />
        <Stat
          label="Gerçekleşmiş brüt kâr (TL)"
          value={fmtMoney(s?.gross_profit_try, "TRY")}
          tone={(s?.gross_profit_try ?? 0) >= 0 ? "positive" : "negative"}
        />
        <Stat label="Heatemp rafı" value={`${fmtInt(s?.heatemp_qty)} adet`} hint={fmtMoney(s?.heatemp_value_try, "TRY")} />
        <Stat label="Mekonsis rafı" value={`${fmtInt(s?.mekonsis_qty)} adet`} hint={fmtMoney(s?.mekonsis_value_try, "TRY")} />
      </div>

      <Card title="Ürün durumu" padded={false} className="mb-6">
        {rows.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Henüz ürün yok">
              <Link className="link" href="/urunler">
                Ürünler
              </Link>{" "}
              ekranından başlayın.
            </EmptyState>
          </div>
        ) : (
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th>Kod</th>
                  <th className="num">Tamamlanan üretim</th>
                  <th className="num">Mekonsis&apos;in sattığı</th>
                  <th className="num">Heatemp rafı</th>
                  <th className="num">Mekonsis rafı</th>
                  <th className="num">Toplam kalan</th>
                  <th>Stok durumu</th>
                  <th className="num">Son parti birim maliyeti</th>
                  <th className="num">Önceki partiye göre</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.variant_id}>
                    <td>
                      <Link href={`/urunler/${r.product_id}`} className="link font-medium">
                        {r.product_name}
                      </Link>
                      <div className="text-xs text-slate-500">{r.variant_name}</div>
                    </td>
                    <td className="font-mono text-xs">{r.variant_code}</td>
                    <td className="num">{fmtInt(r.produced_qty)}</td>
                    <td className="num">{fmtInt(r.sold_qty)}</td>
                    <td className="num">{fmtInt(r.heatemp_qty)}</td>
                    <td className="num">{fmtInt(r.mekonsis_qty)}</td>
                    <td className="num font-semibold">{fmtInt(r.total_remaining)}</td>
                    <td>
                      <StockStatusBadge row={r} />
                    </td>
                    <td className="num">
                      {r.last_batch_no ? (
                        <>
                          {fmtUnitMoney(r.last_unit_cost_usd, "USD")}
                          <div className="text-xs text-slate-500">{fmtUnitMoney(r.last_unit_cost_try, "TRY")}</div>
                        </>
                      ) : (
                        <Muted>—</Muted>
                      )}
                    </td>
                    <td className="num">
                      {r.last_batch_no ? (
                        <>
                          <CostChange pct={r.unit_cost_usd_change_pct} prev={r.prev_batch_no} />
                          {r.prev_unit_cost_try !== null ? (
                            <div className="text-xs text-slate-500">
                              TL: {fmtUnitMoney(r.prev_unit_cost_try, "TRY")} → {fmtUnitMoney(r.last_unit_cost_try, "TRY")}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <Muted>—</Muted>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          Birim maliyet değişimi aynı varyantın son iki tamamlanmış partisinin USD birim maliyetiyle hesaplanır; TL tarihsel
          değerler ayrıca gösterilir. Tek parti varsa yüzde gösterilmez.
        </p>
      </Card>

      <Card title="Satış ve ciro" description="Yalnızca gerçekleşmiş Mekonsis satışları (teslimatlar dahil değildir).">
        <SalesChart daily={dailySeries} monthly={monthlySeries} />
      </Card>
    </>
  );
}
