import { AlertTriangle, Info, Pencil, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/forms";
import { Badge, TableWrap, cx } from "@/components/ui";
import { Modal } from "@/components/ui/dialog";
import { fmtInt, fmtMoney, fmtPct, fmtUnitMoney, type Currency } from "@/lib/format";
import type { QuoteEstimateLine } from "@/lib/types";
import { deleteQuoteItem } from "../actions";
import { QuoteItemForm, type ExistingLine, type QuoteVariantOption } from "./ItemForm";

export interface QuoteLineRow {
  line: QuoteEstimateLine;
  listPrice: number | null;
  listCurrency: Currency | null;
  comparable: boolean;
  discountUnit: number | null;
  discountPct: number | null;
  revenueTry: number | null;
  costTry: number;
  profitTry: number | null;
  marginPct: number | null;
}

export interface QuoteLineTotals {
  quantity: number;
  listTotal: number | null;
  discountTotal: number | null;
  discountPct: number | null;
  amount: number;
  costTry: number | null;
  profitTry: number | null;
  marginPct: number | null;
}

const neg = "text-chart-red";

/**
 * Teklif kalemleri: adet, liste (normal) fiyatı, özel fiyat, indirim (tutar ve %), tutar,
 * Mekonsis stoğu, tahmini (önizleme) veya gerçekleşen maliyet, brüt kâr ve marj birlikte.
 */
export function QuoteLinesTable({
  quoteId,
  quoteNo,
  currency,
  rows,
  totals,
  actual,
  showStock,
  editable,
  editOptions,
  existing,
  fxRate,
}: {
  quoteId: string;
  quoteNo: string;
  currency: Currency;
  rows: QuoteLineRow[];
  totals: QuoteLineTotals;
  /** true: dönüşen teklif, maliyet/kâr gerçekleşen satıştan */
  actual: boolean;
  showStock: boolean;
  editable: boolean;
  /** Düzenleme penceresi için kalem → varyant seçeneği */
  editOptions: Record<string, QuoteVariantOption>;
  existing: Record<string, ExistingLine>;
  fxRate: number | null;
}) {
  const word = actual ? "Gerçekleşen" : "Tahmini";
  return (
    <>
      {/* Geniş ekran: tablo */}
      <TableWrap className="hidden xl:block">
        <table className="table-base">
          <thead>
            <tr>
              <th rowSpan={2} className="align-bottom">
                Varyant
              </th>
              <th rowSpan={2} className="num align-bottom">
                Adet
              </th>
              <th colSpan={3} className="border-l border-line text-center!">
                Birim fiyat ve indirim ({currency})
              </th>
              <th rowSpan={2} className="num border-l border-line align-bottom">
                Tutar ({currency})
              </th>
              {showStock ? (
                <th rowSpan={2} className="num align-bottom" title="Mekonsis rafında satışa hazır adet">
                  Mekonsis
                  <br />
                  stoğu
                </th>
              ) : null}
              <th colSpan={3} className="border-l border-line text-center!" title={actual ? "Satışta düşülen partilerden" : "Mekonsis rafındaki partilerden en eskiden başlayarak tahmin; stok düşürmez"}>
                {word} ({actual ? "gerçekleşen" : "önizleme"}, ₺)
              </th>
              {editable ? <th rowSpan={2} aria-label="İşlemler" /> : null}
            </tr>
            <tr>
              <th className="num border-l border-line" title="Varyantın tanımlı satış fiyatı (normal fiyat)">
                Liste
              </th>
              <th className="num">Özel</th>
              <th className="num" title="Liste fiyatına göre satır indirimi, yüzde ve birim indirim">
                İndirim
              </th>
              <th className="num border-l border-line">Maliyet</th>
              <th className="num">Brüt kâr</th>
              <th className="num">Marj</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const l = r.line;
              return (
                <tr key={l.id}>
                  <td className="min-w-52 font-medium text-ink">{l.display_name}</td>
                  <td className="num">{fmtInt(l.quantity)}</td>
                  <td className="num border-l border-line">
                    {r.listPrice !== null ? fmtUnitMoney(r.listPrice, r.listCurrency ?? currency) : <span className="text-xs text-ink-muted">tanımsız</span>}
                  </td>
                  <td className="num font-medium text-ink">{fmtUnitMoney(l.unit_price, currency)}</td>
                  <td className="num">
                    <Discount row={r} currency={currency} />
                  </td>
                  <td className="num border-l border-line font-semibold text-ink">{fmtMoney(l.line_total, currency)}</td>
                  {showStock ? (
                    <td className="num">
                      {fmtInt(l.mekonsis_available)}
                      {l.shortage > 0 ? (
                        <div className="mt-0.5">
                          <Badge tone="red" icon={AlertTriangle}>
                            {fmtInt(l.shortage)} eksik
                          </Badge>
                        </div>
                      ) : null}
                    </td>
                  ) : null}
                  <td className="num border-l border-line">
                    {fmtMoney(r.costTry, "TRY")}
                    {!actual && l.cost_unknown ? (
                      <div className="mt-0.5 flex items-center justify-end gap-1 text-xs text-ink-soft">
                        <Info className="size-3 shrink-0 text-chart-amber" aria-hidden />
                        maliyet bilinmiyor
                      </div>
                    ) : null}
                  </td>
                  <td className={cx("num font-medium", r.profitTry !== null && r.profitTry < 0 ? neg : "text-ink")}>{fmtMoney(r.profitTry, "TRY")}</td>
                  <td className="num">{fmtPct(r.marginPct)}</td>
                  {editable ? (
                    <td>
                      <LineActions quoteId={quoteId} quoteNo={quoteNo} currency={currency} line={l} option={editOptions[l.id]} existing={existing} fxRate={fxRate} />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Toplam</td>
              <td className="num">{fmtInt(totals.quantity)}</td>
              <td className="num border-l border-line" title="Karşılaştırılabilir liste fiyatı olan kalemlerin liste tutarı">
                {totals.listTotal !== null ? fmtMoney(totals.listTotal, currency) : "—"}
              </td>
              <td />
              <td className="num">
                {totals.discountTotal !== null ? (
                  <>
                    {fmtMoney(totals.discountTotal, currency)}
                    <div className="text-xs font-normal text-ink-muted">{fmtPct(totals.discountPct)}</div>
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="num border-l border-line">{fmtMoney(totals.amount, currency)}</td>
              {showStock ? <td /> : null}
              <td className="num border-l border-line">{totals.costTry !== null ? fmtMoney(totals.costTry, "TRY") : "—"}</td>
              <td className={cx("num", totals.profitTry !== null && totals.profitTry < 0 && neg)}>{totals.profitTry !== null ? fmtMoney(totals.profitTry, "TRY") : "—"}</td>
              <td className="num">{fmtPct(totals.marginPct)}</td>
              {editable ? <td /> : null}
            </tr>
          </tfoot>
        </table>
      </TableWrap>

      {/* Tablet ve mobil: kart listesi */}
      <ul className="grid grid-cols-1 md:grid-cols-2 xl:hidden">
        {rows.map((r) => {
          const l = r.line;
          return (
            <li key={l.id} className="min-w-0 border-b border-line px-4 py-3.5 md:odd:border-r">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium break-words text-ink">{l.display_name}</p>
                  <p className="mt-0.5 text-xs text-ink-muted tabular-nums">
                    {fmtInt(l.quantity)} adet × {fmtUnitMoney(l.unit_price, currency)}
                  </p>
                </div>
                {editable ? (
                  <div className="-mt-1 -mr-2 shrink-0">
                    <LineActions quoteId={quoteId} quoteNo={quoteNo} currency={currency} line={l} option={editOptions[l.id]} existing={existing} fxRate={fxRate} />
                  </div>
                ) : null}
              </div>
              <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
                <div className="min-w-0">
                  <dt className="text-xs text-ink-muted">Tutar</dt>
                  <dd className="font-semibold text-ink tabular-nums">{fmtMoney(l.line_total, currency)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-ink-muted">Liste fiyatı</dt>
                  <dd className="tabular-nums">{r.listPrice !== null ? fmtUnitMoney(r.listPrice, r.listCurrency ?? currency) : "—"}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-ink-muted">İndirim</dt>
                  <dd className="tabular-nums">
                    <Discount row={r} currency={currency} align="left" />
                  </dd>
                </div>
                {showStock ? (
                  <div className="min-w-0">
                    <dt className="text-xs text-ink-muted">Mekonsis stoğu</dt>
                    <dd className="tabular-nums">
                      {fmtInt(l.mekonsis_available)} adet
                      {l.shortage > 0 ? (
                        <span className="mt-0.5 block">
                          <Badge tone="red" icon={AlertTriangle}>
                            {fmtInt(l.shortage)} eksik
                          </Badge>
                        </span>
                      ) : null}
                    </dd>
                  </div>
                ) : null}
                <div className="min-w-0">
                  <dt className="text-xs text-ink-muted">{word} maliyet</dt>
                  <dd className="tabular-nums">
                    {fmtMoney(r.costTry, "TRY")}
                    {!actual && l.cost_unknown ? (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-soft">
                        <Info className="size-3 shrink-0 text-chart-amber" aria-hidden />
                        maliyet bilinmiyor
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-ink-muted">{word} brüt kâr</dt>
                  <dd className={cx("font-medium tabular-nums", r.profitTry !== null && r.profitTry < 0 ? neg : "text-ink")}>
                    {fmtMoney(r.profitTry, "TRY")} <span className="text-xs font-normal text-ink-muted">{fmtPct(r.marginPct)}</span>
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
        <li className="bg-canvas px-4 py-3 text-[13px] md:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="font-semibold text-ink">Toplam · {fmtInt(totals.quantity)} adet</span>
            <span className="font-semibold text-ink tabular-nums">{fmtMoney(totals.amount, currency)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-ink-muted tabular-nums">
            <span>
              {word} maliyet {totals.costTry !== null ? fmtMoney(totals.costTry, "TRY") : "—"}
            </span>
            <span>
              {word} brüt kâr {totals.profitTry !== null ? fmtMoney(totals.profitTry, "TRY") : "—"} · {fmtPct(totals.marginPct)}
            </span>
          </div>
        </li>
      </ul>
    </>
  );
}

function LineActions({
  quoteId,
  quoteNo,
  currency,
  line,
  option,
  existing,
  fxRate,
}: {
  quoteId: string;
  quoteNo: string;
  currency: Currency;
  line: QuoteEstimateLine;
  option: QuoteVariantOption;
  existing: Record<string, ExistingLine>;
  fxRate: number | null;
}) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      <Modal
        trigger={<Pencil aria-hidden />}
        triggerLabel={`Kalemi düzenle: ${line.display_name}`}
        triggerVariant="ghost"
        triggerSize="sm"
        triggerClassName="size-8 px-0"
        title="Kalemi düzenle"
        description={`${quoteNo} · adet ve özel fiyatı güncelleyin`}
        size="md"
      >
        {/* Pencere DOM'da tablo hücresinin içinde; hücrenin hizalama ve satır sarma stilleri miras alınmasın. */}
        <div className="text-left font-normal whitespace-normal">
          <QuoteItemForm quoteId={quoteId} currency={currency} variants={[option]} fxRate={fxRate} existing={existing} fixedVariantId={line.variant_id} />
        </div>
      </Modal>
      <ActionForm action={deleteQuoteItem} confirmMessage={`“${line.display_name}” kalemi tekliften silinsin mi?`}>
        <input type="hidden" name="id" value={line.id} />
        <button
          type="submit"
          className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-chart-red/10 hover:text-chart-red focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none"
          aria-label={`Kalemi sil: ${line.display_name}`}
          title="Kalemi sil"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </ActionForm>
    </div>
  );
}

function Discount({ row, currency, align = "right" }: { row: QuoteLineRow; currency: Currency; align?: "left" | "right" }) {
  if (row.discountUnit === null) return <span className="text-xs text-ink-muted" title="Liste fiyatı tanımsız veya farklı para biriminde">—</span>;
  if (row.discountUnit === 0) return <span className="text-xs text-ink-muted">Liste fiyatı</span>;
  const above = row.discountUnit < 0;
  const total = Math.abs(row.discountUnit) * row.line.quantity;
  return (
    <>
      <span className={cx("font-medium", above ? "text-chart-sky" : "text-ink")}>
        {above ? "+" : "−"}
        {fmtMoney(total, currency)}
      </span>
      <div className={cx("text-xs text-ink-muted", align === "right" ? "text-right" : undefined)}>
        {above ? "listenin üstünde " : ""}
        {fmtPct(Math.abs(row.discountPct ?? 0))} · {fmtUnitMoney(Math.abs(row.discountUnit), currency)}/adet
      </div>
    </>
  );
}
