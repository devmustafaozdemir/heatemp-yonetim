"use client";

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
      window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 5000);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 shadow-lg"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
