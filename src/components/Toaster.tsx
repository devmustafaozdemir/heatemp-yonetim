"use client";

import { CheckCircle2, X } from "lucide-react";
import { useEffect, useState } from "react";

const EVENT = "heatemp:toast";

/** Başarı bildirimi gösterir; formu içeren bileşen kaldırılsa bile görünür. */
export function notifySuccess(message: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: message }));
}

export function Toaster() {
  const [items, setItems] = useState<{ id: number; message: string }[]>([]);
  useEffect(() => {
    let seq = 0;
    const onToast = (e: Event) => {
      const id = ++seq;
      const message = (e as CustomEvent<string>).detail;
      setItems((xs) => [...xs, { id, message }]);
      window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 6000);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[70] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex items-start gap-2.5 rounded-md border border-chart-teal/30 bg-white px-3.5 py-3 text-[13px] text-ink shadow-(--shadow-pop)"
        >
          <CheckCircle2 className="mt-px size-4 shrink-0 text-chart-teal" aria-hidden />
          <span className="min-w-0 flex-1">{t.message}</span>
          <button
            type="button"
            onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}
            className="-m-1 rounded p-1 text-ink-muted hover:bg-canvas hover:text-ink"
            aria-label="Bildirimi kapat"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
