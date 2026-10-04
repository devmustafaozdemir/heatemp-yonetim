import { Banknote, Pencil, Plus, Shapes } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DeleteButton } from "@/components/DeleteButton";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, ErrorState, PageHeader, StatCard, TableWrap } from "@/components/ui";
import { Drawer } from "@/components/ui/dialog";
import { requireMember } from "@/lib/auth";
import { suggestFx } from "@/lib/fx/service";
import { fmtDate, fmtInt, fmtMoney, fmtRate } from "@/lib/format";
import { load } from "@/lib/query";
import type { Mold } from "@/lib/types";
import { createMold, deleteMold, updateMold } from "./actions";
import { MoldFields } from "./MoldFields";

export const metadata: Metadata = { title: "Kalıplar" };

export default async function MoldsPage() {
  const ctx = await requireMember();
  const isAdmin = ctx.role === "admin";
  const [molds, suppliers, products, fx] = await Promise.all([
    load(ctx.supabase.from("molds").select("*").order("is_active", { ascending: false }).order("name").returns<Mold[]>()),
    load(ctx.supabase.from("suppliers").select("id, name").order("name").returns<{ id: string; name: string }[]>()),
    load(ctx.supabase.from("products").select("id, code, name").order("name").returns<{ id: string; code: string; name: string }[]>()),
    suggestFx(ctx, null).catch(() => null),
  ]);

  const rows = molds.data ?? [];
  const supplierName = new Map((suppliers.data ?? []).map((s) => [s.id, s.name]));
  const productBy = new Map((products.data ?? []).map((p) => [p.id, p]));
  const totalUsd = rows.filter((m) => m.currency === "USD").reduce((s, m) => s + Number(m.price), 0);
  const totalTry = rows.filter((m) => m.currency === "TRY").reduce((s, m) => s + Number(m.price), 0);
  const rate = fx ? Number(fx.rate) : null;
  const grandTry = rate ? totalTry + totalUsd * rate : null;
  const activeCount = rows.filter((m) => m.is_active).length;
  const lists = { suppliers: suppliers.data ?? [], products: products.data ?? [] };

  return (
    <>
      <PageHeader
        title="Kalıplar"
        description="Kalıplar ve ücretleri. Kayıt amaçlıdır; ürün maliyetine ve stoğa etki etmez."
        actions={
          isAdmin ? (
            <Drawer
              trigger={
                <>
                  <Plus aria-hidden />
                  Kalıp ekle
                </>
              }
              title="Yeni kalıp"
              size="md"
            >
              <ActionForm action={createMold} resetOnSuccess>
                <MoldFields {...lists} />
                <div className="mt-5 flex justify-end border-t border-line pt-4">
                  <SubmitButton>Kalıbı ekle</SubmitButton>
                </div>
              </ActionForm>
            </Drawer>
          ) : null
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        <StatCard
          label="Kalıp"
          value={fmtInt(rows.length)}
          unit="adet"
          icon={Shapes}
          tone="brand"
          description={`${fmtInt(activeCount)} kullanımda · ${fmtInt(rows.length - activeCount)} kullanım dışı`}
          error={molds.error}
        />
        <StatCard
          label="Toplam kalıp ücreti"
          value={
            grandTry !== null
              ? fmtMoney(grandTry, "TRY")
              : [totalUsd ? fmtMoney(totalUsd, "USD") : null, totalTry ? fmtMoney(totalTry, "TRY") : null].filter(Boolean).join(" + ") ||
                "—"
          }
          icon={Banknote}
          tone="amber"
          description={
            <>
              {[totalUsd ? fmtMoney(totalUsd, "USD") : null, totalTry ? fmtMoney(totalTry, "TRY") : null].filter(Boolean).join(" + ") ||
                "Kayıt yok"}
              {rate && totalUsd ? ` · USD/TRY ${fmtRate(rate)} (güncel kurla)` : ""}
            </>
          }
          error={molds.error}
        />
      </div>

      <Card padded={false}>
        {molds.error ? (
          <ErrorState message={molds.error} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Shapes} title="Henüz kalıp yok">
            {isAdmin ? "“Kalıp ekle” düğmesiyle kalıp ve ücretini girin." : "Yönetici kalıp eklediğinde burada listelenir."}
          </EmptyState>
        ) : (
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Kalıp</th>
                  <th className="hidden md:table-cell">İlgili ürün</th>
                  <th className="hidden md:table-cell">Tedarikçi</th>
                  <th className="hidden sm:table-cell">Alış tarihi</th>
                  <th className="num">Ücret</th>
                  {isAdmin ? <th aria-label="İşlemler" /> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const p = m.product_id ? productBy.get(m.product_id) : null;
                  return (
                    <tr key={m.id} className={m.is_active ? undefined : "text-ink-muted"}>
                      <td className="min-w-44">
                        <span className="font-medium text-ink">{m.name}</span>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                          {m.code ? <span className="code">{m.code}</span> : null}
                          {!m.is_active ? <Badge>Kullanım dışı</Badge> : null}
                          {p ? <span className="md:hidden">{p.name}</span> : null}
                        </div>
                        {m.note ? (
                          <div className="mt-0.5 max-w-80 truncate text-xs text-ink-muted" title={m.note}>
                            {m.note}
                          </div>
                        ) : null}
                      </td>
                      <td className="hidden md:table-cell">
                        {p ? (
                          <Link href={`/urunler/${p.id}`} className="link">
                            {p.name}
                          </Link>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="hidden md:table-cell">
                        {m.supplier_id ? (supplierName.get(m.supplier_id) ?? "—") : <span className="text-ink-muted">—</span>}
                      </td>
                      <td className="hidden whitespace-nowrap sm:table-cell">{m.purchased_on ? fmtDate(m.purchased_on) : "—"}</td>
                      <td className="num font-semibold text-ink">
                        {fmtMoney(m.price, m.currency)}
                        {m.currency === "USD" && rate ? (
                          <span className="block text-[11px] font-normal text-ink-muted">≈ {fmtMoney(Number(m.price) * rate, "TRY")}</span>
                        ) : null}
                      </td>
                      {isAdmin ? (
                        <td className="text-right whitespace-nowrap">
                          <Drawer
                            trigger={<Pencil aria-hidden />}
                            triggerVariant="ghost"
                            triggerSize="sm"
                            triggerLabel={`${m.name}: düzenle`}
                            title="Kalıbı düzenle"
                            description={m.name}
                            size="md"
                          >
                            <ActionForm action={updateMold}>
                              <input type="hidden" name="id" value={m.id} />
                              <MoldFields mold={m} {...lists} />
                              <div className="mt-5 flex justify-end border-t border-line pt-4">
                                <SubmitButton>Kaydet</SubmitButton>
                              </div>
                            </ActionForm>
                          </Drawer>
                          <DeleteButton
                            action={deleteMold}
                            fields={{ id: m.id }}
                            title={`${m.name} silinsin mi?`}
                            label={`${m.name}: sil`}
                            compact
                          >
                            Kalıp kaydı kalıcı olarak silinir. Bu işlem geri alınamaz.
                          </DeleteButton>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
