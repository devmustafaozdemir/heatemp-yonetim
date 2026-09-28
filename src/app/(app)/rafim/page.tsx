import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card, EmptyState, PageHeader, Stat, TableWrap } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtInt, fmtMoney, fmtUnitMoney, todayTr } from "@/lib/format";
import type { HeatempShelfRow } from "@/lib/types";
import { DeliverForm, type DeliverOption } from "./DeliverForm";

export const metadata: Metadata = { title: "Rafım (Heatemp)" };

export default async function HeatempShelfPage({ searchParams }: { searchParams: Promise<{ varyant?: string }> }) {
  const { varyant } = await searchParams;
  const ctx = await requireMember();
  const { data, error } = await ctx.supabase
    .from("v_heatemp_shelf")
    .select("*")
    .gt("qty_remaining", 0)
    .order("display_name")
    .order("received_on")
    .returns<HeatempShelfRow[]>();
  if (error) throw new Error("Raf bilgisi yüklenemedi.");
  const rows = data ?? [];

  const byVariant = new Map<string, { name: string; rows: HeatempShelfRow[] }>();
  for (const r of rows) {
    const g = byVariant.get(r.variant_id) ?? { name: r.display_name, rows: [] };
    g.rows.push(r);
    byVariant.set(r.variant_id, g);
  }
  const options: DeliverOption[] = Array.from(byVariant.entries()).map(([variant_id, g]) => ({
    variant_id,
    display_name: g.name,
    available: g.rows.reduce((s, r) => s + r.qty_remaining, 0),
    batches: g.rows.map((r) => ({ batch_id: r.batch_id, batch_no: r.batch_no, qty: r.qty_remaining, completed_on: r.received_on })),
  }));
  const totalQty = rows.reduce((s, r) => s + r.qty_remaining, 0);
  const totalTry = rows.reduce((s, r) => s + Number(r.value_try), 0);
  const totalUsd = rows.reduce((s, r) => s + Number(r.value_usd), 0);

  return (
    <>
      <PageHeader
        title="Rafım (Heatemp)"
        description="Tamamlanan üretim partileri buraya girer. Mekonsis'e teslimat bir satış değildir; ürün satılana kadar Heatemp'e aittir."
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Raftaki adet" value={fmtInt(totalQty)} />
        <Stat label="Raf maliyet değeri (TL)" value={fmtMoney(totalTry, "TRY")} />
        <Stat label="USD karşılığı (bilgi)" value={fmtMoney(totalUsd, "USD")} tone="muted" />
        <Stat label="Farklı varyant" value={fmtInt(byVariant.size)} />
      </div>

      {ctx.role === "admin" ? (
        <Card title="Mekonsis'e teslim et" description="Yeterli Heatemp stoğu kontrol edilir; parti kimliği Mekonsis rafında korunur. Ciro, tahsilat veya kâr oluşmaz." className="mb-6">
          {options.length === 0 ? (
            <Alert tone="info">Heatemp rafında teslim edilecek ürün yok.</Alert>
          ) : (
            <DeliverForm options={options} today={todayTr()} initialVariant={varyant} />
          )}
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="Heatemp rafı boş">Tamamlanan partiler burada görünür.</EmptyState>
      ) : (
        <Card title="Varyant ve parti bazında raf" padded={false}>
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Ürün / varyant</th>
                  <th>Parti</th>
                  <th>Tamamlanma</th>
                  <th className="num">Üretilen</th>
                  <th className="num">Teslim edilen</th>
                  <th className="num">Rafta</th>
                  <th className="num">Birim maliyet</th>
                  <th className="num">Raf maliyet değeri (TL)</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byVariant.entries()).map(([vid, g]) => (
                  <VariantGroup key={vid} name={g.name} rows={g.rows} />
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>Toplam</td>
                  <td className="num">{fmtInt(totalQty)}</td>
                  <td />
                  <td className="num">{fmtMoney(totalTry, "TRY")}</td>
                </tr>
              </tfoot>
            </table>
          </TableWrap>
        </Card>
      )}
    </>
  );
}

function VariantGroup({ name, rows }: { name: string; rows: HeatempShelfRow[] }) {
  const qty = rows.reduce((s, r) => s + r.qty_remaining, 0);
  const value = rows.reduce((s, r) => s + Number(r.value_try), 0);
  return (
    <>
      {rows.map((r, i) => (
        <tr key={r.layer_id}>
          <td>{i === 0 ? <span className="font-medium">{name}</span> : null}</td>
          <td>
            <Link className="link font-mono text-xs" href={`/uretim/${r.batch_id}`}>
              {r.batch_no}
            </Link>
          </td>
          <td className="text-xs">{fmtDate(r.received_on)}</td>
          <td className="num">{fmtInt(r.produced_qty)}</td>
          <td className="num">{fmtInt(r.delivered_qty)}</td>
          <td className="num font-medium">{fmtInt(r.qty_remaining)}</td>
          <td className="num">
            {fmtUnitMoney(r.unit_cost_usd, "USD")}
            <div className="text-xs text-slate-500">{fmtUnitMoney(r.unit_cost_try, "TRY")}</div>
          </td>
          <td className="num">{fmtMoney(r.value_try, "TRY")}</td>
        </tr>
      ))}
      {rows.length > 1 ? (
        <tr className="bg-slate-50/70">
          <td colSpan={5} className="text-right text-xs text-slate-500">
            {name} toplamı
          </td>
          <td className="num font-semibold">{fmtInt(qty)}</td>
          <td />
          <td className="num font-semibold">{fmtMoney(value, "TRY")}</td>
        </tr>
      ) : null}
    </>
  );
}
