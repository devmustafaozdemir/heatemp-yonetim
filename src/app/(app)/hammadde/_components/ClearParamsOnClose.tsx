"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * İçindeki pencere (Drawer/Modal) kapanınca adres çubuğundan verilen anahtarları
 * (ör. ?islem=giris&malzeme=…) siler. Böylece pencere kapatıldıktan sonra sayfa
 * yenilendiğinde yeniden açılmaz. Sunucuya istek atılmaz (history.replaceState;
 * Next.js yönlendiricisiyle eşitlenir).
 * `close` olayı kabarmadığı için yakalama (capture) aşamasında dinlenir.
 */
export function ClearParamsOnClose({ keys, children }: { keys: string[]; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const keyList = keys.join(",");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const names = keyList.split(",").filter(Boolean);
    const onClose = (e: Event) => {
      if (!(e.target instanceof HTMLDialogElement)) return;
      const url = new URL(window.location.href);
      let changed = false;
      for (const k of names) {
        if (url.searchParams.has(k)) {
          url.searchParams.delete(k);
          changed = true;
        }
      }
      if (changed) window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    };
    el.addEventListener("close", onClose, true);
    return () => el.removeEventListener("close", onClose, true);
  }, [keyList]);

  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  );
}
