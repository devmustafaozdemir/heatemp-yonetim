import { Table2 } from "lucide-react";
import Link from "next/link";
import { Card, cx, EmptyState, ErrorState, ProgressBar, TableWrap } from "@/components/ui";
import { LinkSegmented, SortTh } from "@/components/ui/list";
import { fmtDate, fmtInt, fmtMoney } from "@/lib/format";
import { hrefWith } from "@/lib/list-params";
import type { Period } from "@/lib/period";
import type { FinanceRow, StockTotals } from "./data";
import { pct1 } from "./fmt";

/**
 * Yapışkan ilk sütunun zemini: opak olmalı (kaydırılan hücreler altından görünmesin) ve satır üzerine
 * gelindiğinde satırın geri kalanıyla aynı renge dönmeli (tablo satır hover rengi ≈ canvas ile beyazın karışımı).
 */
const STICKY_BODY_CELL =
  "sticky left-0 z-[1] border-r border-line bg-white [tr:hover_&]:bg-[color:color-mix(in_srgb,var(--color-canvas)_50%,white)]";

/**
 * Ürün/varyant bazında finans tablosu: seçilen dönemin satış sonucu (sales_by_variant) ve
 * güncel stok/üretim sütunları (v_variant_overview). Sıralama ve kapsam URL'dedir.
 */
export function ProductFinanceTable({
  error,
  rows,
  period,
  values,
  sort,
  dir,
  scope,
  showUsd,
  companyStock,
  basePath = "/kasa",
}: {
  error: string | null;
  rows: FinanceRow[];
  period: Period;
  values: Record<string, string>;
  sort: string | null;
  dir: "asc" | "desc";
  scope: "donem" | "tumu";
  showUsd: boolean;
  /** Tüm varyantların güncel stok/üretim toplamı (v_variant_overview); listelenenler bir alt küme olabilir. */
  companyStock: StockTotals | null;
  /** Sıralama/kapsam bağlantılarının sayfası (genel veya ortak kasası) */
  basePath?: string;
}) {
  const th = { sort, dir, basePath, values };
  const totalRevenue = rows.reduce((a, r) => a + r.revenue, 0);
  const t = rows.reduce(
    (a, r) => ({
      quantity: a.quantity + r.quantity,
      revenue: a.revenue + r.revenue,
      cogs: a.cogs + r.cogs,
      profit: a.profit + r.profit,
      profitUsd: a.profitUsd + r.profit_usd,
      produced: a.produced + r.produced_qty,
      opening: a.opening + r.opening_qty,
      heatemp: a.heatemp + r.heatemp_qty,
      mekonsis: a.mekonsis + r.mekonsis_qty,
      remaining: a.remaining + r.total_remaining,
      stock: a.stock + r.stock_value,
    }),
    {
      quantity: 0,
      revenue: 0,
      cogs: 0,
      profit: 0,
      profitUsd: 0,
      produced: 0,
      opening: 0,
      heatemp: 0,
      mekonsis: 0,
      remaining: 0,
      stock: 0,
    },
  );
  // Listelenen varyantlar tüm varyantların alt kümesiyse (ör. "Dönemde satılanlar") stok/üretim toplamı
  // şirket toplamından farklıdır; bu durumda ayrı bir "Şirket geneli" satırı gösterilir.
  const partial =
    companyStock !== null &&
    (Math.abs(t.stock - companyStock.stock) >= 0.005 ||
      t.remaining !== companyStock.remaining ||
      t.produced !== companyStock.produced ||
      t.opening !== companyStock.opening);
  const scopeHref = (s: "donem" | "tumu") => `${hrefWith(basePath, values, { kapsam: s === "donem" ? null : s })}#urun-finans`;

  return (
    <Card
      id="urun-finans"
      title="Ürün bazlı finans"
      icon={Table2}
      description={`Seçilen dönem (${fmtDate(period.from)} – ${fmtDate(period.to)}) satış sonucu ve güncel stok/üretim durumu. Başlıklara tıklayarak sıralayın.`}
      padded={false}
      className="scroll-mt-20"
      actions={
        <>
          <LinkSegmented
            active={scope}
            items={[
              {
                key: "donem",
                label: "Dönemde satılanlar",
                href: scopeHref("donem"),
              },
              {
                key: "tumu",
                label: "Stok veya geçmişi olanlar",
                href: scopeHref("tumu"),
              },
            ]}
          />
          {!error ? (
            <span className="text-xs whitespace-nowrap text-ink-muted" aria-live="polite">
              {fmtInt(rows.length)} varyant
            </span>
          ) : null}
        </>
      }
      footer={
        <span>
          <strong className="font-medium text-ink-soft">Üretilen:</strong> tamamlanmış üretim partileri, açılış stoğu hariç.{" "}
          <strong className="font-medium text-ink-soft">Açılış:</strong> sisteme aktarılan açılış stoğu adedi (üretim sayılmaz).{" "}
          <strong className="font-medium text-ink-soft">Stok değeri:</strong> Heatemp ve Mekonsis raflarında kalan adetlerin parti maliyeti.
          {showUsd ? " USD karşılıkları yalnızca bilgi amaçlıdır; satış günü kuruyla sabitlenmiş değerlerin toplamıdır." : ""}
        </span>
      }
    >
      {error ? (
        <ErrorState message={error} />
      ) : rows.length === 0 ? (
        <EmptyState title={scope === "donem" ? "Seçilen dönemde gerçekleşmiş satış yok" : "Gösterilecek varyant yok"}>
          {scope === "donem" ? (
            <>
              Başka bir dönem seçin veya{" "}
              <Link href={scopeHref("tumu")} className="link">
                stok veya geçmişi olan tüm varyantları
              </Link>{" "}
              görüntüleyin.
            </>
          ) : (
            "Henüz üretim, açılış stoğu veya satış kaydı yok."
          )}
        </EmptyState>
      ) : (
        <TableWrap>
          <table className="table-base table-compact">
            <thead>
              <tr>
                <th className="sticky left-0 z-[1] border-r border-line">
                  <span className="sr-only">Sütun grupları</span>
                </th>
                <th colSpan={4} className="border-r border-line text-center text-[11px] tracking-wider text-ink-muted uppercase">
                  Seçilen dönem · TL
                </th>
                <th colSpan={4} className="text-center text-[11px] tracking-wider text-ink-muted uppercase">
                  Güncel stok · tüm zamanlar üretim
                </th>
              </tr>
              <tr>
                <SortTh label="Ürün / varyant" column="urun" {...th} className="sticky left-0 z-[1] border-r border-line" />
                <SortTh label="Adet" column="adet" align="right" {...th} />
                <SortTh label="Ciro · pay" column="ciro" align="right" {...th} title="Ciro ve dönem cirosu içindeki payı" />
                <SortTh
                  label="Brüt kâr"
                  column="kar"
                  align="right"
                  {...th}
                  title={showUsd ? "Altındaki USD karşılığı yalnızca bilgi amaçlıdır" : undefined}
                />
                <SortTh label="Marj" column="marj" align="right" {...th} className="border-r border-line" />
                <SortTh
                  label="Üretilen"
                  column="uretilen"
                  align="right"
                  {...th}
                  title="Tamamlanmış üretim partileri (açılış stoğu hariç)"
                />
                <SortTh label="Açılış" column="acilis" align="right" {...th} title="Sisteme aktarılan açılış stoğu adedi" />
                <SortTh label="Kalan stok" column="kalan" align="right" {...th} title="Heatemp (H) + Mekonsis (M) raflarındaki adet" />
                <SortTh label="Stok değeri" column="stok" align="right" {...th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const share = totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0;
                return (
                  <tr key={r.variant_id}>
                    <td className={cx(STICKY_BODY_CELL, "min-w-44 sm:min-w-48")}>
                      <Link href={`/urunler/${r.product_id}`} className="font-medium text-ink hover:text-brand-600 hover:underline">
                        {r.product_name}
                      </Link>
                      <div className="text-xs text-ink-muted">
                        {r.variant_name} · <span className="font-mono text-[11px] whitespace-nowrap">{r.variant_code}</span>
                        {!r.is_active ? <span className="ml-1 text-ink-muted">(pasif)</span> : null}
                      </div>
                    </td>
                    <td className={cx("num", r.quantity === 0 && "text-ink-muted")}>{fmtInt(r.quantity)}</td>
                    <td className="num">
                      <span className="font-medium text-ink">{fmtMoney(r.revenue, "TRY")}</span>
                      <div className="mt-1 flex items-center justify-end gap-1.5">
                        <div className="w-14">
                          <ProgressBar
                            value={r.revenue}
                            max={totalRevenue}
                            tone="blue"
                            label={`${r.product_name} ${r.variant_name} ciro payı`}
                          />
                        </div>
                        <span className="w-11 text-[11px] text-ink-muted">{pct1(share)}</span>
                      </div>
                    </td>
                    <td className="num">
                      <span className={cx("font-medium", r.profit < 0 ? "text-chart-red" : "text-ink")}>{fmtMoney(r.profit, "TRY")}</span>
                      {showUsd ? <div className="text-[11px] text-ink-muted">≈ {fmtMoney(r.profit_usd, "USD")}</div> : null}
                    </td>
                    <td className="num border-r border-line">{pct1(r.margin)}</td>
                    <td className={cx("num", r.produced_qty === 0 && "text-ink-muted")}>{fmtInt(r.produced_qty)}</td>
                    <td className={cx("num", r.opening_qty === 0 && "text-ink-muted")}>{fmtInt(r.opening_qty)}</td>
                    <td className="num">
                      <span className="font-medium text-ink">{fmtInt(r.total_remaining)}</span>
                      <div className="text-[11px] text-ink-muted">
                        H {fmtInt(r.heatemp_qty)} · M {fmtInt(r.mekonsis_qty)}
                      </div>
                    </td>
                    <td className="num">{fmtMoney(r.stock_value, "TRY")}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="sticky left-0 z-[1] border-r border-line">
                  Toplam{" "}
                  <span className="text-xs font-normal whitespace-nowrap text-ink-muted">
                    ({partial ? "listelenen " : ""}
                    {fmtInt(rows.length)} varyant)
                  </span>
                </td>
                <td className="num">{fmtInt(t.quantity)}</td>
                <td className="num">{fmtMoney(t.revenue, "TRY")}</td>
                <td className="num">
                  <span className={cx(t.profit < 0 && "text-chart-red")}>{fmtMoney(t.profit, "TRY")}</span>
                  {showUsd ? <div className="text-[11px] font-normal text-ink-muted">≈ {fmtMoney(t.profitUsd, "USD")}</div> : null}
                </td>
                <td className="num border-r border-line">{pct1(t.revenue > 0 ? (t.profit / t.revenue) * 100 : null)}</td>
                <td className="num">{fmtInt(t.produced)}</td>
                <td className="num">{fmtInt(t.opening)}</td>
                <td className="num">
                  {fmtInt(t.remaining)}
                  <div className="text-[11px] font-normal text-ink-muted">
                    H {fmtInt(t.heatemp)} · M {fmtInt(t.mekonsis)}
                  </div>
                </td>
                <td className="num">{fmtMoney(t.stock, "TRY")}</td>
              </tr>
              {partial && companyStock ? (
                <tr>
                  <td className="sticky left-0 z-[1] border-r border-line">
                    Şirket geneli{" "}
                    <span className="text-xs font-normal whitespace-nowrap text-ink-muted">
                      (tüm {fmtInt(companyStock.variants)} varyant)
                    </span>
                  </td>
                  <td colSpan={4} className="border-r border-line text-right text-xs font-normal text-ink-muted">
                    Güncel stok ve üretim; dönem satışlarının tamamı üst satırda.
                  </td>
                  <td className="num">{fmtInt(companyStock.produced)}</td>
                  <td className="num">{fmtInt(companyStock.opening)}</td>
                  <td className="num">
                    {fmtInt(companyStock.remaining)}
                    <div className="text-[11px] font-normal text-ink-muted">
                      H {fmtInt(companyStock.heatemp)} · M {fmtInt(companyStock.mekonsis)}
                    </div>
                  </td>
                  <td className="num">{fmtMoney(companyStock.stock, "TRY")}</td>
                </tr>
              ) : null}
            </tfoot>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}
