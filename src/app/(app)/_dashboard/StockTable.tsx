import { Package } from "lucide-react";
import Link from "next/link";
import { CostChange } from "@/components/status";
import { STOCK_STATUS, StockStatusBadge } from "@/components/StockStatus";
import { Alert, Badge, Card, cx, EmptyState, ErrorState, TableWrap } from "@/components/ui";
import { Pagination, SortTh } from "@/components/ui/list";
import { fmtDate, fmtInt, fmtMoney, fmtUnitMoney } from "@/lib/format";
import type { ListParams } from "@/lib/list-params";
import type { VariantOverview } from "@/lib/types";
import { StockTableToolbar } from "./StockTableToolbar";

export interface OpeningInfo {
  variants: number;
  qty: number;
  value_try: number;
  span: { min: string; max: string } | null;
}

const STATUS_OPTIONS = [
  { value: "risk", label: "Kritik veya minimum altı" },
  ...(Object.entries(STOCK_STATUS) as [keyof typeof STOCK_STATUS, (typeof STOCK_STATUS)[keyof typeof STOCK_STATUS]][]).map(
    ([value, s]) => ({
      value,
      label: s.label,
    }),
  ),
];

/** Mobil sıralama seçenekleri (masaüstünde tablo başlıkları sıralar). */
const SORT_OPTIONS = [
  { value: "product_name:asc", label: "Sırala: ürün adı (A–Z)" },
  { value: "product_name:desc", label: "Sırala: ürün adı (Z–A)" },
  { value: "total_remaining:asc", label: "Sırala: kalan (azdan çoğa)" },
  { value: "total_remaining:desc", label: "Sırala: kalan (çoktan aza)" },
  { value: "sold_qty:desc", label: "Sırala: en çok satılan" },
  { value: "heatemp_qty:desc", label: "Sırala: Heatemp rafı" },
  { value: "mekonsis_qty:desc", label: "Sırala: Mekonsis rafı" },
  { value: "produced_qty:desc", label: "Sırala: üretilen" },
  { value: "opening_qty:desc", label: "Sırala: açılış stoğu" },
];

const SCOPE_OPTIONS = [
  { value: "", label: "Stoğu veya geçmişi olanlar" },
  { value: "aktif", label: "Tüm aktif varyantlar" },
  { value: "tum", label: "Tüm varyantlar (pasif dahil)" },
];

function Qty({ v, strong = false }: { v: number; strong?: boolean }) {
  return <span className={cx(v === 0 ? "text-ink-muted" : strong ? "font-semibold text-ink" : "text-ink")}>{fmtInt(v)}</span>;
}

/**
 * Ana stok tablosu. Açılış stoğu üretilmiş miktar gibi gösterilmez: "Üretilen" yalnız
 * tamamlanmış üretim partileridir, açılış stoğu ayrı sütundadır.
 */
export function StockTable({
  error,
  rows,
  pageRows,
  lp,
  opening,
}: {
  error: string | null;
  /** Filtrelenmiş tüm satırlar (toplam satırı için) */
  rows: VariantOverview[];
  /** Görüntülenen sayfa */
  pageRows: VariantOverview[];
  lp: ListParams;
  opening: OpeningInfo | null;
}) {
  const values = lp.values;
  const sum = (k: keyof VariantOverview) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  const th = { sort: lp.sort, dir: lp.dir, basePath: "/", values };
  const filtered = Boolean(values.q || values.durum || values.kapsam);

  return (
    <Card
      id="urun-durumu"
      title="Ürün durumu"
      icon={Package}
      description="Varyant bazında üretim, raf stokları (Heatemp, Mekonsis) ve satış; tüm miktarlar adet. Durum, toplam kalanın varyant eşiklerine göre hesaplanır."
      padded={false}
      className="scroll-mt-20"
      footer={
        <>
          <strong className="font-medium text-ink-soft">Üretilen</strong>: tamamlanmış üretim partileri (açılış stoğu hariç).{" "}
          <strong className="font-medium text-ink-soft">Birim maliyet</strong> (geniş ekranda): son tamamlanmış üretim partisi (USD, altında TL); değişim
          önceki partiye göre USD birim maliyetle hesaplanır, tek parti varsa gösterilmez.
        </>
      }
    >
      {opening && opening.variants > 0 ? (
        <div className="border-b border-line p-3">
          <Alert tone="info" title="Veri kapsamı: açılış stoğu">
            {fmtInt(opening.variants)} varyantın stoğu ({fmtInt(opening.qty)} adet, {fmtMoney(opening.value_try, "TRY")} maliyet değeri)
            sistem öncesinden açılış stoğu olarak aktarıldı
            {opening.span
              ? opening.span.min === opening.span.max
                ? ` (stok tarihi ${fmtDate(opening.span.min)})`
                : ` (stok tarihleri ${fmtDate(opening.span.min)} – ${fmtDate(opening.span.max)})`
              : ""}
            . Bu stokların sistem öncesi üretim ve hareket geçmişi kayıtlı değildir; açılış adetleri “Üretilen” miktarına dahil edilmez,
            “Açılış” olarak ayrıca gösterilir.
          </Alert>
        </div>
      ) : null}

      {error ? (
        <ErrorState message={error} />
      ) : (
        <>
          <StockTableToolbar
            values={values}
            total={rows.length}
            statusOptions={STATUS_OPTIONS}
            scopeOptions={SCOPE_OPTIONS}
            sortOptions={SORT_OPTIONS}
            sortValue={`${lp.sort ?? "product_name"}:${lp.dir}`}
          />
          {rows.length === 0 ? (
            <EmptyState title={filtered ? "Filtreye uyan varyant yok" : "Henüz stoğu veya geçmişi olan varyant yok"}>
              {filtered ? (
                "Arama veya filtreleri değiştirin."
              ) : (
                <>
                  <Link className="link" href="/urunler">
                    Ürünler
                  </Link>{" "}
                  ekranından ürün tanımlayın; üretim veya açılış stoğu girildiğinde burada listelenir.
                </>
              )}
            </EmptyState>
          ) : (
            <>
              {/* Mobil ve tablet: kart listesi (tablo yatay kaydırma gerektirmeden okunur); xl ve üstü: tablo */}
              <ul className="grid gap-3 p-3 sm:grid-cols-2 xl:hidden" aria-label="Ürün durumu listesi">
                {pageRows.map((r) => (
                  <li key={r.variant_id} className="min-w-0 rounded-md border border-line p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/urunler/${r.product_id}`} className="link">
                          {r.product_name}
                        </Link>
                        <p className="text-xs text-ink-muted">
                          <Link
                            href={`/urunler/${r.product_id}/varyant/${r.variant_id}`}
                            className="font-medium text-ink-soft hover:text-brand-600 hover:underline"
                          >
                            {r.variant_name}
                          </Link>{" "}
                          · <span className="font-mono">{r.variant_code}</span>
                          {!r.is_active ? " · pasif" : ""}
                        </p>
                      </div>
                      <StockStatusBadge row={r} />
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      {(
                        [
                          ["Heatemp rafı", r.heatemp_qty],
                          ["Mekonsis rafı", r.mekonsis_qty],
                          ["Toplam kalan", r.total_remaining],
                        ] as const
                      ).map(([l, v]) => (
                        <div key={l} className="min-w-0 rounded bg-canvas px-2 py-1.5">
                          <dt className="text-ink-muted">{l}</dt>
                          <dd className="font-semibold text-ink tabular-nums">{fmtInt(v)}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-1.5 text-xs text-ink-muted tabular-nums">
                      {r.opening_qty > 0 ? `Açılış ${fmtInt(r.opening_qty)} · ` : ""}Üretilen {fmtInt(r.produced_qty)}
                      {r.in_production_qty > 0 ? ` (+${fmtInt(r.in_production_qty)} üretimde)` : ""} · Satılan {fmtInt(r.sold_qty)}
                      {r.last_batch_no ? ` · birim ${fmtUnitMoney(r.last_unit_cost_usd, "USD")}` : ""}
                    </p>
                  </li>
                ))}
                <li className="rounded-md bg-canvas px-3 py-2.5 text-xs text-ink-soft tabular-nums sm:col-span-2">
                  <span className="font-semibold text-ink">Toplam</span> ({fmtInt(rows.length)} varyant): Heatemp{" "}
                  {fmtInt(sum("heatemp_qty"))} · Mekonsis {fmtInt(sum("mekonsis_qty"))} · kalan {fmtInt(sum("total_remaining"))} · satılan{" "}
                  {fmtInt(sum("sold_qty"))}
                </li>
              </ul>
              <TableWrap className="hidden xl:block">
                <table className="table-base table-compact">
                  <thead>
                    <tr>
                      <SortTh label="Ürün" column="product_name" {...th} />
                      <th>Varyant / kod</th>
                      <SortTh
                        label="Açılış"
                        column="opening_qty"
                        align="right"
                        title="Sistem öncesinden aktarılan açılış stoğu (üretim sayılmaz)"
                        {...th}
                      />
                      <SortTh label="Üretilen" column="produced_qty" align="right" title="Tamamlanmış üretim partileri" {...th} />
                      <SortTh label="Heatemp" column="heatemp_qty" align="right" title="Heatemp rafındaki stok (adet)" {...th} />
                      <SortTh
                        label="Mekonsis"
                        column="mekonsis_qty"
                        align="right"
                        title="Mekonsis rafındaki stok (adet) — Heatemp'in varlığı"
                        {...th}
                      />
                      <SortTh label="Satılan" column="sold_qty" align="right" title="Gerçekleşmiş satışlar" {...th} />
                      <SortTh label="Kalan" column="total_remaining" align="right" title="Toplam kalan: Heatemp + Mekonsis rafı" {...th} />
                      <th>Durum</th>
                      <th className="num hidden min-[1400px]:table-cell" title="Son tamamlanmış üretim partisinin birim maliyeti (USD / TL)">
                        Birim maliyet
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => (
                      <tr key={r.variant_id}>
                        <td className="min-w-44">
                          <Link href={`/urunler/${r.product_id}`} className="link">
                            {r.product_name}
                          </Link>
                          {!r.is_active ? (
                            <span className="ml-1.5 align-middle">
                              <Badge tone="gray">Pasif</Badge>
                            </span>
                          ) : null}
                        </td>
                        <td>
                          <Link
                            href={`/urunler/${r.product_id}/varyant/${r.variant_id}`}
                            className="font-medium text-ink hover:text-brand-600 hover:underline"
                          >
                            {r.variant_name}
                          </Link>
                          <div className="code text-ink-muted">{r.variant_code}</div>
                        </td>
                        <td className="num">{r.opening_qty > 0 ? <Qty v={r.opening_qty} /> : <span className="text-ink-muted">—</span>}</td>
                        <td className="num">
                          <Qty v={r.produced_qty} />
                          {r.in_production_qty > 0 ? (
                            <div className="text-xs text-ink-muted">+{fmtInt(r.in_production_qty)} üretimde</div>
                          ) : null}
                        </td>
                        <td className="num">
                          <Qty v={r.heatemp_qty} />
                        </td>
                        <td className="num">
                          <Qty v={r.mekonsis_qty} />
                        </td>
                        <td className="num">
                          <Qty v={r.sold_qty} />
                        </td>
                        <td className="num">
                          <Qty v={r.total_remaining} strong />
                        </td>
                        <td>
                          <StockStatusBadge row={r} />
                        </td>
                        <td className="num hidden min-[1400px]:table-cell">
                          {r.last_batch_no ? (
                            <>
                              <span className="text-ink">{fmtUnitMoney(r.last_unit_cost_usd, "USD")}</span>
                              <div className="text-xs text-ink-muted">{fmtUnitMoney(r.last_unit_cost_try, "TRY")}</div>
                              <div className="text-xs">
                                <CostChange pct={r.unit_cost_usd_change_pct} prev={r.prev_batch_no} />
                              </div>
                            </>
                          ) : (
                            <span
                              className="text-xs text-ink-muted"
                              title={r.opening_qty > 0 ? "Yalnız açılış stoğu var; üretim partisi yok" : undefined}
                            >
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>
                        Toplam{" "}
                        <span className="font-normal text-ink-muted">
                          · {fmtInt(rows.length)} varyant{filtered ? " (filtreye göre)" : ""}
                        </span>
                      </td>
                      <td className="num">{fmtInt(sum("opening_qty"))}</td>
                      <td className="num">{fmtInt(sum("produced_qty"))}</td>
                      <td className="num">{fmtInt(sum("heatemp_qty"))}</td>
                      <td className="num">{fmtInt(sum("mekonsis_qty"))}</td>
                      <td className="num">{fmtInt(sum("sold_qty"))}</td>
                      <td className="num">{fmtInt(sum("total_remaining"))}</td>
                      <td />
                      <td className="hidden min-[1400px]:table-cell" />
                    </tr>
                  </tfoot>
                </table>
              </TableWrap>
            </>
          )}
          {rows.length > 0 ? (
            <Pagination basePath="/" values={values} page={lp.page} pageSize={lp.pageSize} total={rows.length} noun="varyant" />
          ) : null}
        </>
      )}
    </Card>
  );
}
