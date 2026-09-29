"use client";

import { ArrowRight } from "lucide-react";
import Form from "next/form";
import { useState } from "react";
import { buttonClass, cx } from "@/components/ui";

/**
 * Özel tarih aralığı (Satış tarihi). "Uygula" ile ?bas&bit olur; hazır dönem (donem)
 * ve sayfa numarası kaldırılır, diğer filtreler gizli alanlarla korunur.
 * Tek uç da verilebilir (ör. yalnız başlangıç → o tarihten bugüne).
 */
export function CustomRangeForm({
  basePath,
  from,
  to,
  today,
  active,
  keep,
}: {
  basePath: string;
  from: string;
  to: string;
  today: string;
  active: boolean;
  keep: Record<string, string>;
}) {
  const [bas, setBas] = useState(from);
  const [bit, setBit] = useState(to);
  const invalid = (!bas && !bit) || (!!bas && !!bit && bas > bit) || (!!bit && bit > today);
  const inputCls = cx("input input-sm w-[9.25rem] tabular-nums", active && "border-brand-300 bg-brand-50/50");

  return (
    <Form action={basePath} scroll={false} className="flex flex-wrap items-center gap-1.5" aria-label="Özel satış tarihi aralığı">
      {Object.entries(keep).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input
        type="date"
        name="bas"
        value={bas}
        max={bit || today}
        onChange={(e) => setBas(e.target.value)}
        className={inputCls}
        aria-label="Satış tarihi başlangıç"
      />
      <span className="text-xs text-ink-muted" aria-hidden>
        –
      </span>
      <input
        type="date"
        name="bit"
        value={bit}
        min={bas || undefined}
        max={today}
        onChange={(e) => setBit(e.target.value)}
        className={inputCls}
        aria-label="Satış tarihi bitiş"
      />
      <button type="submit" disabled={invalid} className={buttonClass("secondary", "sm")}>
        Uygula
        <ArrowRight aria-hidden />
      </button>
    </Form>
  );
}
