import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cx } from "@/components/ui";
import { hrefWith, PAGE_SIZES } from "@/lib/list-params";

/**
 * "Ürün durumu" tablosunun sayfalaması. Paylaşılan Pagination ile aynı görünüm; farkı bağlantıların
 * `#hash` taşıması: tablo sayfanın altında olduğundan sayfa/sayfa boyutu değişince görünüm sayfanın
 * başına değil tablonun başına gider (yeni sayfa ilk satırından okunur, sıralama/filtre gibi tablo
 * içinde kalınır).
 */
export function StockPagination({
  values,
  page,
  pageSize,
  total,
  noun,
  hash,
}: {
  values: Record<string, string>;
  page: number;
  pageSize: number;
  total: number;
  noun: string;
  /** Hedef öğenin id'si (ör. "urun-durumu") */
  hash: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const windowPages = Array.from(new Set([1, page - 1, page, page + 1, pages].filter((p) => p >= 1 && p <= pages))).sort((a, b) => a - b);
  const href = (overrides: Record<string, string | number | null>) => `${hrefWith("/", values, overrides)}#${hash}`;
  const link = (p: number) => href({ sayfa: p === 1 ? null : p });
  const btn = "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-medium";

  return (
    <nav aria-label="Sayfalama" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
      <p className="text-xs text-ink-muted">
        <span className="font-medium text-ink-soft tabular-nums">
          {start.toLocaleString("tr-TR")}–{end.toLocaleString("tr-TR")}
        </span>{" "}
        / {total.toLocaleString("tr-TR")} {noun}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 text-xs text-ink-muted">
          <span>Sayfa başına</span>
          {PAGE_SIZES.map((s) => (
            <Link
              key={s}
              href={href({ adet: s === 25 ? null : s, sayfa: null })}
              aria-current={s === pageSize ? "true" : undefined}
              className={cx(btn, "h-7 min-w-7", s === pageSize ? "bg-brand-50 text-brand-700" : "hover:bg-canvas")}
            >
              {s}
            </Link>
          ))}
        </div>
        {pages > 1 ? (
          <ul className="flex items-center gap-1">
            <li>
              {page > 1 ? (
                <Link
                  href={link(page - 1)}
                  className={cx(btn, "border border-line text-ink-soft hover:bg-canvas")}
                  aria-label="Önceki sayfa"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </Link>
              ) : (
                <span className={cx(btn, "border border-line text-ink-muted/50")} aria-hidden>
                  <ChevronLeft className="size-4" />
                </span>
              )}
            </li>
            {windowPages.map((p, i) => (
              <li key={p} className="flex items-center gap-1">
                {i > 0 && p - windowPages[i - 1] > 1 ? <span className="px-1 text-xs text-ink-muted">…</span> : null}
                <Link
                  href={link(p)}
                  aria-current={p === page ? "page" : undefined}
                  className={cx(btn, p === page ? "bg-brand-600 text-white" : "border border-line text-ink-soft hover:bg-canvas")}
                >
                  {p}
                </Link>
              </li>
            ))}
            <li>
              {page < pages ? (
                <Link
                  href={link(page + 1)}
                  className={cx(btn, "border border-line text-ink-soft hover:bg-canvas")}
                  aria-label="Sonraki sayfa"
                >
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              ) : (
                <span className={cx(btn, "border border-line text-ink-muted/50")} aria-hidden>
                  <ChevronRight className="size-4" />
                </span>
              )}
            </li>
          </ul>
        ) : null}
      </div>
    </nav>
  );
}
