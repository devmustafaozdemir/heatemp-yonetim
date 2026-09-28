import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, Muted, PageHeader, Stat, TableWrap, cx } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtMoney, fmtNum, fmtUnitMoney } from "@/lib/format";
import type { MaterialView, Unit } from "@/lib/types";
import { createMaterial } from "./actions";
import { MaterialFields } from "./MaterialForm";

export const metadata: Metadata = { title: "Hammadde" };

const FILTERS = [
  { key: "", label: "Tümü" },
  { key: "raw", label: "Hammadde" },
  { key: "component", label: "Komponent" },
];

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<{ tur?: string }> }) {
  const { tur = "" } = await searchParams;
  const ctx = await requireMember();
  let query = ctx.supabase.from("v_materials").select("*").order("name");
  if (tur === "raw" || tur === "component") query = query.eq("kind", tur);
  const [{ data: materials, error }, { data: units }] = await Promise.all([
    query.returns<MaterialView[]>(),
    ctx.supabase.from("units").select("*").order("sort_order").returns<Unit[]>(),
  ]);
  if (error) throw new Error("Malzemeler yüklenemedi.");
  const list = materials ?? [];
  const totalTry = list.reduce((s, m) => s + Number(m.value_try), 0);
  const totalUsd = list.reduce((s, m) => s + Number(m.value_usd), 0);

  return (
    <>
      <PageHeader
        title="Hammadde ve komponentler"
        description="Rafta bulunan, henüz ürüne monte edilmemiş tüm malzemeler gerçek miktar ve maliyet değeriyle izlenir. Değerleme: hareketli ağırlıklı ortalama; her alış kendi günündeki kurla TL ve USD olarak kaydedilir."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Stok değeri (TL, tarihsel)" value={fmtMoney(totalTry, "TRY")} />
        <Stat label="USD karşılığı (bilgi)" value={fmtMoney(totalUsd, "USD")} tone="muted" />
        <Stat label="Malzeme sayısı" value={fmtNum(list.length)} />
        <Stat label="Stoğu biten" value={fmtNum(list.filter((m) => Number(m.qty) === 0).length)} />
      </div>

      {ctx.role === "admin" ? (
        <Card title="Yeni malzeme" className="mb-6">
          <ActionForm action={createMaterial} resetOnSuccess>
            <MaterialFields units={units ?? []} />
            <div className="mt-4">
              <SubmitButton>Malzemeyi oluştur</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      ) : null}

      <div className="mb-3 flex gap-1">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key ? `/hammadde?tur=${f.key}` : "/hammadde"}
            className={cx(
              "rounded-md px-3 py-1.5 text-sm",
              tur === f.key ? "bg-slate-800 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState title="Malzeme yok">Yeni malzeme ekleyin; ardından alış kaydıyla stok girin.</EmptyState>
      ) : (
        <Card padded={false}>
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Kod</th>
                  <th>Malzeme</th>
                  <th>Tür</th>
                  <th className="num">Mevcut miktar</th>
                  <th className="num">Ort. maliyet (USD)</th>
                  <th className="num">Ort. maliyet (TL)</th>
                  <th className="num">Stok değeri (TL)</th>
                  <th className="num">Son alış</th>
                </tr>
              </thead>
              <tbody>
                {list.map((m) => (
                  <tr key={m.id} className={!m.is_active ? "opacity-60" : undefined}>
                    <td className="font-mono text-xs">{m.code}</td>
                    <td>
                      <Link href={`/hammadde/${m.id}`} className="link font-medium">
                        {m.name}
                      </Link>
                      {!m.is_active ? <Badge>Pasif</Badge> : null}
                    </td>
                    <td>{m.kind === "component" ? <Badge tone="blue">Komponent</Badge> : <Badge>Hammadde</Badge>}</td>
                    <td className="num">
                      {fmtNum(m.qty_display, 3)} {m.display_unit}
                      {m.display_unit !== m.base_unit ? (
                        <div className="text-xs text-slate-500">
                          {fmtNum(m.qty, 3)} {m.base_unit}
                        </div>
                      ) : null}
                    </td>
                    <td className="num">
                      {m.avg_cost_usd_display !== null ? (
                        <>
                          {fmtUnitMoney(m.avg_cost_usd_display, "USD")} <Muted>/ {m.display_unit}</Muted>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="num">
                      {m.avg_cost_try_display !== null ? (
                        <>
                          {fmtUnitMoney(m.avg_cost_try_display, "TRY")} <Muted>/ {m.display_unit}</Muted>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="num">{fmtMoney(m.value_try, "TRY")}</td>
                    <td className="num">{fmtDate(m.last_purchase_on)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
    </>
  );
}
