import { ArrowLeftRight, Ban, Factory, PackageOpen, Receipt, Truck, Undo2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Badge, Card, EmptyState, ErrorState, TableWrap, type BadgeTone } from "@/components/ui";
import { Pagination, SortTh } from "@/components/ui/list";
import type { AuthContext } from "@/lib/auth";
import { fmtDate, fmtInt, fmtMoney, fmtUnitMoney } from "@/lib/format";
import { isoDateOrNull, type ListParams } from "@/lib/list-params";
import { load } from "@/lib/query";
import { redirectIfPageOutOfRange } from "./paging";
import { TabToolbar } from "./TabToolbar";
import type { MovementRow, MovementType } from "./types";

type MovementMeta = { label: string; tone: BadgeTone; icon: LucideIcon; hint: string };

/** Stok hareket türlerinin Türkçe etiketleri (renk + ikon + metin). */
export const MOVEMENT: Record<MovementType, MovementMeta> = {
  production_in: { label: "Üretim girişi", tone: "green", icon: Factory, hint: "Tamamlanan üretim partisi Heatemp rafına girdi" },
  delivery_out: { label: "Teslimat çıkışı", tone: "sky", icon: Truck, hint: "Heatemp rafından Mekonsis'e teslim edildi (satış değildir)" },
  delivery_in: { label: "Teslimat girişi", tone: "sky", icon: ArrowLeftRight, hint: "Mekonsis rafına teslimatla girdi (satış değildir)" },
  sale_out: { label: "Satış çıkışı", tone: "blue", icon: Receipt, hint: "Mekonsis satışıyla raftan çıktı" },
  sale_return: { label: "Satış iptali iadesi", tone: "amber", icon: Undo2, hint: "İptal edilen satışın adedi Mekonsis rafına döndü" },
  delivery_reversal_out: { label: "Teslimat iptali çıkışı", tone: "gray", icon: Undo2, hint: "İptal edilen teslimat Mekonsis rafından düşüldü" },
  delivery_reversal_in: { label: "Teslimat iptali girişi", tone: "gray", icon: Undo2, hint: "İptal edilen teslimat Heatemp rafına döndü" },
};

const OPENING: MovementMeta = { label: "Açılış stoğu girişi", tone: "violet", icon: PackageOpen, hint: "Sistem öncesi mevcut stok; üretim sayılmaz" };

export function movementMeta(row: Pick<MovementRow, "movement_type" | "production_batches">): MovementMeta {
  if (row.movement_type === "production_in" && row.production_batches?.kind === "opening") return OPENING;
  return MOVEMENT[row.movement_type] ?? { label: row.movement_type, tone: "gray", icon: ArrowLeftRight, hint: "" };
}

export const LOCATION_LABEL = { heatemp: "Heatemp rafı", mekonsis: "Mekonsis rafı" } as const;

const TYPE_FILTER: Record<string, { label: string; types: MovementType[]; kind?: "production" | "opening" }> = {
  uretim: { label: "Üretim girişi", types: ["production_in"], kind: "production" },
  acilis: { label: "Açılış stoğu girişi", types: ["production_in"], kind: "opening" },
  teslimat: { label: "Teslimat (çıkış/giriş)", types: ["delivery_out", "delivery_in"] },
  satis: { label: "Satış çıkışı", types: ["sale_out"] },
  iade: { label: "Satış iptali iadesi", types: ["sale_return"] },
  "teslimat-iptal": { label: "Teslimat iptali", types: ["delivery_reversal_out", "delivery_reversal_in"] },
};

export const MOVEMENT_SORTABLE = ["movement_date", "qty"];

/** Dar ekranda (tablo başlığı yokken) sıralama seçenekleri; SortTh ile aynı anahtarlar. */
const MOVEMENT_SORT_OPTIONS = [
  { value: "movement_date:desc", label: "En yeni önce" },
  { value: "movement_date:asc", label: "En eski önce" },
  { value: "qty:desc", label: "Miktar (azalan)" },
  { value: "qty:asc", label: "Miktar (artan)" },
];

/**
 * Sayfalı stok hareketleri (stock_movements). Sunucu tarafı filtre/sıralama/sayfalama;
 * tüm durum URL'de, sekme parametresi korunur.
 */
export async function StockMovementsCard({
  ctx,
  variants,
  basePath,
  lp,
  keep,
}: {
  ctx: AuthContext;
  /** Hareketleri gösterilecek varyantlar (ürün sayfasında hepsi, varyant sayfasında tek) */
  variants: { id: string; name: string; code: string }[];
  basePath: string;
  lp: ListParams;
  keep: Record<string, string>;
}) {
  const ids = variants.map((v) => v.id);
  const multi = variants.length > 1;
  const byId = new Map(variants.map((v) => [v.id, v]));
  const v = lp.values;

  let query = ctx.supabase
    .from("stock_movements")
    .select(
      "id, movement_date, movement_type, location, qty, unit_cost_try, unit_cost_usd, variant_id, batch_id, delivery_id, sale_id, created_at, production_batches!inner(batch_no, kind), deliveries(delivery_no, status), sales(sale_no, status)",
      { count: "exact" },
    )
    .in("variant_id", ids);
  const tf = v.tur ? TYPE_FILTER[v.tur] : undefined;
  if (tf) {
    query = query.in("movement_type", tf.types);
    if (tf.kind) query = query.eq("production_batches.kind", tf.kind);
  }
  if (v.konum === "heatemp" || v.konum === "mekonsis") query = query.eq("location", v.konum);
  if (multi && v.varyant && byId.has(v.varyant)) query = query.eq("variant_id", v.varyant);
  const from = isoDateOrNull(v.bas);
  const to = isoDateOrNull(v.bit);
  if (from) query = query.gte("movement_date", from);
  if (to) query = query.lte("movement_date", to);

  const res = await load(
    query
      .order(lp.sort ?? "movement_date", { ascending: lp.dir === "asc" })
      .order("id", { ascending: lp.dir === "asc" })
      .range(lp.from, lp.to)
      .returns<MovementRow[]>(),
  );
  redirectIfPageOutOfRange(res.error, lp, basePath, keep);
  const rows = res.data ?? [];
  const sortProps = { sort: lp.sort, dir: lp.dir, basePath, values: { ...lp.values, ...keep } };

  return (
    <Card
      title="Stok hareketleri"
      description="Heatemp ve Mekonsis raflarındaki tüm giriş/çıkışlar; birim maliyet, hareketin ait olduğu partinin maliyetidir."
      padded={false}
    >
      <TabToolbar
        basePath={basePath}
        values={lp.values}
        keep={keep}
        total={res.count}
        noun="hareket"
        filters={[
          { key: "tur", label: "Hareket türü", allLabel: "Tür: tümü", options: Object.entries(TYPE_FILTER).map(([value, f]) => ({ value, label: f.label })) },
          {
            key: "konum",
            label: "Raf",
            allLabel: "Raf: tümü",
            options: [
              { value: "heatemp", label: "Heatemp rafı" },
              { value: "mekonsis", label: "Mekonsis rafı" },
            ],
          },
          ...(multi ? [{ key: "varyant", label: "Varyant", options: variants.map((x) => ({ value: x.id, label: `${x.name} (${x.code})` })) }] : []),
        ]}
        sort={{ options: MOVEMENT_SORT_OPTIONS, sort: lp.sort, dir: lp.dir, mobileOnly: true }}
        dateRange={{ label: "Hareket tarihi" }}
      />
      {res.error ? (
        <ErrorState message={res.error} compact />
      ) : rows.length === 0 ? (
        <EmptyState title="Hareket bulunamadı" compact>
          {Object.keys(lp.values).some((k) => !["sekme", "sayfa", "adet", "sirala", "yon"].includes(k))
            ? "Seçilen filtrelere uyan stok hareketi yok."
            : "Bu kayıt için henüz üretim, teslimat veya satış hareketi yok."}
        </EmptyState>
      ) : (
        <>
          <TableWrap className="relative hidden sm:block">
            <table className="table-base">
              <thead>
                <tr>
                  <SortTh label="Tarih" column="movement_date" {...sortProps} />
                  <th>Hareket türü</th>
                  <SortTh label="Miktar (adet)" column="qty" align="right" {...sortProps} />
                  <th>Raf</th>
                  {multi ? <th>Varyant</th> : null}
                  <th className="num">Birim maliyet</th>
                  <th className="num" title="Miktar × hareketin parti birim maliyeti (TL). Satış tutarı değildir.">
                    Maliyet tutarı (TL)
                  </th>
                  <th>Belge</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const meta = movementMeta(r);
                  const variant = byId.get(r.variant_id);
                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap tabular-nums">{fmtDate(r.movement_date)}</td>
                      <td>
                        <Badge tone={meta.tone} icon={meta.icon} title={meta.hint}>
                          {meta.label}
                        </Badge>
                      </td>
                      <td className={r.qty > 0 ? "num font-semibold text-emerald-700" : "num font-semibold text-red-600"}>{signedQty(r.qty)}</td>
                      <td className="whitespace-nowrap">{LOCATION_LABEL[r.location]}</td>
                      {multi ? (
                        <td className="whitespace-nowrap">
                          {variant?.name ?? "—"} <span className="code text-ink-muted">{variant?.code}</span>
                        </td>
                      ) : null}
                      <td className="num">
                        {fmtUnitMoney(r.unit_cost_usd, "USD")}
                        <div className="text-xs text-ink-muted">{fmtUnitMoney(r.unit_cost_try, "TRY")}</div>
                      </td>
                      <td className="num">{fmtMoney(Number(r.qty) * Number(r.unit_cost_try), "TRY")}</td>
                      <td className="whitespace-nowrap">
                        <DocLinks row={r} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>

          {/* Mobil: kompakt liste */}
          <ul className="divide-y divide-line sm:hidden">
            {rows.map((r) => {
              const meta = movementMeta(r);
              const variant = byId.get(r.variant_id);
              return (
                <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] text-ink tabular-nums">{fmtDate(r.movement_date)}</span>
                      <Badge tone={meta.tone} icon={meta.icon} title={meta.hint}>
                        {meta.label}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-ink-muted">
                      {LOCATION_LABEL[r.location]}
                      {multi && variant ? ` · ${variant.name}` : ""} · {fmtUnitMoney(r.unit_cost_usd, "USD")}/adet
                    </div>
                    <div className="mt-0.5">
                      <DocLinks row={r} inline />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={r.qty > 0 ? "text-[15px] font-semibold text-emerald-700 tabular-nums" : "text-[15px] font-semibold text-red-600 tabular-nums"}>
                      {signedQty(r.qty)}
                    </div>
                    <div className="text-xs text-ink-muted tabular-nums" title="Miktar × parti birim maliyeti; satış tutarı değildir">
                      maliyet {fmtMoney(Number(r.qty) * Number(r.unit_cost_try), "TRY")}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {res.count ? (
        <Pagination basePath={basePath} values={{ ...lp.values, ...keep }} page={lp.page} pageSize={lp.pageSize} total={res.count} noun="hareket" />
      ) : null}
    </Card>
  );
}

function signedQty(qty: number) {
  return `${qty > 0 ? "+" : "−"}${fmtInt(Math.abs(qty))}`;
}

/**
 * Hareketin belgeleri: satış, teslimat ve parti numarası (her biri kendi detay sayfasına bağlı).
 * Belge sonradan iptal edildiyse (satış/teslimat status = cancelled) çıkış ve giriş satırlarında
 * "İptal edildi" rozeti gösterilir; böylece iptal edilmiş satışın çıkışı gerçekleşmiş satış
 * gibi okunmaz (iptalin karşı hareketi ayrı satırda yer alır).
 */
function DocLinks({ row: r, inline = false }: { row: MovementRow; inline?: boolean }) {
  const saleCancelled = r.sales?.status === "cancelled" && r.movement_type === "sale_out";
  const deliveryCancelled = r.deliveries?.status === "cancelled" && (r.movement_type === "delivery_out" || r.movement_type === "delivery_in");
  return (
    <div className={inline ? "flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs" : "flex flex-col items-start gap-0.5 text-xs"}>
      {r.sale_id && r.sales ? (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <Link href={`/satislar/${r.sale_id}`} className="link">
            {r.sales.sale_no}
          </Link>
          {saleCancelled ? (
            <Badge tone="gray" icon={Ban} title="Satış sonradan iptal edildi; adet “Satış iptali iadesi” hareketiyle rafa döndü. Ciro/kâr oluşturmaz.">
              İptal edildi
            </Badge>
          ) : null}
        </span>
      ) : null}
      {r.delivery_id && r.deliveries ? (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <Link href={`/teslimatlar/${r.delivery_id}`} className="link">
            {r.deliveries.delivery_no}
          </Link>
          {deliveryCancelled ? (
            <Badge tone="gray" icon={Ban} title="Teslimat sonradan iptal edildi; karşı hareketi “Teslimat iptali” satırlarındadır.">
              İptal edildi
            </Badge>
          ) : null}
        </span>
      ) : null}
      {r.production_batches ? (
        <Link href={`/uretim/${r.batch_id}`} className={r.sale_id || r.deliveries ? "text-ink-muted hover:text-brand-600 hover:underline" : "link"}>
          {r.production_batches.batch_no}
        </Link>
      ) : null}
    </div>
  );
}
