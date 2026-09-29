import { AlertTriangle, ArrowRightLeft, Ban, CheckCircle2, CircleDashed, Coins, ExternalLink, FileText, Layers, ListPlus, Pencil, Percent, RotateCcw, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { fxSourceLabel } from "@/components/FxBadge";
import { QuoteStatusBadge, SaleStatusBadge } from "@/components/status";
import { Alert, Badge, ButtonLink, Card, DefinitionList, EmptyState, ErrorState, PageHeader, StatCard, cx } from "@/components/ui";
import { Drawer } from "@/components/ui/dialog";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtInt, fmtMoney, fmtPct, fmtRate, todayTr } from "@/lib/format";
import { isUuid } from "@/lib/parse";
import { load, must } from "@/lib/query";
import type { QuoteEstimate, QuoteView, SaleItemView, SaleView } from "@/lib/types";
import { setQuoteStatus, updateQuote } from "../../actions";
import { LoadFailed } from "../../_components/bits";
import { daysBetween } from "../../_components/paging";
import type { QuoteItemOptionRow } from "../../_components/types";
import { ConvertForm } from "../ConvertForm";
import { QuoteItemForm, type ExistingLine, type QuoteVariantOption } from "../ItemForm";
import { QuoteInfoFields } from "../QuoteInfoFields";
import { QuoteLinesChart, type QuoteLinePoint } from "../QuoteLinesChart";
import { QuoteLinesTable, type QuoteLineRow, type QuoteLineTotals } from "../QuoteLinesTable";

export const metadata: Metadata = { title: "Teklif" };

type ContactRow = { contact_name: string | null; phone: string | null; email: string | null };
type SaleItemRow = Pick<SaleItemView, "variant_id" | "quantity" | "list_price" | "list_currency" | "revenue_try" | "cogs_try" | "gross_profit_try">;

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, ctx] = await Promise.all([params, requireMember()]);
  if (!isUuid(id)) notFound();
  const quote = await must(ctx.supabase.from("v_quotes").select("*").eq("id", id).maybeSingle<QuoteView>(), "Teklif");
  if (!quote) notFound();

  const isAdmin = ctx.role === "admin";
  const open = quote.status === "open";
  const converted = quote.status === "converted" && !!quote.sale_id;
  const editable = isAdmin && open;
  const today = todayTr();

  const [estRes, contact, optionsRes, saleRes, saleItemsRes] = await Promise.all([
    load(ctx.supabase.rpc("quote_estimate", { p_quote_id: id })),
    load(ctx.supabase.from("customers").select("contact_name, phone, email").eq("id", quote.customer_id).maybeSingle<ContactRow>()),
    // Kalem formu önizlemesi: varyant başına FIFO katmanları ve son parti maliyeti tek satırda
    // (quote_estimate ile aynı kural; tüm katman/parti satırları istemciye taşınmaz).
    editable ? load(ctx.supabase.rpc("quote_item_options", { p_quote_id: id })) : null,
    converted ? load(ctx.supabase.from("v_sales").select("*").eq("id", quote.sale_id!).maybeSingle<SaleView>()) : null,
    converted
      ? load(
          ctx.supabase
            .from("v_sale_items")
            .select("variant_id, quantity, list_price, list_currency, revenue_try, cogs_try, gross_profit_try")
            .eq("sale_id", quote.sale_id!)
            .returns<SaleItemRow[]>(),
        )
      : null,
  ]);

  const estimate = estRes.data as QuoteEstimate | null;
  const estError = estRes.error;
  const lines = estimate?.lines ?? [];
  const sale = saleRes?.data ?? null;
  const saleItemByVariant = new Map((saleItemsRes?.data ?? []).map((s) => [s.variant_id, s]));
  const actual = converted && !!sale && !saleItemsRes?.error;
  const actualError = converted ? (saleRes?.error ?? saleItemsRes?.error ?? null) : null;
  const word = actual ? "Gerçekleşen" : "Tahmini";

  // Kalem satırları: açık teklifte FIFO önizlemesi, dönüşen teklifte gerçekleşen satış kalemleri.
  const rows: QuoteLineRow[] = lines.map((l) => {
    const si = actual ? saleItemByVariant.get(l.variant_id) : undefined;
    const listPrice = si ? si.list_price : l.list_price;
    const listCurrency = si ? si.list_currency : l.list_currency;
    const comparable = listPrice !== null && listPrice > 0 && listCurrency === quote.currency;
    return {
      line: l,
      listPrice,
      listCurrency,
      comparable,
      discountUnit: comparable ? listPrice! - l.unit_price : null,
      discountPct: comparable ? ((listPrice! - l.unit_price) / listPrice!) * 100 : null,
      revenueTry: si ? si.revenue_try : l.revenue_try,
      costTry: si ? si.cogs_try : l.cost_try,
      profitTry: si ? si.gross_profit_try : l.gross_profit_try,
      marginPct: si ? (si.revenue_try > 0 ? (si.gross_profit_try / si.revenue_try) * 100 : null) : l.margin_pct,
    };
  });

  // Kalem varlığı teklif görünümünden okunur; tahmin hesaplanamasa bile "kalem yok" denmez.
  const hasLines = quote.item_count > 0;
  const comparableRows = rows.filter((r) => r.comparable);
  const listTotal = comparableRows.reduce((a, r) => a + r.listPrice! * r.line.quantity, 0);
  const comparableAmount = comparableRows.reduce((a, r) => a + r.line.line_total, 0);
  const discountTotal = comparableRows.length ? listTotal - comparableAmount : null;
  const discountPct = comparableRows.length && listTotal > 0 ? (discountTotal! / listTotal) * 100 : null;
  const allComparable = comparableRows.length === rows.length;

  const revenueTry = actual ? sale!.revenue_try : (estimate?.revenue_try ?? null);
  const costTry = actual ? sale!.cogs_try : (estimate?.cost_try ?? null);
  const profitTry = actual ? sale!.gross_profit_try : (estimate?.gross_profit_try ?? null);
  const marginPct = actual ? sale!.margin_pct : (estimate?.margin_pct ?? null);
  // Değerler hesaplanamıyorsa (tahmin hatası, gerçekleşen değerlerde hata yok) kartlarda bu gösterilir.
  const figuresFailed = !actual && !!estError;
  const totals: QuoteLineTotals = {
    quantity: lines.reduce((a, l) => a + l.quantity, 0),
    listTotal: comparableRows.length ? listTotal : null,
    discountTotal,
    discountPct,
    amount: quote.total_amount,
    costTry,
    profitTry,
    marginPct,
  };

  const shortageCount = open ? lines.filter((l) => l.shortage > 0).length : 0;
  const expired = open && !!quote.valid_until && quote.valid_until < today;
  const daysLeft = quote.valid_until ? daysBetween(today, quote.valid_until) : null;
  const fxRate = estimate?.fx?.rate ?? null;

  // Kalem formu: seçenekler, FIFO katmanları ve son parti maliyeti
  const optionRows = (optionsRes?.data ?? []) as QuoteItemOptionRow[];
  const toOption = (o: QuoteItemOptionRow): QuoteVariantOption => ({
    id: o.variant_id,
    display_name: o.display_name,
    sale_price: o.sale_price === null ? null : Number(o.sale_price),
    currency: o.currency,
    mekonsis_qty: o.mekonsis_qty,
    layers: (o.layers ?? []).map(([q, c]) => [Number(q), Number(c)] as [number, number]),
    fallback_cost_try: o.last_unit_cost_try === null ? null : Number(o.last_unit_cost_try),
  });
  const optionById = new Map(optionRows.map((o) => [o.variant_id, toOption(o)]));
  const options: QuoteVariantOption[] = optionRows.filter((o) => o.is_active).map((o) => optionById.get(o.variant_id)!);
  const existing: Record<string, ExistingLine> = Object.fromEntries(lines.map((l) => [l.variant_id, { quantity: l.quantity, unit_price: l.unit_price }]));
  const editOptions: Record<string, QuoteVariantOption> = Object.fromEntries(
    lines.map((l) => [
      l.id,
      optionById.get(l.variant_id) ?? {
        id: l.variant_id,
        display_name: l.display_name,
        sale_price: l.list_price,
        currency: l.list_currency ?? quote.currency,
        mekonsis_qty: l.mekonsis_available,
        layers: [],
        fallback_cost_try: null,
      },
    ]),
  );
  const formError = optionsRes?.error ?? null;

  const chartLines: QuoteLinePoint[] = rows.map((r) => ({
    key: r.line.id,
    label: r.line.display_name,
    quantity: r.line.quantity,
    revenue_try: r.revenueTry,
    cost_try: r.costTry,
    profit_try: r.profitTry,
  }));
  const canConvert = hasLines && shortageCount === 0 && !estError;
  const failedNote = "Tahmin hesaplanamadı";

  return (
    <>
      <PageHeader
        back={{ href: `/musteriler/${quote.customer_id}`, label: quote.customer_name }}
        title={`Teklif ${quote.quote_no}`}
        meta={<QuoteStatusBadge status={quote.status} />}
        description={
          <>
            <Link href={`/musteriler/${quote.customer_id}`} className="link font-normal">
              {quote.customer_name}
            </Link>{" "}
            için toplu satış teklifi · <span className="font-medium text-ink-soft">{quote.currency}</span> · teklif tarihi {fmtDate(quote.quote_date)}
            {quote.valid_until ? ` · geçerlilik ${fmtDate(quote.valid_until)}` : ""}
          </>
        }
        actions={
          <>
            {converted ? (
              <ButtonLink href={`/satislar/${quote.sale_id}`} variant="outline">
                <ExternalLink aria-hidden />
                Satışı aç
              </ButtonLink>
            ) : null}
            {isAdmin && quote.status !== "converted" ? (
              <ActionForm action={setQuoteStatus} confirmMessage={open ? "Teklif iptal edilsin mi? İptal edilen teklif satışa dönüştürülemez." : "Teklif yeniden açılsın mı?"}>
                <input type="hidden" name="id" value={quote.id} />
                <input type="hidden" name="status" value={open ? "cancelled" : "open"} />
                <SubmitButton variant="secondary">
                  {open ? <Ban aria-hidden /> : <RotateCcw aria-hidden />}
                  {open ? "Teklifi iptal et" : "Teklifi yeniden aç"}
                </SubmitButton>
              </ActionForm>
            ) : null}
          </>
        }
      />

      <div className="mb-4 space-y-3">
        {converted ? (
          <Alert tone="success" title="Satışa dönüştü">
            Bu teklif{" "}
            <Link className="link" href={`/satislar/${quote.sale_id}`}>
              {quote.sale_no}
            </Link>{" "}
            numaralı satışa dönüştürüldü{sale ? `; satış tarihi ${fmtDate(sale.sold_on)}, işlem kuru ${fmtRate(sale.fx_rate)} (${fxSourceLabel(sale.fx_source)})` : ""}. Teklif artık
            değiştirilemez; satış iptal edilirse teklif yeniden açılır.
          </Alert>
        ) : quote.status === "cancelled" ? (
          <Alert tone="warning" title="Teklif iptal edildi">
            İptal edilen teklif satışa dönüştürülemez.{isAdmin ? " “Teklifi yeniden aç” ile düzenlemeye devam edebilirsiniz." : ""} Aşağıdaki tahmini değerler bilgi amaçlıdır.
          </Alert>
        ) : (
          <Alert tone={expired ? "warning" : "info"} title={expired ? "Açık teklif — geçerlilik süresi doldu" : "Açık teklif — henüz satışa dönüşmedi"}>
            Teklif stok düşürmez.{" "}
            {expired
              ? `Geçerlilik ${fmtDate(quote.valid_until)} günü sona erdi; fiyatları gözden geçirip geçerlilik tarihini güncelleyin. `
              : daysLeft !== null
                ? `Geçerliliğin bitmesine ${daysLeft === 0 ? "bugün son gün" : `${fmtInt(daysLeft)} gün var`}. `
                : ""}
            “Satışa Dönüştür” güncel Mekonsis stoğunu yeniden kontrol eder ve satışı yalnızca bir kez oluşturur.
          </Alert>
        )}
        {actualError ? (
          <Alert tone="error" title="Gerçekleşen satış değerleri yüklenemedi">
            {actualError} Aşağıdaki maliyet ve kâr, güncel raf önizlemesine göre tahmini değerlerdir.
          </Alert>
        ) : null}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Teklif tutarı"
          value={fmtMoney(quote.total_amount, quote.currency)}
          icon={FileText}
          tone="brand"
          description={`${fmtInt(quote.item_count)} kalem · ${fmtInt(quote.total_quantity)} adet`}
        />
        <StatCard
          label="Toplam indirim"
          value={discountTotal === null ? "—" : fmtMoney(discountTotal, quote.currency)}
          icon={Percent}
          tone="violet"
          description={
            !hasLines
              ? "Kalem eklenince hesaplanır"
              : estError
                ? `${failedNote}; kalem fiyatları okunamadı`
                : discountTotal === null
                  ? "Karşılaştırılabilir liste fiyatı yok (farklı para birimi veya tanımsız)"
                  : `Liste fiyatına göre ${fmtPct(discountPct)} · liste tutarı ${fmtMoney(listTotal, quote.currency)}${allComparable ? "" : ` (${fmtInt(comparableRows.length)}/${fmtInt(rows.length)} kalem)`}`
          }
        />
        <StatCard
          label={`${word} maliyet`}
          value={costTry === null || !hasLines || figuresFailed ? "—" : fmtMoney(costTry, "TRY")}
          icon={Layers}
          tone="amber"
          description={
            figuresFailed && hasLines
              ? failedNote
              : actual
                ? "Satışta düşülen partilerin maliyeti"
                : "Önizleme · Mekonsis rafındaki partilerden; stok düşürmez"
          }
        />
        <StatCard
          label={`${word} brüt kâr`}
          value={profitTry === null || !hasLines || figuresFailed ? "—" : fmtMoney(profitTry, "TRY")}
          icon={Coins}
          tone={profitTry !== null && profitTry < 0 ? "red" : "teal"}
          description={
            !hasLines
              ? "Kalem eklenince hesaplanır"
              : figuresFailed
                ? failedNote
                : revenueTry === null
                  ? "Güncel kur olmadığından TL ciro hesaplanamadı"
                  : `${word} ciro ${fmtMoney(revenueTry, "TRY")} · marj ${fmtPct(marginPct)}`
          }
        />
      </div>

      <Card
        title="Teklif kalemleri"
        icon={ListPlus}
        description={
          actual
            ? "Maliyet ve kâr, satışta düşülen partilerden gerçekleşen değerlerdir."
            : "Maliyet, Mekonsis rafındaki partilerden en eskiden başlayarak tahmin edilir; stok yetmeyen kısım için son tamamlanan partinin birim maliyeti kullanılır."
        }
        padded={false}
        className="mb-4"
      >
        {shortageCount > 0 ? (
          <div className="border-b border-line px-4 py-3">
            <Alert tone="warning" title="Mekonsis rafında yetersiz stok">
              {fmtInt(shortageCount)} kalem için Mekonsis rafında yeterli stok yok; bu hâliyle satışa dönüştürme reddedilir. Teslimat yapın veya adetleri güncelleyin.
            </Alert>
          </div>
        ) : null}
        {estError ? (
          <ErrorState title={`${failedNote}; ${fmtInt(quote.item_count)} kalem gösterilemiyor`} message={estError} compact />
        ) : !hasLines || rows.length === 0 ? (
          <EmptyState icon={ListPlus} title="Teklifte kalem yok" compact>
            {editable ? "Aşağıdan varyant, adet ve özel birim fiyat ekleyin." : "Bu teklife kalem eklenmemiş."}
          </EmptyState>
        ) : (
          <QuoteLinesTable
            quoteId={quote.id}
            quoteNo={quote.quote_no}
            currency={quote.currency}
            rows={rows}
            totals={totals}
            actual={actual}
            showStock={!actual}
            editable={editable}
            editOptions={editOptions}
            existing={existing}
            fxRate={fxRate}
          />
        )}
        {editable ? (
          <div id="kalem-ekle" className="border-t border-line px-4 py-4">
            <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink">
              <ListPlus className="size-4 text-ink-muted" aria-hidden />
              Kalem ekle veya güncelle
            </h3>
            {formError ? (
              <ErrorState title="Varyant listesi yüklenemedi" message={formError} compact />
            ) : (
              <QuoteItemForm quoteId={quote.id} currency={quote.currency} variants={options} fxRate={fxRate} existing={existing} />
            )}
          </div>
        ) : null}
      </Card>

      {/*
        Geniş ekranda iki sütun (sol: toplamlar + grafik, sağ: dönüştürme + bilgiler).
        Tablet ve mobilde sütun sarmalayıcıları "contents" olur ve kartlar order ile sıralanır:
        ana işlem ("Satışa dönüştür") grafiğin altında kalmaz.
      */}
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
        <div className="contents xl:grid xl:min-w-0 xl:content-start xl:gap-4">
          <Card
            title={actual ? "Fiyat ve kâr özeti" : "Toplamlar ve tahmini kâr"}
            icon={Coins}
            description={actual ? "Gerçekleşen satışa göre" : "Tahmin stok düşürmez; kesin değerler satışa dönüştürmede hesaplanır."}
            className="order-3 xl:order-none"
          >
            {figuresFailed && hasLines ? (
              <ErrorState title={failedNote} message={estError!} compact />
            ) : (
              <>
                <DefinitionList
                  items={[
                    ["Liste fiyatıyla tutar", comparableRows.length ? fmtMoney(listTotal, quote.currency) : "—"],
                    ["Toplam indirim", discountTotal !== null ? `${fmtMoney(discountTotal, quote.currency)} · ${fmtPct(discountPct)}` : "—"],
                    ["Teklif tutarı", <strong key="t">{fmtMoney(quote.total_amount, quote.currency)}</strong>],
                    [`${word} ciro (₺)`, hasLines ? fmtMoney(revenueTry, "TRY") : "—"],
                    [actual ? "Maliyet (₺)" : "Tahmini maliyet (₺)", costTry !== null && hasLines ? fmtMoney(costTry, "TRY") : "—"],
                    [
                      `${word} brüt kâr (₺)`,
                      <strong key="k" className={profitTry !== null && profitTry < 0 ? "text-chart-red" : undefined}>
                        {hasLines ? fmtMoney(profitTry, "TRY") : "—"}
                      </strong>,
                    ],
                    [`${word} marj`, fmtPct(marginPct)],
                    [
                      actual ? "İşlem kuru (satış)" : "Kullanılan kur (güncel)",
                      actual && sale
                        ? `${fmtRate(sale.fx_rate)} · ${fxSourceLabel(sale.fx_source)}, ${fmtDate(sale.fx_rate_date)}`
                        : estimate?.fx
                          ? `${fmtRate(estimate.fx.rate)} · ${fxSourceLabel(estimate.fx.source)}, ${fmtDate(estimate.fx.rate_date)}`
                          : "Kur yok",
                    ],
                  ]}
                />
                {!actual && estimate ? (
                  <div className="mt-3 space-y-2">
                    {estimate.cost_unknown ? <Alert tone="warning">Hiç üretilmemiş varyantların maliyeti bilinmiyor; kâr olduğundan yüksek görünebilir.</Alert> : null}
                    {estimate.fx && !estimate.fx.is_valid ? <Alert tone="warning">Güncel kur eski; TL tahmini yaklaşık değerdir.</Alert> : null}
                    {!allComparable && hasLines ? (
                      <p className="text-xs text-ink-muted">
                        İndirim yalnız liste fiyatı teklif para biriminde ({quote.currency}) tanımlı kalemler için hesaplanır ({fmtInt(comparableRows.length)}/{fmtInt(rows.length)} kalem).
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </Card>

          {/* Tahmin hatası "Teklif kalemleri" kartında gösterilir; grafik ikinci kez hata göstermez. */}
          {chartLines.length > 0 ? (
            <Card title="Kalem bazında ciro ve maliyet" description={`${word} değerler, TL · çubuklar arasındaki fark brüt kârdır`} className="order-4 xl:order-none">
              <QuoteLinesChart lines={chartLines} actual={actual} />
            </Card>
          ) : null}
        </div>

        <div className="contents xl:grid xl:min-w-0 xl:content-start xl:gap-4">
          {editable ? (
            <Card
              title="Satışa dönüştür"
              icon={ArrowRightLeft}
              description="Güncel Mekonsis stoğu yeniden kontrol edilir; satış yalnızca bir kez oluşturulur."
              className="order-1 xl:order-none"
            >
              <ul className="mb-4 space-y-2 text-[13px]">
                <Check ok={hasLines} okText={`${fmtInt(quote.item_count)} kalem, ${fmtInt(quote.total_quantity)} adet`} failText="Teklifte kalem yok" />
                {estError && hasLines ? (
                  <Check ok={false} okText="" failText="Tahmin hesaplanamadı; Mekonsis stoğu kontrol edilemedi" />
                ) : (
                  <Check
                    ok={hasLines && shortageCount === 0}
                    pending={!hasLines}
                    okText="Mekonsis rafında stok yeterli"
                    failText={!hasLines ? "Stok kontrolü için kalem ekleyin" : `${fmtInt(shortageCount)} kalemde Mekonsis stoğu yetersiz`}
                  />
                )}
              </ul>
              <ConvertForm quoteId={quote.id} today={today} disabled={!canConvert} />
            </Card>
          ) : null}

          {converted ? (
            <Card title="Satış bilgisi" icon={CheckCircle2} className="order-2 xl:order-none">
              {saleRes?.error ? (
                <ErrorState message={saleRes.error} compact />
              ) : sale ? (
                <DefinitionList
                  columns={1}
                  items={[
                    [
                      "Satış no",
                      <Link key="s" className="link font-mono text-xs whitespace-nowrap" href={`/satislar/${sale.id}`}>
                        {sale.sale_no}
                      </Link>,
                    ],
                    ["Satış tarihi", fmtDate(sale.sold_on)],
                    ["Durum", <SaleStatusBadge key="d" status={sale.status} />],
                    ["İşlem kuru", `${fmtRate(sale.fx_rate)} · ${fxSourceLabel(sale.fx_source)}`],
                    ["Ciro (₺)", fmtMoney(sale.revenue_try, "TRY")],
                    ["Brüt kâr (₺)", fmtMoney(sale.gross_profit_try, "TRY")],
                  ]}
                />
              ) : (
                <p className="text-[13px] text-ink-muted">Satış kaydı bulunamadı.</p>
              )}
            </Card>
          ) : null}

          <Card
            title="Teklif bilgileri"
            icon={FileText}
            className="order-5 xl:order-none"
            actions={
              editable ? (
                <Drawer
                  trigger={
                    <>
                      <Pencil aria-hidden />
                      Düzenle
                    </>
                  }
                  triggerVariant="secondary"
                  triggerSize="sm"
                  title="Teklif bilgilerini düzenle"
                  description={`${quote.quote_no} · ${quote.customer_name}`}
                  size="sm"
                >
                  <ActionForm action={updateQuote}>
                    <input type="hidden" name="id" value={quote.id} />
                    <QuoteInfoFields quote={quote} />
                    <div className="mt-5 flex justify-end border-t border-line pt-4">
                      <SubmitButton>Kaydet</SubmitButton>
                    </div>
                  </ActionForm>
                </Drawer>
              ) : null
            }
          >
            <DefinitionList
              columns={1}
              items={[
                [
                  "Müşteri",
                  <Link key="m" className="link" href={`/musteriler/${quote.customer_id}`}>
                    {quote.customer_name}
                  </Link>,
                ],
                ["Yetkili", contactValue(contact, (c) => c.contact_name)],
                [
                  "Telefon",
                  contactValue(contact, (c) =>
                    c.phone ? (
                      <a className="link font-normal tabular-nums" href={`tel:${c.phone.replace(/\s+/g, "")}`}>
                        {c.phone}
                      </a>
                    ) : null,
                  ),
                ],
                [
                  "E-posta",
                  contactValue(contact, (c) =>
                    c.email ? (
                      <a className="link font-normal break-all" href={`mailto:${c.email}`}>
                        {c.email}
                      </a>
                    ) : null,
                  ),
                ],
                ["Teklif tarihi", fmtDate(quote.quote_date)],
                [
                  "Geçerlilik",
                  quote.valid_until ? (
                    <span key="g" className="inline-flex flex-wrap items-center justify-end gap-1.5">
                      {fmtDate(quote.valid_until)}
                      {expired ? (
                        <Badge tone="amber" icon={AlertTriangle}>
                          Süresi doldu
                        </Badge>
                      ) : null}
                    </span>
                  ) : (
                    "Süre sınırı yok"
                  ),
                ],
                ["Para birimi", quote.currency],
                ["Oluşturulma", fmtDateTime(quote.created_at)],
              ]}
            />
            {quote.note ? (
              <div className="mt-3 rounded-md bg-canvas px-3 py-2 text-[13px] whitespace-pre-line text-ink-soft">
                <span className="mb-0.5 block text-xs font-medium text-ink-muted">Not</span>
                {quote.note}
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}

/** Müşteri iletişim alanı: sorgu hatası "—" ile gizlenmez; boş alan "—" olur. */
function contactValue(contact: { data: ContactRow | null; error: string | null }, pick: (c: ContactRow) => ReactNode): ReactNode {
  if (contact.error) return <LoadFailed message={contact.error} />;
  const v = contact.data ? pick(contact.data) : null;
  return v ?? "—";
}

function Check({ ok, okText, failText, pending = false }: { ok: boolean; okText: string; failText: string; pending?: boolean }) {
  const Icon = pending ? CircleDashed : ok ? CheckCircle2 : XCircle;
  return (
    <li className="flex items-start gap-2">
      <Icon className={cx("mt-px size-4 shrink-0", pending ? "text-ink-muted" : ok ? "text-chart-teal" : "text-chart-red")} aria-hidden />
      <span className={pending ? "text-ink-muted" : ok ? "text-ink-soft" : "font-medium text-ink"}>{ok ? okText : failText}</span>
    </li>
  );
}
