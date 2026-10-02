"use client";

import { ChevronRight, ChevronsDownUp, ChevronsUpDown, Search, Truck } from "lucide-react";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { BatchStatusBadge } from "@/components/status";
import { Badge, Button, cx, EmptyState, TableWrap } from "@/components/ui";
import { fmtDate, fmtInt, fmtMoney, fmtUnitMoney } from "@/lib/format";
import { useOpenDelivery } from "./DeliveryDrawer";
import type { ShelfGroup, ShelfKind } from "./types";

type SortKey = "name" | "value" | "qty" | "oldest";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Ürün adına göre" },
  { key: "value", label: "Maliyet değerine göre" },
  { key: "qty", label: "Adede göre" },
  { key: "oldest", label: "En eski önce" },
];

function pct(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

/**
 * Varyant bazında gruplu raf tablosu. Her varyant satırı genişletilerek parti
 * katmanları (FIFO sırasıyla) görülür; partiden /uretim/[id], varyanttan ürün sayfasına geçilir.
 */
export function ShelfTable({
  kind,
  groups,
  canDeliver = false,
  initialVariant,
}: {
  kind: ShelfKind;
  groups: ShelfGroup[];
  canDeliver?: boolean;
  initialVariant?: string;
}) {
  const openDelivery = useOpenDelivery();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initialVariant ? [initialVariant] : []));
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("name");

  const totals = useMemo(
    () =>
      groups.reduce(
        (a, g) => ({
          in_qty: a.in_qty + g.in_qty,
          out_qty: a.out_qty + g.out_qty,
          remaining: a.remaining + g.remaining,
          value_try: a.value_try + g.value_try,
          value_usd: a.value_usd + g.value_usd,
          layers: a.layers + g.layers.length,
        }),
        { in_qty: 0, out_qty: 0, remaining: 0, value_try: 0, value_usd: 0, layers: 0 },
      ),
    [groups],
  );
  // Satış değeri (liste fiyatıyla); sayfa fiyatları yükleyebildiyse sütun gösterilir.
  const hasSale = groups.some((g) => g.sale !== undefined);
  const saleTotals = useMemo(
    () =>
      groups.reduce(
        (a, g) =>
          g.sale
            ? {
                usd: a.usd + (g.sale.currency === "USD" ? g.sale.amount : 0),
                tryOnly: a.tryOnly + (g.sale.currency === "TRY" ? g.sale.amount : 0),
                try: a.try + (g.sale.try ?? 0),
                unconverted: a.unconverted || g.sale.try === null,
              }
            : a,
        { usd: 0, tryOnly: 0, try: 0, unconverted: false },
      ),
    [groups],
  );

  const visible = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    const list = needle
      ? groups.filter(
          (g) =>
            g.display_name.toLocaleLowerCase("tr").includes(needle) ||
            g.product_code.toLocaleLowerCase("tr").includes(needle) ||
            g.variant_code.toLocaleLowerCase("tr").includes(needle) ||
            g.layers.some(
              (l) => l.batch_no.toLocaleLowerCase("tr").includes(needle) || (l.delivery_no ?? "").toLocaleLowerCase("tr").includes(needle),
            ),
        )
      : groups;
    const sorted = [...list];
    if (sort === "value") sorted.sort((a, b) => b.value_try - a.value_try);
    else if (sort === "qty") sorted.sort((a, b) => b.remaining - a.remaining);
    else if (sort === "oldest")
      sorted.sort((a, b) => a.oldest.localeCompare(b.oldest) || a.display_name.localeCompare(b.display_name, "tr"));
    return sorted;
  }, [groups, q, sort]);

  const allOpen = visible.length > 0 && visible.every((g) => expanded.has(g.variant_id));
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const heatemp = kind === "heatemp";
  const showAction = heatemp && canDeliver && !!openDelivery;
  const labels = heatemp
    ? { date: "Rafa giriş", in: "Parti adedi", out: "Teslim edilen", rem: "Rafta", value: "Maliyet değeri (TL)" }
    : { date: "Teslimat", in: "Teslim edilen", out: "Satılan", rem: "Kalan", value: "Kalan değer (TL)" };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={heatemp ? "Ürün, kod veya parti no…" : "Ürün, kod, parti veya teslimat no…"}
            aria-label="Raf tablosunda ara"
            className="input input-sm pl-8"
          />
        </div>
        <label className="flex items-center gap-1.5">
          <span className="sr-only">Sıralama</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="input input-sm w-auto pr-8"
            aria-label="Sıralama"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(allOpen ? new Set() : new Set(visible.map((g) => g.variant_id)))}
          disabled={visible.length === 0}
        >
          {allOpen ? <ChevronsDownUp aria-hidden /> : <ChevronsUpDown aria-hidden />}
          {allOpen ? "Partileri gizle" : "Tüm partileri göster"}
        </Button>
        <span className="ml-auto text-xs whitespace-nowrap text-ink-muted" aria-live="polite">
          {fmtInt(visible.length)} varyant · {fmtInt(visible.reduce((s, g) => s + g.layers.length, 0))} parti katmanı
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Aramayla eşleşen varyant yok" compact>
          Arama metnini değiştirin veya temizleyin.
        </EmptyState>
      ) : (
        <TableWrap className="relative">
          <table className="table-base">
            <thead>
              <tr>
                <th>Ürün / varyant · parti</th>
                <th className="hidden sm:table-cell">{labels.date}</th>
                <th className="num hidden min-[87.5rem]:table-cell">{labels.in}</th>
                <th className="num hidden min-[87.5rem]:table-cell">{labels.out}</th>
                <th className="num hidden sm:table-cell">{labels.rem}</th>
                <th className="num hidden xl:table-cell">Birim maliyet (TL)</th>
                <th className="num">{labels.value}</th>
                {hasSale ? (
                  <th className="num hidden lg:table-cell" title="Kalan adet × satış (liste) fiyatı, KDV hariç; USD güncel kurla TL'ye çevrilir">
                    Satış değeri
                  </th>
                ) : null}
                {showAction ? (
                  <th className="hidden sm:table-cell">
                    <span className="sr-only">İşlem</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {visible.map((g) => {
                const open = expanded.has(g.variant_id);
                const shareText = pct(g.value_try, totals.value_try).toLocaleString("tr-TR", { maximumFractionDigits: 1 });
                return (
                  <Fragment key={g.variant_id}>
                    <tr className={cx(initialVariant === g.variant_id && "bg-brand-50/60")}>
                      <td className="min-w-[10rem] sm:min-w-[14rem] min-[87.5rem]:min-w-[19rem]">
                        <div className="flex items-start gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggle(g.variant_id)}
                            aria-expanded={open}
                            aria-label={`${g.display_name}: ${open ? "partileri gizle" : "partileri göster"}`}
                            className="-ml-1 rounded p-0.5 text-ink-muted hover:bg-canvas hover:text-ink"
                          >
                            <ChevronRight className={cx("size-4 transition-transform", open && "rotate-90")} aria-hidden />
                          </button>
                          <div className="min-w-0">
                            <Link href={`/urunler/${g.product_id}/varyant/${g.variant_id}?sekme=stok`} className="link">
                              {g.display_name}
                            </Link>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                              <span className="code hidden text-ink-muted sm:inline">{g.variant_code}</span>
                              <span>{fmtInt(g.layers.length)} parti</span>
                              <span className="sm:hidden">en eski {fmtDate(g.oldest)}</span>
                              {g.opening_qty > 0 ? (
                                <Badge tone="violet" title="Sistem öncesi stoktan gelen adet (üretim sayılmaz)">
                                  Açılış stoğu {fmtInt(g.opening_qty)}
                                </Badge>
                              ) : null}
                            </div>
                            {showAction ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="soft"
                                className="mt-2 sm:hidden"
                                onClick={() => openDelivery?.(g.variant_id)}
                                aria-label={`${g.display_name} için teslimat formunu aç`}
                                aria-haspopup="dialog"
                              >
                                <Truck aria-hidden />
                                Teslim et
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="hidden whitespace-nowrap sm:table-cell">
                        <span className="block text-[11px] text-ink-muted">en eski</span>
                        {fmtDate(g.oldest)}
                      </td>
                      <td className="num hidden min-[87.5rem]:table-cell">{fmtInt(g.in_qty)}</td>
                      <td className="num hidden min-[87.5rem]:table-cell">{fmtInt(g.out_qty)}</td>
                      <td className="num hidden font-semibold text-ink sm:table-cell">{fmtInt(g.remaining)}</td>
                      <td className="num hidden xl:table-cell">
                        <span className="block text-[11px] text-ink-muted">ort.</span>
                        {g.remaining > 0 ? fmtMoney(g.value_try / g.remaining, "TRY") : "—"}
                      </td>
                      <td className="num font-semibold text-ink" title={`Raf maliyet değerinin %${shareText}'i`}>
                        {fmtMoney(g.value_try, "TRY")}
                        <span className="block text-[11px] font-normal text-ink-muted">
                          <span className="sm:hidden">{fmtInt(g.remaining)} adet</span>
                          <span className="hidden sm:inline">{fmtMoney(g.value_usd, "USD")}</span> · %{shareText}
                        </span>
                      </td>
                      {hasSale ? (
                        <td className="num hidden lg:table-cell">
                          {g.sale ? (
                            <>
                              <span className="font-semibold text-ink">{fmtMoney(g.sale.amount, g.sale.currency)}</span>
                              {g.sale.currency === "USD" && g.sale.try !== null ? (
                                <span className="block text-[11px] text-ink-muted">≈ {fmtMoney(g.sale.try, "TRY")}</span>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-xs text-ink-muted">Fiyat yok</span>
                          )}
                        </td>
                      ) : null}
                      {showAction ? (
                        <td className="hidden text-right whitespace-nowrap sm:table-cell">
                          <Button
                            type="button"
                            size="sm"
                            variant="soft"
                            onClick={() => openDelivery?.(g.variant_id)}
                            aria-label={`${g.display_name} için teslimat formunu aç`}
                            aria-haspopup="dialog"
                          >
                            <Truck aria-hidden />
                            Teslim et
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                    {open
                      ? g.layers.map((l) => (
                          <tr key={l.layer_id} className="bg-canvas/50 text-[12.5px]">
                            <td className="min-w-[10rem] sm:min-w-[13rem]">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-6">
                                <Link className="link font-mono text-xs" href={`/uretim/${l.batch_id}`} title="Parti detayı">
                                  {l.batch_no}
                                </Link>
                                {l.opening ? <BatchStatusBadge status="completed" kind="opening" /> : null}
                                {l.delivery_id ? (
                                  <span className="text-xs text-ink-muted">
                                    ·{" "}
                                    <Link className="link font-mono text-xs" href={`/teslimatlar/${l.delivery_id}`} title="Teslimat detayı">
                                      {l.delivery_no}
                                    </Link>
                                  </span>
                                ) : null}
                                <span className="text-xs text-ink-muted sm:hidden">{fmtDate(l.date)}</span>
                              </div>
                            </td>
                            <td className="hidden whitespace-nowrap sm:table-cell">{fmtDate(l.date)}</td>
                            <td className="num hidden min-[87.5rem]:table-cell">{fmtInt(l.in_qty)}</td>
                            <td className="num hidden min-[87.5rem]:table-cell">{fmtInt(l.out_qty)}</td>
                            <td className="num hidden font-medium text-ink sm:table-cell">{fmtInt(l.remaining)}</td>
                            <td className="num hidden xl:table-cell">
                              {fmtUnitMoney(l.unit_cost_try, "TRY")}
                              <span className="block text-[11px] text-ink-muted">{fmtUnitMoney(l.unit_cost_usd, "USD")}</span>
                            </td>
                            <td className="num">
                              {fmtMoney(l.value_try, "TRY")}
                              <span className="block text-[11px] text-ink-muted sm:hidden">{fmtInt(l.remaining)} adet</span>
                              <span className="block text-[11px] text-ink-muted max-sm:hidden xl:hidden">
                                {fmtUnitMoney(l.unit_cost_try, "TRY")}/adet
                              </span>
                            </td>
                            {hasSale ? <td className="hidden lg:table-cell" /> : null}
                            {showAction ? <td className="hidden sm:table-cell" /> : null}
                          </tr>
                        ))
                      : null}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>
                  Toplam
                  {visible.length !== groups.length ? <span className="ml-1 text-xs font-normal text-ink-muted">(tüm raf)</span> : null}
                </td>
                <td className="hidden sm:table-cell" />
                <td className="num hidden min-[87.5rem]:table-cell">{fmtInt(totals.in_qty)}</td>
                <td className="num hidden min-[87.5rem]:table-cell">{fmtInt(totals.out_qty)}</td>
                <td className="num hidden sm:table-cell">{fmtInt(totals.remaining)}</td>
                <td className="num hidden xl:table-cell">
                  <span className="block text-[11px] font-normal text-ink-muted">ort.</span>
                  {totals.remaining > 0 ? fmtMoney(totals.value_try / totals.remaining, "TRY") : "—"}
                </td>
                <td className="num">
                  {fmtMoney(totals.value_try, "TRY")}
                  <span className="block text-[11px] font-normal text-ink-muted">
                    <span className="sm:hidden">{fmtInt(totals.remaining)} adet</span>
                    <span className="hidden sm:inline">{fmtMoney(totals.value_usd, "USD")}</span>
                  </span>
                </td>
                {hasSale ? (
                  <td className="num hidden lg:table-cell">
                    {saleTotals.unconverted ? "—" : fmtMoney(saleTotals.try, "TRY")}
                    <span className="block text-[11px] font-normal text-ink-muted">
                      {[saleTotals.usd > 0 ? fmtMoney(saleTotals.usd, "USD") : null, saleTotals.tryOnly > 0 ? fmtMoney(saleTotals.tryOnly, "TRY") : null]
                        .filter(Boolean)
                        .join(" + ") || "—"}
                    </span>
                  </td>
                ) : null}
                {showAction ? <td className="hidden sm:table-cell" /> : null}
              </tr>
            </tfoot>
          </table>
        </TableWrap>
      )}
      <p className="border-t border-line px-4 py-2.5 text-xs text-ink-muted">
        {heatemp
          ? "Partiler rafa giriş tarihine göre sıralıdır; teslimat en eski partiden başlar. USD değerleri parti kurlarıyla, bilgi amaçlıdır."
          : "Yalnız rafta kalan katmanlar listelenir. Satışlar en eski teslimat katmanından başlayarak düşer; tamamen satılan teslimatlar Teslimatlar ekranındadır."}
      </p>
    </div>
  );
}
