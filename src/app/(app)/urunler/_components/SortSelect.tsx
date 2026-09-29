"use client";

import { ArrowDownUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cx } from "@/components/ui";
import { hrefWith } from "@/lib/list-params";

export interface SortOption {
  /** "sütun:yön" (ör. "total_remaining:desc") */
  value: string;
  label: string;
}

/**
 * Sıralama seçimi. Tablo başlıklarıyla (SortTh) aynı URL anahtarlarını (sirala, yon) yazar;
 * diğer filtreler korunur, sayfa başa döner. Kart görünümünde (tablo başlığı olmayan dar
 * ekranlarda) sıralamanın tek yolu budur. Dar ekranda bulunduğu ızgara hücresini doldurur.
 */
export function SortSelect({
  basePath,
  values,
  options,
  sort,
  dir,
  scroll = true,
  className,
}: {
  basePath: string;
  values: Record<string, string>;
  options: SortOption[];
  sort: string | null;
  dir: "asc" | "desc";
  /** false: sekme içi listelerde sayfa başa kaymaz */
  scroll?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = `${sort}:${dir}`;

  return (
    <label className={cx("relative flex min-w-0 items-center", className)} title="Sıralama">
      <span className="sr-only">Sıralama</span>
      <ArrowDownUp className="pointer-events-none absolute left-2.5 size-3.5 text-ink-muted" aria-hidden />
      <select
        value={current}
        aria-busy={pending}
        onChange={(e) => {
          const [s, d] = e.target.value.split(":");
          startTransition(() => router.push(hrefWith(basePath, values, { sirala: s, yon: d, sayfa: null }), { scroll }));
        }}
        className="input input-sm w-full pr-7 pl-7 sm:w-auto sm:max-w-[15rem]"
      >
        {options.some((o) => o.value === current) ? null : <option value={current}>Özel sıralama</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
