"use client";

import { useEffect } from "react";

/**
 * URL'deki tek seferlik bir parametreyi (ör. ?islem=yeni) sayfa açıldıktan sonra
 * adres çubuğundan siler. Panel zaten açık başlatıldığı için görünüm değişmez; ama
 * panel kapatılıp sayfa yenilendiğinde tekrar açılmaz. Next.js, window.history
 * çağrılarını yönlendiriciyle eşitler (useSearchParams güncel kalır).
 */
export function DropParam({ name }: { name: string }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(name)) return;
    url.searchParams.delete(name);
    // Durum null verilir: Next.js kendi iç durumunu kopyalar ve URL'yi yönlendiriciye bildirir.
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [name]);
  return null;
}
