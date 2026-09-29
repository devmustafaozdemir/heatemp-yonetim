"use client";

import { ArrowRight } from "lucide-react";
import Form from "next/form";
import { useState } from "react";
import { buttonClass, cx } from "@/components/ui";

/**
 * Özel tarih aralığı: iki tarih alanı ve "Uygula". Alanlar her zaman seçili dönemin
 * gerçek başlangıç/bitişini gösterir; değiştirilip uygulanınca ?donem=ozel&bas&bit olur.
 * Tablo filtreleri gizli alanlarla korunur.
 */
export function CustomRangeForm({
  from,
  to,
  today,
  active,
  keep,
}: {
  from: string;
  to: string;
  today: string;
  /** Özel aralık şu an seçili mi */
  active: boolean;
  /** Korunacak diğer URL parametreleri */
  keep: Record<string, string>;
}) {
  const [bas, setBas] = useState(from);
  const [bit, setBit] = useState(to);
  const invalid = !bas || !bit || bas > bit || bit > today;
  const inputCls = cx("input input-sm w-[9.5rem] tabular-nums", active && "border-brand-300 bg-brand-50/50");

  return (
    <Form action="/" scroll={false} className="flex flex-wrap items-center gap-1.5" aria-label="Özel tarih aralığı">
      <input type="hidden" name="donem" value="ozel" />
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
        aria-label="Başlangıç tarihi"
        required
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
        aria-label="Bitiş tarihi"
        required
      />
      <button type="submit" disabled={invalid} className={buttonClass("secondary", "sm")}>
        Uygula
        <ArrowRight aria-hidden />
      </button>
    </Form>
  );
}
