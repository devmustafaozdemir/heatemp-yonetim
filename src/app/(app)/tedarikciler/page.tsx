import { Handshake, Pencil, Plus, ShoppingCart, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, ErrorState, PageHeader, StatCard, TableWrap } from "@/components/ui";
import { Drawer } from "@/components/ui/dialog";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { Pagination, SortTh } from "@/components/ui/list";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtInt, fmtMoney } from "@/lib/format";
import { parseListParams, searchPattern, type SearchParams } from "@/lib/list-params";
import { load, redirectIfOutOfRange } from "@/lib/query";
import type { SupplierListRow } from "@/lib/types";
import { ContactLinks } from "../musteriler/_components/bits";
import { DropParam } from "../musteriler/_components/DropParam";
import { createSupplier, updateSupplier } from "./actions";
import { SupplierFields } from "./SupplierFields";

export const metadata: Metadata = { title: "Tedarikçiler" };

const BASE = "/tedarikciler";
const SORTABLE = ["name", "purchase_count", "total_try", "last_purchase_date"];

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireMember();
  const isAdmin = ctx.role === "admin";
  const lp = parseListParams(await searchParams, { sortable: SORTABLE, defaultSort: "name", defaultDir: "asc" });
  // ?islem=yeni yalnız "Tedarikçi ekle" panelini açar; liste filtresi değildir.
  const { islem, ...v } = lp.values;

  let query = ctx.supabase.from("v_supplier_list").select("*", { count: "exact" });
  const pattern = searchPattern(lp.q);
  if (pattern) {
    query = query.or(`name.ilike.${pattern},contact_name.ilike.${pattern},email.ilike.${pattern},tax_number.ilike.${pattern},phone.ilike.${pattern}`);
  }
  if (v.durum === "aktif") query = query.eq("is_active", true);
  else if (v.durum === "pasif") query = query.eq("is_active", false);

  const [res, all] = await Promise.all([
    load(
      query
        .order(lp.sort ?? "name", { ascending: lp.dir === "asc", nullsFirst: false })
        .order("name", { ascending: true })
        .range(lp.from, lp.to)
        .returns<SupplierListRow[]>(),
    ),
    load(ctx.supabase.from("v_supplier_list").select("is_active, purchase_count, total_try, total_usd, vat_try").returns<SupplierListRow[]>()),
  ]);
  redirectIfOutOfRange(res, lp, BASE);

  const rows = res.data ?? [];
  const summary = all.data ?? [];
  const netTry = summary.reduce((s, x) => s + Number(x.total_try), 0);
  const vatTry = summary.reduce((s, x) => s + Number(x.vat_try ?? 0), 0);
  const totalTry = netTry + vatTry;
  const totalUsd = summary.reduce((s, x) => s + Number(x.total_usd), 0);
  const purchases = summary.reduce((s, x) => s + Number(x.purchase_count), 0);
  const activeCount = summary.filter((x) => x.is_active).length;
  const sortProps = { sort: lp.sort, dir: lp.dir, basePath: BASE, values: v };
  const filtered = Object.keys(v).some((k) => !["sayfa", "adet", "sirala", "yon"].includes(k));

  return (
    <>
      <PageHeader
        title="Tedarikçiler"
        description="Hammadde aldığınız firmalar. Stok girişinde ve alış düzenlemede tedarikçi bu listeden seçilir."
        actions={
          isAdmin ? (
            <Drawer
              trigger={
                <>
                  <Plus aria-hidden />
                  Tedarikçi ekle
                </>
              }
              title="Yeni tedarikçi"
              description="Kaydettikten sonra hammadde stok girişinde seçilebilir."
              size="md"
              defaultOpen={islem === "yeni"}
            >
              <ActionForm action={createSupplier} resetOnSuccess>
                <SupplierFields />
                <div className="mt-5 flex justify-end border-t border-line pt-4">
                  <SubmitButton>Tedarikçiyi ekle</SubmitButton>
                </div>
              </ActionForm>
            </Drawer>
          ) : null
        }
      />
      {islem ? <DropParam name="islem" /> : null}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        <StatCard
          label="Tedarikçi"
          value={fmtInt(summary.length)}
          unit="firma"
          icon={Handshake}
          tone="brand"
          description={`${fmtInt(activeCount)} aktif · ${fmtInt(summary.length - activeCount)} pasif`}
          error={all.error}
        />
        <StatCard
          label="Toplam ödenen"
          value={fmtMoney(totalTry, "TRY")}
          icon={Wallet}
          tone="amber"
          description={`KDV dahil · KDV ${fmtMoney(vatTry, "TRY")} · KDV hariç USD ${fmtMoney(totalUsd, "USD")}`}
          error={all.error}
        />
        <StatCard
          label="Alış"
          value={fmtInt(purchases)}
          unit="kayıt"
          icon={ShoppingCart}
          tone="teal"
          description="Tedarikçi seçilerek yapılmış stok girişleri"
          error={all.error}
        />
      </div>

      <Card padded={false}>
        <ListToolbar
          basePath={BASE}
          values={v}
          total={res.count}
          noun="tedarikçi"
          search={{ placeholder: "Firma, yetkili, e-posta, VKN…" }}
          filters={[
            {
              key: "durum",
              label: "Durum",
              options: [
                { value: "aktif", label: "Aktif" },
                { value: "pasif", label: "Pasif" },
              ],
            },
          ]}
        />
        {res.error ? (
          <ErrorState message={res.error} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Handshake} title={filtered ? "Filtreye uyan tedarikçi yok" : "Henüz tedarikçi yok"}>
            {filtered ? "Arama veya filtreleri değiştirin." : isAdmin ? "“Tedarikçi ekle” düğmesiyle ilk tedarikçiyi ekleyin." : "Yönetici tedarikçi eklediğinde burada listelenir."}
          </EmptyState>
        ) : (
          <>
            <TableWrap className="hidden lg:block">
              <table className="table-base">
                <thead>
                  <tr>
                    <SortTh label="Tedarikçi" column="name" {...sortProps} />
                    <th>Yetkili ve iletişim</th>
                    <SortTh label="Alış" column="purchase_count" align="right" title="Stok girişi sayısı" {...sortProps} />
                    <SortTh label="Toplam ödenen (₺)" column="total_try" align="right" title="KDV dahil, alış günü kuruyla TL" {...sortProps} />
                    <SortTh label="Son alış" column="last_purchase_date" {...sortProps} />
                    {isAdmin ? <th aria-label="İşlemler" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((x) => (
                    <tr key={x.id}>
                      <td className="max-w-64 min-w-48">
                        <span className="font-medium break-words text-ink">{x.name}</span>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                          {x.tax_number ? (
                            <span>
                              VKN <span className="code text-ink-muted">{x.tax_number}</span>
                            </span>
                          ) : null}
                          {!x.is_active ? <Badge>Pasif</Badge> : null}
                        </div>
                      </td>
                      <td className="max-w-72 min-w-52 text-[12.5px]">
                        <div className="text-[13px] font-medium text-ink">
                          {x.contact_name ?? <span className="font-normal text-ink-muted">Yetkili belirtilmemiş</span>}
                        </div>
                        <ContactLinks phone={x.phone} email={x.email} className="mt-0.5 space-y-0.5" />
                      </td>
                      <td className="num">
                        {fmtInt(x.purchase_count)}
                        <div className="text-xs text-ink-muted">{fmtInt(x.material_count)} malzeme</div>
                      </td>
                      <td className="num">
                        <span className="font-semibold text-ink">{fmtMoney(Number(x.total_try) + Number(x.vat_try ?? 0), "TRY")}</span>
                        <div className="text-xs text-ink-muted">KDV {fmtMoney(x.vat_try ?? 0, "TRY")}</div>
                      </td>
                      <td className="whitespace-nowrap tabular-nums">
                        {x.last_purchase_date ? fmtDate(x.last_purchase_date) : <span className="text-xs text-ink-muted">Alış yok</span>}
                      </td>
                      {isAdmin ? (
                        <td className="text-right whitespace-nowrap">
                          <EditSupplier supplier={x} />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>

            <ul className="-mb-px grid grid-cols-1 md:grid-cols-2 lg:hidden">
              {rows.map((x) => (
                <li key={x.id} className="min-w-0 border-b border-line px-4 py-3.5 md:odd:border-r">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium break-words text-ink">{x.name}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {[x.contact_name, x.tax_number ? `VKN ${x.tax_number}` : null].filter(Boolean).join(" · ") || "Yetkili belirtilmemiş"}
                      </p>
                    </div>
                    {!x.is_active ? <Badge>Pasif</Badge> : null}
                  </div>
                  <ContactLinks phone={x.phone} email={x.email} className="mt-2 space-y-0.5 text-[12.5px]" />
                  <dl className="mt-3 grid grid-cols-3 gap-x-3 text-[13px]">
                    <div className="min-w-0">
                      <dt className="text-xs text-ink-muted">Toplam ödenen</dt>
                      <dd className="font-semibold text-ink tabular-nums">{fmtMoney(Number(x.total_try) + Number(x.vat_try ?? 0), "TRY")}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-ink-muted">Alış</dt>
                      <dd className="tabular-nums">{fmtInt(x.purchase_count)}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-ink-muted">Son alış</dt>
                      <dd className="tabular-nums">{x.last_purchase_date ? fmtDate(x.last_purchase_date) : "—"}</dd>
                    </div>
                  </dl>
                  {isAdmin ? (
                    <div className="mt-3">
                      <EditSupplier supplier={x} labelled />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
        {res.count ? <Pagination basePath={BASE} values={v} page={lp.page} pageSize={lp.pageSize} total={res.count} noun="tedarikçi" /> : null}
      </Card>
    </>
  );
}

function EditSupplier({ supplier, labelled = false }: { supplier: SupplierListRow; labelled?: boolean }) {
  return (
    <Drawer
      trigger={
        <>
          <Pencil aria-hidden />
          {labelled ? "Düzenle" : null}
        </>
      }
      triggerVariant={labelled ? "secondary" : "ghost"}
      triggerSize="sm"
      triggerLabel={labelled ? undefined : `${supplier.name}: düzenle`}
      title="Tedarikçiyi düzenle"
      description={supplier.name}
      size="md"
    >
      <ActionForm action={updateSupplier}>
        <input type="hidden" name="id" value={supplier.id} />
        <SupplierFields supplier={supplier} />
        <div className="mt-5 flex justify-end border-t border-line pt-4">
          <SubmitButton>Kaydet</SubmitButton>
        </div>
      </ActionForm>
    </Drawer>
  );
}
