import { PackageOpen } from "lucide-react";
import Link from "next/link";
import { Card, EmptyState, ErrorState, TableWrap } from "@/components/ui";
import { Pagination, SortTh } from "@/components/ui/list";
import { CostChange } from "@/components/status";
import type { AuthContext } from "@/lib/auth";
import { fmtDate, fmtInt, fmtMinutes, fmtMoney, fmtRate, fmtUnitMoney } from "@/lib/format";
import type { ListParams } from "@/lib/list-params";
import { load, type Loaded } from "@/lib/query";
import { redirectIfPageOutOfRange } from "./paging";
import type { CostPoint } from "./types";

export type BatchScope = { column: "product_id" | "variant_id"; value: string };

export const BATCH_SORTABLE = ["completed_at", "unit_cost_usd", "quantity"];

interface BatchRow {
  id: string;
  batch_no: string;
  variant_id: string;
  variant_name: string;
  variant_code: string;
  quantity: number;
  started_at: string;
  completed_at: string;
  unit_cost_usd: number;
  unit_cost_try: number;
  total_cost_try: number;
  unit_cost_usd_change_pct: number | null;
  prev_batch_no: string | null;
  fx_rate: number;
  estimated_minutes: number;
  actual_minutes: number | null;
  heatemp_remaining: number | null;
  note: string | null;
}

/** Grafik için tamamlanmış ÜRETİM partileri (açılış stoğu hariç), eskiden yeniye. */
export async function loadCostPoints(ctx: AuthContext, scope: BatchScope): Promise<Loaded<CostPoint[]>> {
  const res = await load(
    ctx.supabase
      .from("v_batches")
      .select("id, batch_no, variant_id, variant_name, completed_at, quantity, unit_cost_usd, unit_cost_try")
      .eq(scope.column, scope.value)
      .eq("status", "completed")
      .eq("kind", "production")
      .order("completed_at", { ascending: false })
      .limit(120)
      .returns<CostPoint[]>(),
  );
  return res.data ? { ...res, data: [...res.data].reverse() } : res;
}

/** Tamamlanmış üretim partileri: gerçekleşmiş parti maliyeti geçmişi (sayfalı). */
export async function BatchHistoryCard({
  ctx,
  scope,
  basePath,
  lp,
  keep,
  showVariant,
}: {
  ctx: AuthContext;
  scope: BatchScope;
  basePath: string;
  lp: ListParams;
  keep: Record<string, string>;
  showVariant: boolean;
}) {
  const res = await load(
    ctx.supabase
      .from("v_batches")
      .select(
        "id, batch_no, variant_id, variant_name, variant_code, quantity, started_at, completed_at, unit_cost_usd, unit_cost_try, total_cost_try, unit_cost_usd_change_pct, prev_batch_no, fx_rate, estimated_minutes, actual_minutes, heatemp_remaining, note",
        { count: "exact" },
      )
      .eq(scope.column, scope.value)
      .eq("status", "completed")
      .eq("kind", "production")
      .order(lp.sort ?? "completed_at", { ascending: lp.dir === "asc" })
      .order("batch_no", { ascending: lp.dir === "asc" })
      .range(lp.from, lp.to)
      .returns<BatchRow[]>(),
  );
  redirectIfPageOutOfRange(res.error, lp, basePath, keep);
  const values = { ...lp.values, ...keep };
  const sortProps = { sort: lp.sort, dir: lp.dir, basePath, values };
  const rows = res.data ?? [];

  return (
    <Card
      title="Tamamlanmış üretim partileri"
      description="Gerçekleşmiş parti maliyeti: üretim başlatıldığında tüketilen malzemelerin maliyeti partiye sabitlenir. Açılış stoğu bu listede yer almaz."
      padded={false}
      actions={res.count !== null ? <span className="text-xs text-ink-muted">{fmtInt(res.count)} parti</span> : null}
    >
      {res.error ? (
        <ErrorState message={res.error} compact />
      ) : rows.length === 0 ? (
        <EmptyState title="Tamamlanmış üretim partisi yok" compact>
          Üretim tamamlandığında gerçekleşmiş birim maliyet burada listelenir.
        </EmptyState>
      ) : (
        <TableWrap>
          <table className="table-base">
            <thead>
              <tr>
                <th>Parti</th>
                {showVariant ? <th>Varyant</th> : null}
                <SortTh label="Tamamlanma" column="completed_at" {...sortProps} />
                <SortTh label="Adet" column="quantity" align="right" {...sortProps} />
                <SortTh label="Birim maliyet (USD)" column="unit_cost_usd" align="right" {...sortProps} />
                <th className="num">Birim maliyet (TL)</th>
                <th className="num" title="Aynı varyantın bir önceki tamamlanmış partisine göre USD birim maliyet değişimi">
                  Değişim
                </th>
                <th className="num">Toplam (TL)</th>
                <th className="num" title="Üretim başlatıldığında sabitlenen USD/TRY kuru">Kur</th>
                <th className="num" title="Tahmini: birim süre × adet. Gerçekleşen: başlatma ile tamamlama arasında geçen süre.">
                  Süre
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td className="whitespace-nowrap">
                    <Link href={`/uretim/${b.id}`} className="link font-mono text-xs">
                      {b.batch_no}
                    </Link>
                  </td>
                  {showVariant ? (
                    <td className="whitespace-nowrap">
                      {b.variant_name} <span className="code text-ink-muted">{b.variant_code}</span>
                    </td>
                  ) : null}
                  <td className="whitespace-nowrap tabular-nums">{fmtDate(b.completed_at)}</td>
                  <td className="num">{fmtInt(b.quantity)}</td>
                  <td className="num font-semibold text-ink">{fmtUnitMoney(b.unit_cost_usd, "USD")}</td>
                  <td className="num">{fmtUnitMoney(b.unit_cost_try, "TRY")}</td>
                  <td className="num">
                    <CostChange pct={b.unit_cost_usd_change_pct} prev={b.prev_batch_no} />
                  </td>
                  <td className="num">{fmtMoney(b.total_cost_try, "TRY")}</td>
                  <td className="num">{fmtRate(b.fx_rate)}</td>
                  <td className="num">
                    <span className="text-xs text-ink-muted">Tahmini </span>
                    {fmtMinutes(b.estimated_minutes)}
                    <div className="text-xs text-ink-muted">Gerçekleşen {fmtMinutes(b.actual_minutes)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {res.count ? <Pagination basePath={basePath} values={values} page={lp.page} pageSize={lp.pageSize} total={res.count} noun="parti" /> : null}
    </Card>
  );
}

/** Açılış stoğu partileri: sistem öncesi mevcut mamul. Üretim sayılmaz, ayrı listelenir. */
export async function OpeningBatchesCard({ ctx, scope, showVariant }: { ctx: AuthContext; scope: BatchScope; showVariant: boolean }) {
  const res = await load(
    ctx.supabase
      .from("v_batches")
      .select("id, batch_no, variant_id, variant_name, variant_code, quantity, completed_at, unit_cost_usd, unit_cost_try, heatemp_remaining, note")
      .eq(scope.column, scope.value)
      .eq("kind", "opening")
      .order("completed_at", { ascending: false })
      .limit(50)
      .returns<BatchRow[]>(),
  );
  if (res.error) {
    return (
      <Card title="Açılış stoğu" icon={PackageOpen}>
        <ErrorState message={res.error} compact />
      </Card>
    );
  }
  const rows = res.data ?? [];
  if (rows.length === 0) return null;
  const qty = rows.reduce((a, r) => a + Number(r.quantity), 0);
  return (
    <Card
      title="Açılış stoğu"
      icon={PackageOpen}
      description="Sistem öncesi mevcut stok, girildiği birim maliyetle. Üretim sayılmaz; üretim maliyeti karşılaştırmalarına ve üretim harcamasına katılmaz."
      padded={false}
      actions={<span className="text-xs text-ink-muted">{fmtInt(qty)} adet giriş</span>}
    >
      <TableWrap>
        <table className="table-base">
          <thead>
            <tr>
              <th>Açılış partisi</th>
              {showVariant ? <th>Varyant</th> : null}
              <th>Giriş tarihi</th>
              <th className="num">Adet</th>
              <th className="num">Birim maliyet (USD)</th>
              <th className="num">Birim maliyet (TL)</th>
              <th className="num" title="Bu açılış partisinden Heatemp rafında kalan adet">
                Heatemp&apos;te kalan
              </th>
              <th>Kaynak</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td className="whitespace-nowrap">
                  <Link href={`/uretim/${b.id}`} className="link font-mono text-xs">
                    {b.batch_no}
                  </Link>
                </td>
                {showVariant ? (
                  <td className="whitespace-nowrap">
                    {b.variant_name} <span className="code text-ink-muted">{b.variant_code}</span>
                  </td>
                ) : null}
                <td className="whitespace-nowrap tabular-nums">{fmtDate(b.completed_at)}</td>
                <td className="num">{fmtInt(b.quantity)}</td>
                <td className="num">{fmtUnitMoney(b.unit_cost_usd, "USD")}</td>
                <td className="num">{fmtUnitMoney(b.unit_cost_try, "TRY")}</td>
                <td className="num">{fmtInt(b.heatemp_remaining)}</td>
                <td className="max-w-72 min-w-40 text-xs text-ink-muted">{b.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}
