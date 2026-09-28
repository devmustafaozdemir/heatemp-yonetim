import type { Metadata } from "next";
import { Alert, Card, PageHeader, Stat, TableWrap } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtInt, fmtMoney, fmtPct } from "@/lib/format";
import type { FinancialSummary, VariantOverview } from "@/lib/types";

export const metadata: Metadata = { title: "Kasa" };

export default async function CashPage() {
  const ctx = await requireMember();
  const [{ data: s, error }, { data: rows }, { data: settings }] = await Promise.all([
    ctx.supabase.from("v_financial_summary").select("*").single<FinancialSummary>(),
    ctx.supabase
      .from("v_variant_overview")
      .select("*")
      .order("product_name")
      .order("variant_name")
      .returns<VariantOverview[]>(),
    ctx.supabase.from("app_settings").select("show_usd_info").single(),
  ]);
  if (error || !s) throw new Error("Finansal özet yüklenemedi.");
  const showUsd = settings?.show_usd_info ?? true;
  const list = (rows ?? []).filter((r) => r.produced_qty > 0 || r.sold_qty > 0 || r.in_production_qty > 0);
  const accounted = Number(s.cogs_try) + Number(s.finished_value_try) + Number(s.wip_value_try);
  const opening = Number(s.opening_value_try);
  const diff = Number(s.production_spend_try) + opening - accounted;

  return (
    <>
      <PageHeader
        title="Kasa — finansal özet"
        description="Satış ve stok kayıtlarından türetilen yönetim özeti. Muhasebe nakdi veya gerçek kasa/banka bakiyesi değildir."
      />
      <div className="mb-4">
        <Alert tone="info">
          Tüm tutarlar <strong>TL işlem günü değeri</strong> temelindedir: ciro satış günündeki kurla, maliyetler hammadde
          alış günlerindeki kurlarla TL&apos;ye çevrilmiş kayıtlı değerlerdir. Farklı para birimleri doğrudan toplanmaz.
          {showUsd ? " USD rakamları yalnızca bilgi amaçlı çevrimdir." : ""}
        </Alert>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-slate-700">Satış sonucu</h2>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Toplam ciro" value={fmtMoney(s.revenue_try, "TRY")} hint={showUsd ? `≈ ${fmtMoney(s.revenue_usd, "USD")} (bilgi)` : undefined} />
        <Stat label="Satılan ürün maliyeti (FIFO)" value={fmtMoney(s.cogs_try, "TRY")} hint={`${fmtInt(s.sold_qty)} adet`} />
        <Stat
          label="Gerçekleşmiş brüt kâr"
          value={fmtMoney(s.gross_profit_try, "TRY")}
          hint={`Marj ${fmtPct(s.margin_pct)}`}
          tone={s.gross_profit_try >= 0 ? "positive" : "negative"}
        />
      </div>

      <h2 className="mb-2 text-sm font-semibold text-slate-700">Üretim ve stok değerleri</h2>
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Üretime harcanan" value={fmtMoney(s.production_spend_try, "TRY")} hint="Başlatılan partilerin malzeme maliyeti (iptaller hariç)" />
        <Stat label="Heatemp mamul raf değeri" value={fmtMoney(s.heatemp_value_try, "TRY")} hint={`${fmtInt(s.heatemp_qty)} adet`} />
        <Stat label="Mekonsis mamul raf değeri" value={fmtMoney(s.mekonsis_value_try, "TRY")} hint={`${fmtInt(s.mekonsis_qty)} adet · Heatemp varlığı`} />
        <Stat label="Toplam mamul stok değeri" value={fmtMoney(s.finished_value_try, "TRY")} />
        <Stat label="Hammadde stok değeri" value={fmtMoney(s.material_value_try, "TRY")} hint="Monte edilmemiş komponentler dahil" />
      </div>
      <p className="mb-6 text-xs text-slate-500">
        Mutabakat: üretime harcanan {fmtMoney(s.production_spend_try, "TRY")}
        {opening > 0 ? ` + açılış stoğu ${fmtMoney(opening, "TRY")}` : ""} = satılan ürün maliyeti {fmtMoney(s.cogs_try, "TRY")} +
        mamul stok {fmtMoney(s.finished_value_try, "TRY")} + üretimdeki partiler {fmtMoney(s.wip_value_try, "TRY")}
        {Math.abs(diff) >= 0.01 ? ` (yuvarlama farkı ${fmtMoney(diff, "TRY")})` : ""}.
      </p>

      <Card title="Ürün / varyant bazında" padded={false}>
        <TableWrap>
          <table className="table-base">
            <thead>
              <tr>
                <th>Ürün / varyant</th>
                <th className="num">Üretilen</th>
                <th className="num">Satılan</th>
                <th className="num">Ciro (TL)</th>
                <th className="num">Maliyet (TL)</th>
                <th className="num">Brüt kâr (TL)</th>
                <th className="num">Marj</th>
                <th className="num">Kalan stok</th>
                <th className="num">Kalan stok değeri (TL)</th>
                {showUsd ? <th className="num">Brüt kâr (USD, bilgi)</th> : null}
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={showUsd ? 10 : 9} className="py-6 text-center text-slate-500">
                    Henüz üretim veya satış yok.
                  </td>
                </tr>
              ) : (
                list.map((r) => (
                  <tr key={r.variant_id}>
                    <td className="min-w-48">
                      <div className="font-medium">{r.product_name}</div>
                      <div className="text-xs text-slate-500">{r.variant_name}</div>
                    </td>
                    <td className="num">{fmtInt(r.produced_qty)}</td>
                    <td className="num">{fmtInt(r.sold_qty)}</td>
                    <td className="num">{fmtMoney(r.revenue_try, "TRY")}</td>
                    <td className="num">{fmtMoney(r.cogs_try, "TRY")}</td>
                    <td className="num">{fmtMoney(r.gross_profit_try, "TRY")}</td>
                    <td className="num">{fmtPct(r.margin_pct)}</td>
                    <td className="num">
                      {fmtInt(r.total_remaining)}
                      <div className="text-xs text-slate-500">
                        H {fmtInt(r.heatemp_qty)} · M {fmtInt(r.mekonsis_qty)}
                      </div>
                    </td>
                    <td className="num">{fmtMoney(r.finished_value_try, "TRY")}</td>
                    {showUsd ? <td className="num text-slate-500">{fmtMoney(r.gross_profit_usd, "USD")}</td> : null}
                  </tr>
                ))
              )}
            </tbody>
            {list.length > 0 ? (
              <tfoot>
                <tr>
                  <td>Toplam</td>
                  <td className="num">{fmtInt(s.produced_qty)}</td>
                  <td className="num">{fmtInt(s.sold_qty)}</td>
                  <td className="num">{fmtMoney(s.revenue_try, "TRY")}</td>
                  <td className="num">{fmtMoney(s.cogs_try, "TRY")}</td>
                  <td className="num">{fmtMoney(s.gross_profit_try, "TRY")}</td>
                  <td className="num">{fmtPct(s.margin_pct)}</td>
                  <td className="num">{fmtInt(s.heatemp_qty + s.mekonsis_qty)}</td>
                  <td className="num">{fmtMoney(s.finished_value_try, "TRY")}</td>
                  {showUsd ? <td className="num">{fmtMoney(s.gross_profit_usd, "USD")}</td> : null}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </TableWrap>
      </Card>
    </>
  );
}
